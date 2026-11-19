import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync, type ReadStream } from 'node:fs';
import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { resolveUploadRoot, safeUploadPath } from '../../common/utils/uploads';
import { EnvVars } from '../../config/env.validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORED_NAME = /^[0-9a-f-]{36}\.(pdf|docx|jpg|png)$/;

/**
 * Which kind of file: minutes "সভা কার্যবিবরণী" live in <root>/<meetingId>/, the meeting notice
 * "সভার নোটিশ" (v1.13) in its own subfolder <root>/notices/<meetingId>/.
 */
export type FileArea = 'decisions' | 'notices';
const NOTICES_FOLDER = 'notices';

/** True when `inner` is `outer` or lies inside it. */
export function isInside(outer: string, inner: string): boolean {
  const rel = relative(outer, inner);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Private storage for meeting minutes files (v1.11, SPEC.md §6.9):
 * DECISION_UPLOAD_DIR/<meetingId>/<random uuid>.<ext>, and since v1.13 the meeting notice (§6.8):
 * DECISION_UPLOAD_DIR/notices/<meetingId>/<random uuid>.<ext>. Never served statically: the folder
 * must not lie inside (or contain) the public UPLOAD_DIR, which is served at /uploads. Folders
 * are created 0700 and files 0600 (only the app user). Names are random; no user input is ever
 * part of a path.
 */
@Injectable()
export class DecisionStorageService {
  private readonly logger = new Logger(DecisionStorageService.name);
  readonly root: string;

  constructor(config: ConfigService<EnvVars, true>) {
    this.root = resolveUploadRoot(
      config.get('DECISION_UPLOAD_DIR', { infer: true }),
    );
    const publicRoot = resolveUploadRoot(
      config.get('UPLOAD_DIR', { infer: true }),
    );
    if (isInside(publicRoot, this.root) || isInside(this.root, publicRoot)) {
      throw new Error(
        'DECISION_UPLOAD_DIR must not be inside or contain UPLOAD_DIR (served publicly at /uploads)',
      );
    }
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }

  /** Folder of one meeting, relative to the root (never user input). */
  private relDir(meetingId: string, area: FileArea): string {
    if (!UUID.test(meetingId)) throw new Error('Invalid meeting id');
    return area === 'notices' ? join(NOTICES_FOLDER, meetingId) : meetingId;
  }

  private path(meetingId: string, storedName: string, area: FileArea): string {
    if (!STORED_NAME.test(storedName)) throw new Error('Invalid stored name');
    return safeUploadPath(
      this.root,
      join(this.relDir(meetingId, area), storedName),
    );
  }

  /** Writes the checked bytes under a random name and returns that name. */
  async save(
    meetingId: string,
    content: Buffer,
    extension: string,
    area: FileArea = 'decisions',
  ): Promise<string> {
    await mkdir(join(this.root, this.relDir(meetingId, area)), {
      recursive: true,
      mode: 0o700,
    });
    const storedName = `${randomUUID()}${extension}`;
    await writeFile(this.path(meetingId, storedName, area), content, {
      flag: 'wx', // never overwrite
      mode: 0o600,
    });
    return storedName;
  }

  open(
    meetingId: string,
    storedName: string,
    area: FileArea = 'decisions',
  ): ReadStream {
    return createReadStream(this.path(meetingId, storedName, area));
  }

  /** Deletes one file; a missing file is fine. */
  async remove(
    meetingId: string,
    storedName: string,
    area: FileArea = 'decisions',
  ): Promise<void> {
    try {
      await unlink(this.path(meetingId, storedName, area));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT')
        this.logger.warn(
          `Could not delete a decision file (${code ?? 'error'})`,
        );
    }
  }

  /** Deletes the meeting's folders (minutes and notice) after a hard delete of the meeting. */
  async removeMeeting(meetingId: string): Promise<void> {
    for (const area of ['decisions', 'notices'] as const) {
      try {
        await rm(join(this.root, this.relDir(meetingId, area)), {
          recursive: true,
          force: true,
        });
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        this.logger.warn(
          `Could not delete a ${area} folder (${code ?? 'error'})`,
        );
      }
    }
  }
}

/** Shared by DecisionsModule and MeetingsModule (a meeting hard delete removes its files). */
@Module({
  providers: [DecisionStorageService],
  exports: [DecisionStorageService],
})
export class DecisionStorageModule {}
