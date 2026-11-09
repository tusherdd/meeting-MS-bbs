/**
 * Avatar image checks and processing (SPEC.md §9.9). Pure functions — no disk access — so
 * they are unit-tested directly.
 */
import sharp from 'sharp';

export const AVATAR_SIZE = 512;
/** Rejects "decompression bombs" (tiny files that expand to huge images). */
export const MAX_INPUT_PIXELS = 40_000_000;

export type AvatarInputType = 'jpeg' | 'png' | 'webp';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Real file type from the first bytes ("magic bytes"). The browser's Content-Type and the file
 * name are ignored: both are chosen by the client and can lie.
 */
export function detectImageType(buffer: Buffer): AvatarInputType | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE))
    return 'png';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export class AvatarImageError extends Error {
  constructor(readonly reason: 'type' | 'unreadable') {
    super(reason);
  }
}

/**
 * Validates and re-encodes an uploaded photo into a 512×512 WebP:
 * 1. magic bytes must say JPEG/PNG/WebP;
 * 2. sharp must decode it as that same format (stops polyglot files);
 * 3. EXIF orientation is applied, then the image is re-encoded. sharp writes no metadata
 *    unless asked, so EXIF, GPS, ICC comments etc. are dropped.
 */
export async function processAvatar(input: Buffer): Promise<Buffer> {
  const declared = detectImageType(input);
  if (!declared) throw new AvatarImageError('type');

  const options = {
    limitInputPixels: MAX_INPUT_PIXELS,
    failOn: 'error' as const,
  };
  let format: string | undefined;
  try {
    format = (await sharp(input, options).metadata()).format;
  } catch {
    throw new AvatarImageError('unreadable');
  }
  if (format !== declared) throw new AvatarImageError('type');

  try {
    return await sharp(input, options)
      .rotate() // honour EXIF orientation before the metadata is dropped
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AvatarImageError('unreadable');
  }
}
