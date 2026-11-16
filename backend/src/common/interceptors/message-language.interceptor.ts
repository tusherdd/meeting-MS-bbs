import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import { requestLanguage, translateMessage } from '../i18n/translate';

/**
 * v1.6 (SPEC.md §13.14): a success body's top-level `message` (e.g. "Password বদলানো হয়েছে")
 * in the request's language, with its catalog `code`. Only plain JSON objects are touched:
 * files (PDF reports) and everything else pass through unchanged, and the data inside a
 * response (titles, names typed by users) is never translated.
 */
@Injectable()
export class MessageLanguageInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const lang = requestLanguage(request.headers);
    return next
      .handle()
      .pipe(map((body: unknown) => localizeSuccessBody(body, lang)));
  }
}

export function localizeSuccessBody(
  body: unknown,
  lang: Parameters<typeof translateMessage>[1],
): unknown {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    body instanceof StreamableFile ||
    Buffer.isBuffer(body)
  ) {
    return body;
  }
  const { message } = body as { message?: unknown };
  if (typeof message !== 'string') return body;
  const translated = translateMessage(message, lang);
  if (!translated.code) return body;
  return { ...body, message: translated.message, code: translated.code };
}
