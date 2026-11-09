import { mkdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const AVATARS_SUBDIR = 'avatars';
/** Public URL prefix of UPLOAD_DIR (outside /api/v1). */
export const UPLOADS_URL_PREFIX = '/uploads';

/**
 * Absolute upload root. Refuses a folder inside src/ (SPEC.md §9.9: uploads are stored
 * outside the source tree).
 */
export function resolveUploadRoot(
  uploadDir: string,
  cwd = process.cwd(),
): string {
  const root = resolve(cwd, uploadDir);
  const src = resolve(cwd, 'src');
  const rel = relative(src, root);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error(`UPLOAD_DIR must be outside src/ (got ${root})`);
  }
  return root;
}

export function ensureUploadDirs(root: string): void {
  mkdirSync(join(root, AVATARS_SUBDIR), { recursive: true });
}

/**
 * Absolute path for a stored relative path, guaranteed to stay inside `root` (stops "../"
 * tricks even if a bad value ever reached the database).
 */
export function safeUploadPath(root: string, relativePath: string): string {
  const full = resolve(root, relativePath);
  if (!full.startsWith(root + sep)) {
    throw new Error('Upload path escapes the upload directory');
  }
  return full;
}
