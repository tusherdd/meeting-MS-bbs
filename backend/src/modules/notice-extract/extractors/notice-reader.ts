import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import type { NoticeExtraction } from '../notice-extract.types';
import { warning } from '../parse/notice-warnings';
import { AiExtractor } from './ai-extractor';
import type { NoticeFileInput } from './notice-extractor';
import { OcrExtractor } from './ocr-extractor';

/** Counts only (for the audit and the logs): never content, never the key. */
export interface NoticeReadMeta {
  /** The admin setting at the time of the request. */
  configuredMethod: 'OCR' | 'AI';
  /** What actually produced the result. */
  method: 'OCR' | 'AI';
  /** AI was configured but failed (or had no key): the local OCR was used. */
  fallback: boolean;
  /** The AI result came from the 1-hour cache. */
  cached: boolean;
  /** Time of the AI attempt (also when it failed); null when AI was not tried. */
  aiLatencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  /** Error class of a failed AI attempt (e.g. "APIConnectionTimeoutError"), never its message. */
  aiError: string | null;
}

export interface NoticeReadResult {
  extraction: NoticeExtraction;
  meta: NoticeReadMeta;
}

/**
 * Chooses the extractor from the admin setting (v1.21 part 2, SPEC.md §6.12–6.13):
 * - OCR (default): the local OcrExtractor;
 * - AI: the AiExtractor; on ANY error (no key, timeout, network, rate or spend limit, refusal,
 *   invalid JSON) the local OCR is used at once, with the warning AI_FALLBACK.
 * OCR errors are not caught here (the service answers 422 as before).
 */
@Injectable()
export class NoticeReader {
  private readonly logger = new Logger(NoticeReader.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly ai: AiExtractor,
    private readonly ocr: OcrExtractor,
  ) {}

  async read(file: NoticeFileInput): Promise<NoticeReadResult> {
    const configuredMethod = await this.settings.noticeExtractionMethod();
    const meta: NoticeReadMeta = {
      configuredMethod,
      method: 'OCR',
      fallback: false,
      cached: false,
      aiLatencyMs: null,
      inputTokens: 0,
      outputTokens: 0,
      aiError: null,
    };

    if (configuredMethod === 'AI') {
      const started = Date.now();
      try {
        const result = await this.ai.extract(file);
        meta.method = 'AI';
        meta.cached = result.cached;
        meta.aiLatencyMs = Date.now() - started;
        meta.inputTokens = result.inputTokens;
        meta.outputTokens = result.outputTokens;
        this.logger.log(
          `Notice AI extraction: success=true cached=${result.cached} latencyMs=${meta.aiLatencyMs} ` +
            `inputTokens=${result.inputTokens} outputTokens=${result.outputTokens}`,
        );
        return { extraction: result.extraction, meta };
      } catch (err) {
        meta.fallback = true;
        meta.aiLatencyMs = Date.now() - started;
        meta.aiError = errorName(err);
        // Only the error class and the time: never the message (it may echo the request).
        this.logger.warn(
          `Notice AI extraction: success=false error=${meta.aiError} latencyMs=${meta.aiLatencyMs}; using OCR`,
        );
      }
    }

    const extraction = await this.ocr.extract(file);
    if (meta.fallback)
      extraction.warnings = [warning('AI_FALLBACK'), ...extraction.warnings];
    return { extraction, meta };
  }
}

function errorName(err: unknown): string {
  if (err instanceof Error) {
    const name = err.constructor?.name || err.name;
    return /^[A-Za-z0-9_]{1,60}$/.test(name) ? name : 'Error';
  }
  return 'unknown';
}
