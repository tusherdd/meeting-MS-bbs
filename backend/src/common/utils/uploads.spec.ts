import { resolveUploadRoot, safeUploadPath } from './uploads';

describe('upload paths', () => {
  it('accepts a folder outside src/ and rejects one inside', () => {
    expect(resolveUploadRoot('./uploads', '/app')).toBe('/app/uploads');
    expect(() => resolveUploadRoot('./src/uploads', '/app')).toThrow(
      /outside src/,
    );
    expect(() => resolveUploadRoot('./src', '/app')).toThrow(/outside src/);
  });

  it('keeps stored paths inside the upload root', () => {
    expect(safeUploadPath('/app/uploads', 'avatars/a.webp')).toBe(
      '/app/uploads/avatars/a.webp',
    );
    expect(() => safeUploadPath('/app/uploads', '../.env')).toThrow();
    expect(() => safeUploadPath('/app/uploads', '/etc/passwd')).toThrow();
  });
});
