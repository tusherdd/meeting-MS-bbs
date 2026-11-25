import { dirname, join } from 'node:path';
import sharp from 'sharp';

/**
 * PDF reading for the notice extraction (v1.21, SPEC.md §6.12) with pdfjs-dist (legacy Node build,
 * pure JavaScript, no system tools):
 * - the text layer of the first pages;
 * - for image-only scans (CamScanner): the page's largest embedded image, taken from the operator
 *   list (pdfjs decodes it; no rendering). This is the light path: one image per page, no canvas;
 * - only when a page has no large image (vector text in a Bijoy font, mixed pages): the page is
 *   rendered with @napi-rs/canvas (prebuilt binary, no system packages).
 * The document is destroyed after use; nothing is written to disk.
 */

// pdfjs-dist ships ES modules only; import() keeps this CommonJS backend working (tsc keeps a real
// import(), SWC turns it into require(), which Node 24 supports for ES modules without top-level await).
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfDocument = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;
type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;

let pdfjs: Promise<PdfJs> | undefined;
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

/** Local pdfjs data folders (fonts, CMaps, decoders) — pdfjs never fetches anything. */
function pdfjsDir(sub: string): string {
  return `${join(dirname(require.resolve('pdfjs-dist/package.json')), sub)}/`;
}

/** Only the first pages carry the fields (title … distribution list). */
export const MAX_PDF_PAGES = 2;
/** Images smaller than this (logos, stamps, signatures) are not a scanned page. */
const MIN_PAGE_IMAGE_PIXELS = 500_000;
/** Upper bound for a decoded image (pdfjs refuses larger ones). */
const MAX_IMAGE_PIXELS = 60_000_000;
/** Width of a rendered page in pixels (~240 dpi on A4: enough for OCR, little memory). */
const RENDER_WIDTH_PX = 2000;
const OBJECT_WAIT_MS = 10_000;

export interface PdfContent {
  /** Text layer of the first pages, lines separated by "\n". */
  text: string;
  /** Number of pages read (at most MAX_PDF_PAGES). */
  pages: number;
}

type LoadingTask = ReturnType<PdfJs['getDocument']>;

async function openDocument(buffer: Buffer): Promise<LoadingTask> {
  const lib = await loadPdfJs();
  return lib.getDocument({
    // A copy: pdfjs takes ownership of (and may detach) the buffer it gets.
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    stopAtErrors: false,
    maxImageSize: MAX_IMAGE_PIXELS,
    verbosity: lib.VerbosityLevel.ERRORS,
    standardFontDataUrl: pdfjsDir('standard_fonts'),
    cMapUrl: pdfjsDir('cmaps'),
    cMapPacked: true,
    wasmUrl: pdfjsDir('wasm'),
  });
}

async function withDocument<T>(
  buffer: Buffer,
  task: (doc: PdfDocument) => Promise<T>,
): Promise<T> {
  const loading = await openDocument(buffer);
  try {
    return await task(await loading.promise);
  } finally {
    // Destroys the document and its (in-process) worker: frees all decoded pages and images.
    await loading.destroy().catch(() => undefined);
  }
}

async function pageText(page: PdfPage): Promise<string> {
  const content = await page.getTextContent();
  let out = '';
  for (const item of content.items) {
    if (!('str' in item)) continue;
    out += item.str;
    if (item.hasEOL) out += '\n';
  }
  return out;
}

/** The text layer of the first pages. */
export function readPdfText(buffer: Buffer): Promise<PdfContent> {
  return withDocument(buffer, async (doc) => {
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
    const parts: string[] = [];
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      try {
        parts.push(await pageText(page));
      } finally {
        page.cleanup();
      }
    }
    return { text: parts.join('\n'), pages };
  });
}

/** Decoded image as pdfjs hands it over (ImageKind: 1 = 1 bit gray, 2 = RGB, 3 = RGBA). */
interface DecodedImage {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
}

function isDecodedImage(value: unknown): value is DecodedImage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.width === 'number' &&
    typeof v.height === 'number' &&
    (v.data instanceof Uint8Array || v.data instanceof Uint8ClampedArray)
  );
}

function waitForObject(store: PdfPage['objs'], id: string): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), OBJECT_WAIT_MS);
    store.get(id, (obj: unknown) => {
      clearTimeout(timer);
      resolve(obj);
    });
  });
}

/** 1-bit rows (set bit = white, pdfjs convention) → 8-bit gray. */
function unpackBits(img: DecodedImage & { data: Uint8Array }): Buffer {
  const { width, height, data } = img;
  const rowBytes = Math.ceil(width / 8);
  const out = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byte = data[y * rowBytes + (x >> 3)];
      out[y * width + x] = byte & (0x80 >> (x & 7)) ? 255 : 0;
    }
  }
  return out;
}

async function toPng(img: DecodedImage): Promise<Buffer | null> {
  const { width, height, kind, data } = img;
  if (!data) return null;
  const pixels = width * height;
  let raw: Buffer;
  let channels: 1 | 3 | 4;
  if (kind === 1) {
    raw = unpackBits({
      ...img,
      data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    });
    channels = 1;
  } else if (data.length === pixels * 4) {
    raw = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    channels = 4;
  } else if (data.length === pixels * 3) {
    raw = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    channels = 3;
  } else {
    return null;
  }
  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

/** The largest embedded image of the page as PNG, or null when there is no page-sized one. */
async function largestImage(lib: PdfJs, page: PdfPage): Promise<Buffer | null> {
  const ops = await page.getOperatorList();
  let best: DecodedImage | null = null;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[] | null;
    let obj: unknown = null;
    if (fn === lib.OPS.paintImageXObject && typeof args?.[0] === 'string') {
      const id = args[0];
      obj = await waitForObject(
        id.startsWith('g_') ? page.commonObjs : page.objs,
        id,
      );
    } else if (fn === lib.OPS.paintInlineImageXObject) {
      obj = args?.[0] ?? null;
    }
    if (
      isDecodedImage(obj) &&
      obj.width * obj.height >= MIN_PAGE_IMAGE_PIXELS &&
      (!best || obj.width * obj.height > best.width * best.height)
    )
      best = obj;
  }
  return best ? toPng(best) : null;
}

/** Renders the page to PNG with @napi-rs/canvas (only for pages without a scanned image). */
async function renderPage(page: PdfPage): Promise<Buffer> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, RENDER_WIDTH_PX / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    // @napi-rs/canvas implements the 2D canvas API pdfjs needs; its types are its own.
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  return canvas.encode('png');
}

/**
 * One PNG per page (first MAX_PDF_PAGES pages) for OCR: the embedded scan when there is one,
 * otherwise the rendered page.
 */
export function readPdfPageImages(buffer: Buffer): Promise<Buffer[]> {
  return withDocument(buffer, async (doc) => {
    const lib = await loadPdfJs();
    const images: Buffer[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES); n++) {
      const page = await doc.getPage(n);
      try {
        const image = await largestImage(lib, page).catch(() => null);
        images.push(image ?? (await renderPage(page)));
      } finally {
        page.cleanup();
      }
    }
    return images;
  });
}
