import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Worker } from 'tesseract.js';
import {
  OCR_IDLE_TERMINATE_MS,
  OCR_PAGE_TIMEOUT_MS,
  OcrEngineService,
  OcrTimeoutError,
  tessdataDir,
} from './ocr-engine.service';

class FakeWorker {
  terminated = false;
  constructor(private readonly hang: boolean) {}
  recognize = jest.fn(() =>
    this.hang
      ? new Promise<never>(() => undefined)
      : Promise.resolve({ data: { text: 'সভার নোটিশ' } }),
  );
  terminate = jest.fn(() => {
    this.terminated = true;
    return Promise.resolve({ jobId: 'x', data: null });
  });
}

/** No tesseract, no sharp: a fake worker and the image passed through. */
class TestOcrEngine extends OcrEngineService {
  readonly created: FakeWorker[] = [];
  nextHangs = false;
  protected prepare(image: Buffer): Promise<Buffer> {
    return Promise.resolve(image);
  }
  protected createOcrWorker(): Promise<Worker> {
    const worker = new FakeWorker(this.nextHangs);
    this.created.push(worker);
    return Promise.resolve(worker as unknown as Worker);
  }
}

/** Lets pending promise callbacks run (fake timers do not). */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('OcrEngineService (v1.21, SPEC.md §6.12)', () => {
  let engine: TestOcrEngine;

  beforeEach(() => {
    jest.useFakeTimers();
    engine = new TestOcrEngine();
  });

  afterEach(() => jest.useRealTimers());

  it('creates no worker until the first job', () => {
    expect(engine.created).toHaveLength(0);
  });

  it('creates the worker lazily once and reuses it', async () => {
    await expect(engine.recognize(Buffer.from('a'))).resolves.toBe(
      'সভার নোটিশ',
    );
    await engine.recognize(Buffer.from('b'));
    expect(engine.created).toHaveLength(1);
    expect(engine.created[0].recognize).toHaveBeenCalledTimes(2);
  });

  it('terminates the worker after idle time and creates a new one later', async () => {
    await engine.recognize(Buffer.from('a'));
    const first = engine.created[0];
    jest.advanceTimersByTime(OCR_IDLE_TERMINATE_MS - 1);
    await flush();
    expect(first.terminated).toBe(false);
    jest.advanceTimersByTime(1);
    await flush();
    expect(first.terminated).toBe(true);
    await engine.recognize(Buffer.from('b'));
    expect(engine.created).toHaveLength(2);
  });

  it('a page that takes longer than 60 s fails and kills the worker', async () => {
    engine.nextHangs = true;
    const job = engine.recognize(Buffer.from('a'));
    const check = expect(job).rejects.toBeInstanceOf(OcrTimeoutError);
    await jest.advanceTimersByTimeAsync(OCR_PAGE_TIMEOUT_MS);
    await check;
    expect(engine.created[0].terminated).toBe(true);
  });

  it('terminates the worker on shutdown', async () => {
    await engine.recognize(Buffer.from('a'));
    await engine.onApplicationShutdown();
    expect(engine.created[0].terminate).toHaveBeenCalledTimes(1);
  });
});

describe('tessdata in the repo', () => {
  it('has ben + eng traineddata (no download at runtime)', () => {
    const dir = tessdataDir();
    expect(existsSync(join(dir, 'ben.traineddata.gz'))).toBe(true);
    expect(existsSync(join(dir, 'eng.traineddata.gz'))).toBe(true);
  });
});
