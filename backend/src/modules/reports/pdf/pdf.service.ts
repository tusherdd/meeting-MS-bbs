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

/** Close the shared browser after this long without a render (it restarts on the next PDF). */
export const BROWSER_IDLE_CLOSE_MS = 5 * 60_000;

/**
 * HTML → A4 PDF with Puppeteer (SPEC.md §3: needed for correct Bangla shaping).
 * - One shared browser, launched lazily on the first PDF request (never at app start), reused
 *   by later renders, closed after BROWSER_IDLE_CLOSE_MS without renders and on shutdown.
 * - At most 2 renders at once, 30 s limit per render.
 * - JavaScript is disabled and EVERY network request is blocked: templates are self-contained
 *   (the Bangla font is embedded as a data: URL), so a report can never fetch anything.
 */
@Injectable()
export class PdfService implements OnApplicationShutdown {
  private readonly logger = new Logger(PdfService.name);
  private readonly slots = new Semaphore(MAX_CONCURRENT_RENDERS);
  private browser?: Promise<Browser>;
  /** Browsers we close on purpose (idle/shutdown): their "disconnected" is not a crash. */
  private readonly closedOnPurpose = new WeakSet<Browser>();
  private activeRenders = 0;
  private idleTimer?: NodeJS.Timeout;

  async render(html: string): Promise<Buffer> {
    this.activeRenders++;
    this.clearIdleTimer();
    try {
      return await this.slots.run(() => this.withTimeout(this.renderNow(html)));
    } finally {
      this.activeRenders--;
      if (this.activeRenders === 0) this.scheduleIdleClose();
    }
  }

  /**
   * Heights (CSS px) of every element carrying `attr`, in document order, laid out like print
   * at the given content width. Same browser, limits and safety settings as render(): the page's
   * own JavaScript stays off (the measuring runs through DevTools), every request is blocked.
   * Used to split report rows into pages before rendering (v1.14).
   */
  async measure(
    html: string,
    widthPx: number,
    attr: string,
  ): Promise<number[]> {
    if (!/^[a-z][a-z0-9-]*$/.test(attr)) throw new Error('Bad attribute name');
    this.activeRenders++;
    this.clearIdleTimer();
    try {
      return await this.slots.run(() =>
        this.withTimeout(this.measureNow(html, widthPx, attr)),
      );
    } finally {
      this.activeRenders--;
      if (this.activeRenders === 0) this.scheduleIdleClose();
    }
  }

  private async measureNow(
    html: string,
    widthPx: number,
    attr: string,
  ): Promise<number[]> {
    const page = await this.openPage(html, widthPx);
    try {
      const heights: unknown = await page.evaluate(
        `Array.from(document.querySelectorAll('[${attr}]'), (el) => el.getBoundingClientRect().height)`,
      );
      if (
        !Array.isArray(heights) ||
        !heights.every((h): h is number => typeof h === 'number')
      ) {
        throw new Error('Unexpected measure result');
      }
      return heights;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /** A new page with JavaScript off, all requests except data: URLs blocked, and the HTML loaded. */
  private async openPage(html: string, widthPx?: number) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (req.url().startsWith('data:')) void req.continue();
        else void req.abort();
      });
      if (widthPx) {
        await page.setViewport({ width: widthPx, height: 800 });
        await page.emulateMediaType('print');
      }
      await page.setContent(html, {
        waitUntil: 'load',
        timeout: RENDER_TIMEOUT_MS,
      });
      return page;
    } catch (err) {
      await page.close().catch(() => undefined);
      throw err;
    }
  }

  private async renderNow(html: string): Promise<Buffer> {
    const page = await this.openPage(html);
    try {
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

  /** Starts Chromium. Separate method so unit tests can replace it. */
  protected async launchBrowser(): Promise<Browser> {
    // Puppeteer is an ES module: loaded with a dynamic import (works in Node and in Jest with
    // --experimental-vm-modules) and only when the first PDF is requested.
    const { default: puppeteer } = await import('puppeteer');
    return puppeteer.launch({
      headless: true,
      // The Chrome sandbox stays ON. On Linux run the app as a normal user (not root).
      args: ['--font-render-hinting=none', '--disable-gpu'],
    });
  }

  private getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    const launching: Promise<Browser> = this.launchBrowser()
      .then((browser) => {
        browser.on('disconnected', () => {
          // Only forget it if it is still the current browser (a newer one may exist already).
          if (this.browser === launching) this.browser = undefined;
          // Expected after an idle/shutdown close; otherwise Chrome crashed and restarts on next use.
          if (!this.closedOnPurpose.has(browser)) {
            this.logger.warn(
              'PDF browser disconnected; it will be restarted on next use',
            );
          }
        });
        return browser;
      })
      .catch((err: unknown) => {
        if (this.browser === launching) this.browser = undefined;
        throw err;
      });
    this.browser = launching;
    return launching;
  }

  private scheduleIdleClose(): void {
    if (!this.browser) return;
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.activeRenders > 0) return;
      void this.closeBrowser().then((closed) => {
        if (closed) this.logger.log('PDF browser closed after idle time');
      });
    }, BROWSER_IDLE_CLOSE_MS);
    // The timer alone must never keep the process alive (tests, shutdown).
    this.idleTimer.unref();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  /** Closes the current browser (if any). Returns true when one was closed. */
  private async closeBrowser(): Promise<boolean> {
    const current = this.browser;
    if (!current) return false;
    this.browser = undefined;
    const browser = await current.catch(() => undefined);
    if (!browser) return false;
    this.closedOnPurpose.add(browser);
    await browser.close().catch(() => undefined);
    return true;
  }

  async onApplicationShutdown(): Promise<void> {
    this.clearIdleTimer();
    if (await this.closeBrowser()) this.logger.log('PDF browser closed');
  }
}
