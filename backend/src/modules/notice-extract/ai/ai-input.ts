import type Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';
import sharp from 'sharp';
import { MAX_IMAGE_PIXELS } from '../../decisions/decision-file';
import type { NoticeFileInput } from '../extractors/notice-extractor';

/** Images are reduced so the long side is at most this (enough to read, fewer tokens). */
export const AI_IMAGE_MAX_SIDE = 1600;

export class AiInputEmptyError extends Error {
  constructor() {
    super('Notice has no text');
    this.name = 'AiInputEmptyError';
  }
}

/**
 * The notice as content blocks for the AI (v1.21 part 2, SPEC.md §6.12): ONLY the notice, never
 * the officer list. PDF → document block; JPEG / PNG → downscaled JPEG image block; DOCX → its text.
 */
export async function noticeContentBlocks(
  file: NoticeFileInput,
): Promise<Anthropic.ContentBlockParam[]> {
  if (file.type === 'pdf') {
    return [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: file.content.toString('base64'),
        },
      },
    ];
  }
  if (file.type === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer: file.content });
    if (!value.trim()) throw new AiInputEmptyError();
    return [{ type: 'text', text: `<notice>\n${value}\n</notice>` }];
  }
  const image = await downscaleImage(file.content);
  return [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: image.toString('base64'),
      },
    },
  ];
}

/** Long side ≤ 1600 px (never enlarged), EXIF rotation applied, JPEG. */
export function downscaleImage(image: Buffer): Promise<Buffer> {
  return sharp(image, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({
      width: AI_IMAGE_MAX_SIDE,
      height: AI_IMAGE_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}
