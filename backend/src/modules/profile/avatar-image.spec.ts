import sharp from 'sharp';
import {
  AVATAR_SIZE,
  AvatarImageError,
  detectImageType,
  processAvatar,
} from './avatar-image';

/** A real 800×600 JPEG carrying EXIF with a secret description and GPS-like text. */
async function jpegWithExif(): Promise<Buffer> {
  return sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 200, g: 30, b: 30 },
    },
  })
    .jpeg()
    .withExif({
      IFD0: {
        ImageDescription: 'SECRET-GPS-23.8103N-90.4125E',
        Copyright: 'SECRET-OWNER',
      },
    })
    .toBuffer();
}

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP by their first bytes', async () => {
    const base = sharp({
      create: { width: 4, height: 4, channels: 3, background: '#000' },
    });
    expect(detectImageType(await base.clone().jpeg().toBuffer())).toBe('jpeg');
    expect(detectImageType(await base.clone().png().toBuffer())).toBe('png');
    expect(detectImageType(await base.clone().webp().toBuffer())).toBe('webp');
  });

  it('rejects text, GIF, SVG and empty buffers', () => {
    expect(detectImageType(Buffer.from('hello, I am a png'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a......'))).toBeNull();
    expect(
      detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('processAvatar', () => {
  it('produces a 512×512 WebP without any EXIF/GPS data', async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined(); // the input really has EXIF
    expect(input.includes('SECRET-GPS')).toBe(true);

    const output = await processAvatar(input);
    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({
      format: 'webp',
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
    });
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(output.includes('SECRET-GPS')).toBe(false);
    expect(output.includes('SECRET-OWNER')).toBe(false);
  });

  it('rejects a fake image (text with a .png name)', async () => {
    await expect(
      processAvatar(Buffer.from('not really an image')),
    ).rejects.toEqual(new AvatarImageError('type'));
  });

  it('rejects a file with JPEG magic bytes but garbage content', async () => {
    const fake = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(200, 7),
    ]);
    await expect(processAvatar(fake)).rejects.toBeInstanceOf(AvatarImageError);
  });
});
