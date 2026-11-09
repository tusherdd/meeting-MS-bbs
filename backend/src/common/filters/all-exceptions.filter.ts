import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STATUS_CODES } from 'node:http';
import type { Request, Response } from 'express';
import { EnvVars } from '../../config/env.validation';

/** Every error response from the API has exactly this shape. */
export interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  /**
   * Extra details a 4xx HttpException deliberately provides, e.g. `blocking` of a meeting
   * 409 (step 8). Never added for 5xx.
   */
  [detail: string]: unknown;
}

export const GENERIC_SERVER_ERROR_MESSAGE =
  'সার্ভারে একটি অপ্রত্যাশিত ত্রুটি হয়েছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।';

function statusText(status: number): string {
  return STATUS_CODES[status] ?? 'Error';
}

/**
 * Errors raised by Express middleware (e.g. body-parser: malformed JSON, payload too large)
 * are http-errors objects with `status` and `expose`. Only client errors marked `expose` are
 * safe to show as-is.
 */
function asExposedClientError(
  exception: unknown,
): { status: number; message: string } | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const candidate = exception as {
    status?: unknown;
    expose?: unknown;
    message?: unknown;
  };
  if (
    candidate.expose === true &&
    typeof candidate.status === 'number' &&
    candidate.status >= 400 &&
    candidate.status < 500
  ) {
    return {
      status: candidate.status,
      message:
        typeof candidate.message === 'string'
          ? candidate.message
          : statusText(candidate.status),
    };
  }
  return null;
}

/**
 * Pure mapping from any thrown value to the public error body.
 * In production, server errors (5xx) never reveal their real message (which may hold SQL,
 * file paths or stack details).
 */
export function toErrorBody(
  exception: unknown,
  isProduction: boolean,
): ErrorResponseBody {
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    let message: string | string[] = exception.message;
    let error = statusText(statusCode);
    let details: Record<string, unknown> = {};

    if (typeof response === 'string') {
      message = response;
    } else if (typeof response === 'object' && response !== null) {
      const {
        message: m,
        error: e,
        statusCode: _s,
        ...rest
      } = response as Record<string, unknown>;
      void _s;
      if (typeof m === 'string' || Array.isArray(m))
        message = m as string | string[];
      if (typeof e === 'string') error = e;
      // Client errors may carry structured details the API chose to send (never for 5xx).
      if (statusCode < 500) details = rest;
    }

    if (isProduction && statusCode >= 500) {
      message = GENERIC_SERVER_ERROR_MESSAGE;
      error = statusText(statusCode);
    }
    return { ...details, statusCode, message, error };
  }

  const clientError = asExposedClientError(exception);
  if (clientError) {
    return {
      statusCode: clientError.status,
      message: clientError.message,
      error: statusText(clientError.status),
    };
  }

  const statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  const devMessage =
    exception instanceof Error && exception.message
      ? exception.message
      : GENERIC_SERVER_ERROR_MESSAGE;
  return {
    statusCode,
    message: isProduction ? GENERIC_SERVER_ERROR_MESSAGE : devMessage,
    error: statusText(statusCode),
  };
}

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProduction: boolean;

  constructor(config: ConfigService<EnvVars, true>) {
    this.isProduction =
      config.get('NODE_ENV', { infer: true }) === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const body = toErrorBody(exception, this.isProduction);

    if (body.statusCode >= 500) {
      // Log method + path only: never the query string (may hold tokens) or the body (may hold passwords).
      const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
      const stack =
        exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(
        `${request.method} ${path} -> ${body.statusCode}`,
        stack,
      );
    }

    response.status(body.statusCode).json(body);
  }
}
