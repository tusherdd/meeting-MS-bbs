import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync, type ReadStream } from 'node:fs';
import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { resolveUploadRoot, safeUploadPath } from '../../common/utils/uploads';
import { EnvVars } from '../../config/env.validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORED_NAME = /^[0-9a-f-]{36}\.(pdf|jpg|png)$/;

/** True when `inner` is `outer` or lies inside it. */
export function isInside(outer: string, inner: string): boolean {
  const rel = relative(outer, inner);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Private storage for meeting decision files (v1.11, SPEC.md §6.9):
 * DECISION_UPLOAD_DIR/<meetingId>/<random uuid>.<ext>. Never served statically: the folder
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

  private dir(meetingId: string): string {
    if (!UUID.test(meetingId)) throw new Error('Invalid meeting id');
    return join(this.root, meetingId);
  }

  private path(meetingId: string, storedName: string): string {
    if (!STORED_NAME.test(storedName)) throw new Error('Invalid stored name');
    return safeUploadPath(this.root, join(meetingId, storedName));
  }

  /** Writes the checked bytes under a random name and returns that name. */
  async save(
    meetingId: string,
    content: Buffer,
    extension: string,
  ): Promise<string> {
    await mkdir(this.dir(meetingId), { recursive: true, mode: 0o700 });
    const storedName = `${randomUUID()}${extension}`;
    await writeFile(this.path(meetingId, storedName), content, {
      flag: 'wx', // never overwrite
      mode: 0o600,
    });
    return storedName;
  }

  open(meetingId: string, storedName: string): ReadStream {
    return createReadStream(this.path(meetingId, storedName));
  }

  /** Deletes one file; a missing file is fine. */
  async remove(meetingId: string, storedName: string): Promise<void> {
    try {
      await unlink(this.path(meetingId, storedName));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT')
        this.logger.warn(
          `Could not delete a decision file (${code ?? 'error'})`,
        );
    }
  }

  /** Deletes the whole folder of a meeting (after a hard delete of the meeting). */
  async removeMeeting(meetingId: string): Promise<void> {
    try {
      await rm(this.dir(meetingId), { recursive: true, force: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      this.logger.warn(
        `Could not delete a decision folder (${code ?? 'error'})`,
      );
    }
  }
}

/** Shared by DecisionsModule and MeetingsModule (a meeting hard delete removes its files). */
@Module({
  providers: [DecisionStorageService],
  exports: [DecisionStorageService],
})
export class DecisionStorageModule {}
