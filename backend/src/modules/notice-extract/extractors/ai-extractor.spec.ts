import type Anthropic from '@anthropic-ai/sdk';
import type { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../../../config/env.validation';
import { AiReplyInvalidError } from '../ai/ai-reply';
import type { NoticeAiReply } from '../ai/notice-ai-schema';
import {
  AiExtractor,
  AiIncompleteReplyError,
  AiNotConfiguredError,
  type NoticeAiClient,
  type NoticeAiClientFactory,
} from './ai-extractor';
import type { NoticeFileInput } from './notice-extractor';

/** v1.21 part 2: the AI extractor with a fake SDK client (nothing is sent anywhere). */

const REPLY: NoticeAiReply = {
  title: 'অর্থনৈতিক শুমারি ২০২৩ শীর্ষক প্রকল্পের ICT Support Team এর সভা',
  date: '2026-11-10',
  startTime: '12:00',
  endTime: '12:45',
  startTimeAssumedAfternoon: false,
  venue: 'প্রকল্প পরিচালকের কক্ষ',
  agenda: 'ক) বিগত সভার সিদ্ধান্ত\nখ) বিবিধ',
  chairText: 'জনাব করিম উদ্দিন, প্রকল্প পরিচালক',
  distribution: [
    {
      name: 'রহিম আলী',
      designation: 'উপপরিচালক',
      wingOrOffice: 'আইসিটি উইং',
      isGroup: false,
    },
  ],
};

function message(text: string, stopReason = 'end_turn') {
  return {
    stop_reason: stopReason,
    content: [{ type: 'text', text }],
    usage: { input_tokens: 1200, output_tokens: 300 },
  };
}

function setup(opts: { key?: string; create?: jest.Mock } = {}) {
  const create =
    opts.create ?? jest.fn().mockResolvedValue(message(JSON.stringify(REPLY)));
  const client = { messages: { create } } as unknown as NoticeAiClient;
  const factory = jest.fn<NoticeAiClient, Parameters<NoticeAiClientFactory>>(
    () => client,
  );
  const values: Partial<EnvVars> = {
    ANTHROPIC_API_KEY: opts.key ?? 'test-key-placeholder',
    NOTICE_AI_MODEL: 'claude-haiku-5-5',
    NOTICE_AI_TIMEOUT_MS: 30_000,
  };
  const config = {
    get: (k: keyof EnvVars) => values[k],
  } as unknown as ConfigService<EnvVars, true>;
  return { extractor: new AiExtractor(config, factory), create, factory };
}

const PDF: NoticeFileInput = {
  type: 'pdf',
  content: Buffer.from('%PDF-1.7 fake notice'),
};

describe('AiExtractor', () => {
  it('returns the fields of a valid reply and sends only the notice', async () => {
    const { extractor, create, factory } = setup();
    const result = await extractor.extract(PDF);

    expect(result.cached).toBe(false);
    expect(result.inputTokens).toBe(1200);
    expect(result.outputTokens).toBe(300);
    expect(result.extraction.method).toBe('AI');
    expect(result.extraction.fields).toEqual({
      title: REPLY.title,
      date: '2026-11-10',
      startTime: '12:00',
      endTime: '12:45',
      venue: REPLY.venue,
      agenda: REPLY.agenda,
    });
    expect(result.extraction.participants[0]).toMatchObject({
      name: 'রহিম আলী',
      designation: 'উপপরিচালক',
      wing: 'আইসিটি উইং',
      isGroup: false,
    });

    expect(factory).toHaveBeenCalledWith({
      apiKey: 'test-key-placeholder',
      timeoutMs: 30_000,
    });
    const body = (
      create.mock.calls as unknown[][]
    )[0][0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.output_config?.format?.type).toBe('json_schema');
    // One document block (the PDF) + the instruction; nothing about officers.
    const content = body.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content[0].type).toBe('document');
    expect(content).toHaveLength(2);
  });

  it('throws on invalid JSON (the reader falls back to OCR)', async () => {
    const { extractor } = setup({
      create: jest.fn().mockResolvedValue(message('{not json')),
    });
    await expect(extractor.extract(PDF)).rejects.toBeInstanceOf(
      AiReplyInvalidError,
    );
  });

  it('throws on a reply of the wrong shape', async () => {
    const { extractor } = setup({
      create: jest
        .fn()
        .mockResolvedValue(message(JSON.stringify({ title: 'x' }))),
    });
    await expect(extractor.extract(PDF)).rejects.toBeInstanceOf(
      AiReplyInvalidError,
    );
  });

  it('throws on a refusal or a cut-off reply', async () => {
    const { extractor } = setup({
      create: jest.fn().mockResolvedValue(message('', 'refusal')),
    });
    await expect(extractor.extract(PDF)).rejects.toBeInstanceOf(
      AiIncompleteReplyError,
    );
  });

  it('is not configured without a key and never calls the SDK', async () => {
    const { extractor, create } = setup({ key: '' });
    expect(extractor.isConfigured()).toBe(false);
    await expect(extractor.extract(PDF)).rejects.toBeInstanceOf(
      AiNotConfiguredError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('serves the same file from the cache (sent to the AI only once)', async () => {
    const { extractor, create } = setup();
    const first = await extractor.extract(PDF);
    const second = await extractor.extract({
      type: 'pdf',
      content: Buffer.from(PDF.content),
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(second.cached).toBe(true);
    expect(second.inputTokens).toBe(0);
    expect(second.extraction).toEqual(first.extraction);
  });

  it('does not cache a failed reply', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce(message('{not json'))
      .mockResolvedValueOnce(message(JSON.stringify(REPLY)));
    const { extractor } = setup({ create });
    await expect(extractor.extract(PDF)).rejects.toThrow();
    const result = await extractor.extract(PDF);
    expect(result.cached).toBe(false);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
