import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AVATARS_SUBDIR,
  ensureUploadDirs,
  resolveUploadRoot,
  safeUploadPath,
} from '../../common/utils/uploads';
import { EnvVars } from '../../config/env.validation';

/**
 * Stores avatar files in UPLOAD_DIR/avatars/<random uuid>.webp. Only the relative path
 * ("avatars/<uuid>.webp") goes into the database; it is served at /uploads/<path>.
 */
@Injectable()
export class AvatarStorageService {
  private readonly logger = new Logger(AvatarStorageService.name);
  readonly root: string;

  constructor(config: ConfigService<EnvVars, true>) {
    this.root = resolveUploadRoot(config.get('UPLOAD_DIR', { infer: true }));
    ensureUploadDirs(this.root);
  }

  /** Writes the (already re-encoded) WebP and returns its relative path. */
  async save(webp: Buffer): Promise<string> {
    const relativePath = join(AVATARS_SUBDIR, `${randomUUID()}.webp`);
    // 'wx' = fail if it exists; with random names this never happens, but never overwrite.
    await writeFile(safeUploadPath(this.root, relativePath), webp, {
      flag: 'wx',
    });
    return relativePath;
  }

  /** Deletes a stored file; a missing file is fine (already gone). */
  async remove(relativePath: string | null): Promise<void> {
    if (!relativePath) return;
    try {
      await unlink(safeUploadPath(this.root, relativePath));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(`Could not delete avatar file (${code ?? 'error'})`);
      }
    }
  }
}
