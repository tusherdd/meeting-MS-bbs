import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { MAX_IMAGE_PIXELS } from '../../decisions/decision-file';
import { Semaphore } from '../../reports/pdf/pdf.service';

/** Each page must be read within this time; then the worker is killed (frees its memory). */
export const OCR_PAGE_TIMEOUT_MS = 60_000;
/** Loading the language data must not take longer than this. */
export const OCR_INIT_TIMEOUT_MS = 60_000;
/** Terminate the worker after this long without a job (it starts again on the next one). */
export const OCR_IDLE_TERMINATE_MS = 2 * 60_000;
/** Bangla + English (English words appear in titles and agendas). */
export const OCR_LANGS = ['ben', 'eng'];

export class OcrTimeoutError extends Error {
  constructor() {
    super('OCR timeout');
  }
}

/**
 * backend/assets/tessdata (from src/ and from dist/), or dist/assets/tessdata when nest-cli copied
 * it. The traineddata ships in the repo (Apache-2.0, see its README): nothing is downloaded.
 */
export function tessdataDir(): string {
  const candidates = [
    join(__dirname, '..', '..', '..', 'assets', 'tessdata'),
    join(__dirname, '..', '..', '..', '..', 'assets', 'tessdata'),
  ];
  return (
    candidates.find((dir) => existsSync(join(dir, 'ben.traineddata.gz'))) ??
    candidates[1]
  );
}

/** Image → grayscale PNG of an OCR-friendly width (small scans enlarged, huge ones reduced). */
export async function prepareForOcr(image: Buffer): Promise<Buffer> {
  const input = sharp(image, { limitInputPixels: MAX_IMAGE_PIXELS });
  const { width = 0 } = await input.metadata();
  const target = Math.min(2480, Math.max(1600, width));
  return sharp(image, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .grayscale()
    .resize({ width: target })
    .normalise()
    .png()
    .toBuffer();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OcrTimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Local OCR with tesseract.js (WASM in a worker thread; no system tesseract), v1.21 SPEC.md §6.12.
 * Like the PDF browser (PdfService): one worker, created lazily on the first job (never at app
 * start), reused, terminated after OCR_IDLE_TERMINATE_MS without jobs and on shutdown. One job at a
 * time (memory: one WASM heap of ~150–250 MB while working, none when idle). A page that takes longer
 * than OCR_PAGE_TIMEOUT_MS kills the worker (the only way to stop tesseract) and fails.
 */
@Injectable()
export class OcrEngineService implements OnApplicationShutdown {
  private readonly logger = new Logger(OcrEngineService.name);
  private readonly slots = new Semaphore(1);
  private worker?: Promise<Worker>;
  private activeJobs = 0;
  private idleTimer?: NodeJS.Timeout;

  /** OCR text of one image (PNG / JPEG). */
  async recognize(image: Buffer): Promise<string> {
    this.activeJobs++;
    this.clearIdleTimer();
    try {
      return await this.slots.run(() => this.recognizeNow(image));
    } finally {
      this.activeJobs--;
      if (this.activeJobs === 0) this.scheduleIdleTerminate();
    }
  }

  private async recognizeNow(image: Buffer): Promise<string> {
    const prepared = await this.prepare(image);
    const worker = await this.getWorker();
    try {
      const result = await withTimeout(
        worker.recognize(prepared),
        OCR_PAGE_TIMEOUT_MS,
      );
      return result.data.text;
    } catch (err) {
      // Timeout or a crashed worker: start fresh next time.
      await this.terminate();
      throw err;
    }
  }

  /** Overridden in unit tests. */
  protected prepare(image: Buffer): Promise<Buffer> {
    return prepareForOcr(image);
  }

  /** Overridden in unit tests. */
  protected async createOcrWorker(): Promise<Worker> {
    const worker = await createWorker(OCR_LANGS, OEM.LSTM_ONLY, {
      langPath: tessdataDir(),
      gzip: true,
      // Never write a traineddata cache to the disk.
      cacheMethod: 'none',
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
      preserve_interword_spaces: '1',
    });
    return worker;
  }

  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      const created = withTimeout(this.createOcrWorker(), OCR_INIT_TIMEOUT_MS);
      this.worker = created;
      created.catch(() => {
        if (this.worker === created) this.worker = undefined;
      });
    }
    return this.worker;
  }

  private async terminate(): Promise<void> {
    const current = this.worker;
    this.worker = undefined;
    if (!current) return;
    try {
      await (await current).terminate();
    } catch (err) {
      this.logger.warn(
        `OCR worker terminate failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private scheduleIdleTerminate(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.activeJobs === 0) void this.terminate();
    }, OCR_IDLE_TERMINATE_MS);
    this.idleTimer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.clearIdleTimer();
    await this.terminate();
  }
}
