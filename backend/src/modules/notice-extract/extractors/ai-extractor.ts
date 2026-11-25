import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { EnvVars } from '../../../config/env.validation';
import { noticeContentBlocks } from '../ai/ai-input';
import { aiReplyToExtraction, parseAiReply } from '../ai/ai-reply';
import { ExtractionCache } from '../ai/extraction-cache';
import {
  NOTICE_AI_SYSTEM_PROMPT,
  NOTICE_AI_USER_INSTRUCTION,
  NoticeAiReplySchema,
} from '../ai/notice-ai-schema';
import type { NoticeExtraction } from '../notice-extract.types';
import type { NoticeFileInput } from './notice-extractor';

/** The part of the SDK client we use (lets tests pass a fake). */
export type NoticeAiClient = Pick<Anthropic, 'messages'>;
export type NoticeAiClientFactory = (opts: {
  apiKey: string;
  timeoutMs: number;
}) => NoticeAiClient;

/** Optional Nest token to replace the SDK client (tests). */
export const NOTICE_AI_CLIENT_FACTORY = Symbol('NOTICE_AI_CLIENT_FACTORY');

/**
 * The SDK client: no retries (a failure falls back to the local OCR at once, so the wait stays
 * within NOTICE_AI_TIMEOUT_MS) and no SDK logging (nothing about the request reaches the logs).
 */
export const defaultAiClientFactory: NoticeAiClientFactory = ({
  apiKey,
  timeoutMs,
}) =>
  new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0, logLevel: 'off' });

/** Enough for a long distribution list. */
const MAX_TOKENS = 8000;

export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI not configured');
    this.name = 'AiNotConfiguredError';
  }
}

/** The AI stopped without a full answer (refusal, max_tokens, …). */
export class AiIncompleteReplyError extends Error {
  constructor(readonly stopReason: string | null) {
    super('AI reply incomplete');
    this.name = 'AiIncompleteReplyError';
  }
}

export interface AiExtractResult {
  extraction: NoticeExtraction;
  /** true = served from the cache (nothing was sent). */
  cached: boolean;
  inputTokens: number;
  outputTokens: number;
}

/**
 * The AI extractor (v1.21 part 2, SPEC.md §6.12): sends ONLY the notice to Anthropic (never the
 * officer list), asks for strict JSON (structured output, validated with zod) and returns the same
 * NoticeExtraction as the OCR extractor. Officer matching stays on our server. Errors are thrown;
 * the caller (NoticeReader) falls back to the local OCR. Never logs content or the key.
 */
@Injectable()
export class AiExtractor {
  readonly method = 'AI' as const;
  private readonly cache = new ExtractionCache();
  private client: NoticeAiClient | null = null;
  private clientKey: string | null = null;

  constructor(
    private readonly config: ConfigService<EnvVars, true>,
    @Optional()
    @Inject(NOTICE_AI_CLIENT_FACTORY)
    private readonly clientFactory: NoticeAiClientFactory | null = null,
  ) {}

  /** true when ANTHROPIC_API_KEY is set. */
  isConfigured(): boolean {
    return this.apiKey().length > 0;
  }

  async extract(file: NoticeFileInput): Promise<AiExtractResult> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new AiNotConfiguredError();
    const model = this.config.get('NOTICE_AI_MODEL', { infer: true });

    const cacheKey = `${model}:${createHash('sha256').update(file.content).digest('hex')}`;
    const hit = this.cache.get(cacheKey);
    if (hit)
      return { extraction: hit, cached: true, inputTokens: 0, outputTokens: 0 };

    const content = await noticeContentBlocks(file);
    const response = await this.getClient(apiKey).messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: NOTICE_AI_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            ...content,
            { type: 'text', text: NOTICE_AI_USER_INSTRUCTION },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(NoticeAiReplySchema) },
    });

    if (response.stop_reason !== 'end_turn')
      throw new AiIncompleteReplyError(response.stop_reason ?? null);
    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    const extraction = aiReplyToExtraction(parseAiReply(text));
    this.cache.set(cacheKey, extraction);
    return {
      extraction,
      cached: false,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  private apiKey(): string {
    const key = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    return typeof key === 'string' ? key.trim() : '';
  }

  /** One client per key (rebuilt only if the key changes, e.g. in tests). */
  private getClient(apiKey: string): NoticeAiClient {
    if (!this.client || this.clientKey !== apiKey) {
      const factory = this.clientFactory ?? defaultAiClientFactory;
      this.client = factory({
        apiKey,
        timeoutMs: this.config.get('NOTICE_AI_TIMEOUT_MS', { infer: true }),
      });
      this.clientKey = apiKey;
    }
    return this.client;
  }
}
