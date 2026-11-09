import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Browser } from 'puppeteer';

export const MAX_CONCURRENT_RENDERS = 2;
export const RENDER_TIMEOUT_MS = 30_000;

/** Small counting semaphore: at most `max` renders run at the same time; the rest wait. */
export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max)
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

/**
 * HTML → A4 PDF with Puppeteer (SPEC.md §3: needed for correct Bangla shaping).
 * - One browser for the whole app (started on first use, closed on shutdown).
 * - At most 2 renders at once, 30 s limit per render.
 * - JavaScript is disabled and EVERY network request is blocked: templates are self-contained
 *   (the Bangla font is embedded as a data: URL), so a report can never fetch anything.
 */
@Injectable()
export class PdfService implements OnApplicationShutdown {
  private readonly logger = new Logger(PdfService.name);
  private readonly slots = new Semaphore(MAX_CONCURRENT_RENDERS);
  private browser?: Promise<Browser>;
  private closing = false;

  async render(html: string): Promise<Buffer> {
    return this.slots.run(() => this.withTimeout(this.renderNow(html)));
  }

  private async renderNow(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (req.url().startsWith('data:')) void req.continue();
        else void req.abort();
      });
      await page.setContent(html, {
        waitUntil: 'load',
        timeout: RENDER_TIMEOUT_MS,
      });
      const pdf = await page.pdf({
        preferCSSPageSize: true, // size, margins and the "পৃষ্ঠা X / Y" footer come from @page CSS
        printBackground: true,
        timeout: RENDER_TIMEOUT_MS,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private async withTimeout<T>(work: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new ServiceUnavailableException(
              'পিডিএফ তৈরি করতে বেশি সময় লাগছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
            ),
          ),
        RENDER_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private getBrowser(): Promise<Browser> {
    // Puppeteer is an ES module: loaded with a dynamic import (works in Node and in Jest with
    // --experimental-vm-modules) and only when the first PDF is requested.
    this.browser ??= import('puppeteer')
      .then(({ default: puppeteer }) =>
        puppeteer.launch({
          headless: true,
          // The Chrome sandbox stays ON. On Linux run the app as a normal user (not root).
          args: ['--font-render-hinting=none', '--disable-gpu'],
        }),
      )
      .then((browser) => {
        browser.on('disconnected', () => {
          this.browser = undefined;
          // Expected while shutting down; otherwise Chrome crashed and restarts on next use.
          if (!this.closing) {
            this.logger.warn(
              'PDF browser disconnected; it will be restarted on next use',
            );
          }
        });
        return browser;
      })
      .catch((err: unknown) => {
        this.browser = undefined;
        throw err;
      });
    return this.browser;
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.browser) return;
    this.closing = true;
    const browser = await this.browser.catch(() => undefined);
    this.browser = undefined;
    await browser?.close().catch(() => undefined);
    this.logger.log('PDF browser closed');
  }
}
