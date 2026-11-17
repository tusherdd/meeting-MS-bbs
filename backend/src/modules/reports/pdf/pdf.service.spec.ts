import { EventEmitter } from 'node:events';
import type { Browser } from 'puppeteer';
import { BROWSER_IDLE_CLOSE_MS, PdfService, Semaphore } from './pdf.service';

/** Minimal stand-in for a Puppeteer browser: no real Chromium is started in unit tests. */
class FakeBrowser extends EventEmitter {
  closed = false;
  newPage = jest.fn(() =>
    Promise.resolve({
      setJavaScriptEnabled: jest.fn(() => Promise.resolve()),
      setRequestInterception: jest.fn(() => Promise.resolve()),
      on: jest.fn(),
      setContent: jest.fn(() => Promise.resolve()),
      pdf: jest.fn(() => Promise.resolve(new Uint8Array([37, 80, 68, 70]))),
      close: jest.fn(() => Promise.resolve()),
    }),
  );
  close = jest.fn(() => {
    this.closed = true;
    this.emit('disconnected');
    return Promise.resolve();
  });
}

class TestPdfService extends PdfService {
  readonly launched: FakeBrowser[] = [];
  protected launchBrowser(): Promise<Browser> {
    const browser = new FakeBrowser();
    this.launched.push(browser);
    return Promise.resolve(browser as unknown as Browser);
  }
}

describe('PdfService browser lifecycle', () => {
  afterEach(() => jest.useRealTimers());

  it('launches no browser until the first PDF is requested', () => {
    const service = new TestPdfService();
    expect(service.launched).toHaveLength(0);
  });

  it('launches lazily once and reuses the browser for later renders', async () => {
    const service = new TestPdfService();
    await service.render('<p>a</p>');
    await service.render('<p>b</p>');
    expect(service.launched).toHaveLength(1);
    expect(service.launched[0].newPage).toHaveBeenCalledTimes(2);
    await service.onApplicationShutdown();
  });

  it('closes the browser after idle time and relaunches on the next render', async () => {
    jest.useFakeTimers();
    const service = new TestPdfService();
    await service.render('<p>a</p>');
    const first = service.launched[0];

    jest.advanceTimersByTime(BROWSER_IDLE_CLOSE_MS - 1);
    expect(first.closed).toBe(false);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(first.closed).toBe(true);

    await service.render('<p>b</p>');
    expect(service.launched).toHaveLength(2);
    await service.onApplicationShutdown();
  });

  it('a new render resets the idle timer', async () => {
    jest.useFakeTimers();
    const service = new TestPdfService();
    await service.render('<p>a</p>');
    jest.advanceTimersByTime(BROWSER_IDLE_CLOSE_MS - 1000);
    await service.render('<p>b</p>');
    jest.advanceTimersByTime(BROWSER_IDLE_CLOSE_MS - 1000);
    await Promise.resolve();
    expect(service.launched[0].closed).toBe(false);
    await service.onApplicationShutdown();
  });

  it('closes the browser on shutdown (no orphan Chromium)', async () => {
    const service = new TestPdfService();
    await service.render('<p>a</p>');
    await service.onApplicationShutdown();
    expect(service.launched[0].close).toHaveBeenCalledTimes(1);
    // A second shutdown call is harmless.
    await service.onApplicationShutdown();
    expect(service.launched[0].close).toHaveBeenCalledTimes(1);
  });
});

describe('Semaphore (max concurrent PDF renders)', () => {
  it('never runs more than the limit at the same time', async () => {
    const limit = new Semaphore(2);
    let running = 0;
    let peak = 0;
    const task = () =>
      limit.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 10));
        running--;
        return 'ok';
      });
    const results = await Promise.all(Array.from({ length: 7 }, task));
    expect(results).toHaveLength(7);
    expect(peak).toBe(2);
  });

  it('releases the slot when a task fails', async () => {
    const limit = new Semaphore(1);
    await expect(
      limit.run(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(limit.run(() => Promise.resolve(1))).resolves.toBe(1);
  });
});
