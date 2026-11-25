import { APIConnectionTimeoutError, RateLimitError } from '@anthropic-ai/sdk';
import type { SettingsService } from '../../settings/settings.service';
import { AiReplyInvalidError } from '../ai/ai-reply';
import type { NoticeExtraction } from '../notice-extract.types';
import {
  AiNotConfiguredError,
  type AiExtractor,
  type AiExtractResult,
} from './ai-extractor';
import type { NoticeFileInput } from './notice-extractor';
import { NoticeReader } from './notice-reader';
import type { OcrExtractor } from './ocr-extractor';

/** v1.21 part 2: choosing AI or OCR, and the automatic OCR fallback. */

function extraction(method: 'OCR' | 'AI'): NoticeExtraction {
  return {
    method,
    fields: {
      title: 'সভা',
      date: null,
      startTime: null,
      endTime: null,
      venue: null,
      agenda: null,
    },
    chairText: null,
    participants: [],
    warnings: [{ code: 'DATE_NOT_FOUND', message: 'x' }],
  };
}

function setup(method: 'OCR' | 'AI', ai: jest.Mock) {
  const settings = {
    noticeExtractionMethod: jest.fn().mockResolvedValue(method),
  } as unknown as SettingsService;
  const ocrExtract = jest.fn().mockResolvedValue(extraction('OCR'));
  const ocr = { extract: ocrExtract } as unknown as OcrExtractor;
  const aiExtractor = { extract: ai } as unknown as AiExtractor;
  return { reader: new NoticeReader(settings, aiExtractor, ocr), ocrExtract };
}

const FILE: NoticeFileInput = { type: 'pdf', content: Buffer.from('%PDF') };

const aiOk = (): jest.Mock =>
  jest.fn().mockResolvedValue({
    extraction: extraction('AI'),
    cached: false,
    inputTokens: 1000,
    outputTokens: 200,
  } satisfies AiExtractResult);

describe('NoticeReader', () => {
  it('uses the local OCR when the setting is OCR (AI never called)', async () => {
    const ai = aiOk();
    const { reader, ocrExtract } = setup('OCR', ai);
    const { extraction: result, meta } = await reader.read(FILE);
    expect(result.method).toBe('OCR');
    expect(meta).toMatchObject({ method: 'OCR', fallback: false });
    expect(ai).not.toHaveBeenCalled();
    expect(ocrExtract).toHaveBeenCalledTimes(1);
  });

  it('uses the AI when the setting is AI', async () => {
    const { reader, ocrExtract } = setup('AI', aiOk());
    const { extraction: result, meta } = await reader.read(FILE);
    expect(result.method).toBe('AI');
    expect(meta).toMatchObject({
      method: 'AI',
      fallback: false,
      inputTokens: 1000,
      outputTokens: 200,
    });
    expect(result.warnings.some((w) => w.code === 'AI_FALLBACK')).toBe(false);
    expect(ocrExtract).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', new AiReplyInvalidError()],
    ['timeout', new APIConnectionTimeoutError()],
    ['no key', new AiNotConfiguredError()],
    [
      'rate limit',
      new RateLimitError(429, undefined, 'rate limited', new Headers()),
    ],
  ])('falls back to OCR on %s, with the warning', async (_label, error) => {
    const { reader, ocrExtract } = setup(
      'AI',
      jest.fn().mockRejectedValue(error),
    );
    const { extraction: result, meta } = await reader.read(FILE);
    expect(ocrExtract).toHaveBeenCalledTimes(1);
    expect(result.method).toBe('OCR');
    expect(result.warnings[0]).toEqual({
      code: 'AI_FALLBACK',
      message: 'AI ব্যবহার করা যায়নি, নিজস্ব OCR দিয়ে পড়া হয়েছে।',
    });
    expect(meta).toMatchObject({
      configuredMethod: 'AI',
      method: 'OCR',
      fallback: true,
    });
    // Only the error class, never a message.
    expect(meta.aiError).toMatch(/^[A-Za-z0-9_]+$/);
  });
});
