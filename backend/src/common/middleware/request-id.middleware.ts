import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';
/** A client-supplied id is accepted only if it looks harmless (no log injection). */
const VALID_ID = /^[A-Za-z0-9._-]{8,64}$/;

export type RequestWithId = Request & { requestId?: string };

/**
 * Gives every request an id (client X-Request-Id if valid, else a new UUID), echoes it in the
 * response header and — via AllExceptionsFilter — in error bodies and error logs, so a user's
 * error report can be matched to the server log.
 */
export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && VALID_ID.test(incoming)
      ? incoming
      : randomUUID();
  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}

/**
 * One access-log line per request: method, path WITHOUT the query string (it may hold
 * tokens), status, duration, request id. Request and response BODIES are never logged.
 */
export function accessLogMiddleware(logger = new Logger('HTTP')) {
  return (req: RequestWithId, res: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const path = (req.originalUrl ?? req.url).split('?')[0];
      logger.log(
        `${req.method} ${path} ${res.statusCode} ${ms.toFixed(0)}ms [${req.requestId ?? '-'}]`,
      );
    });
    next();
  };
}
