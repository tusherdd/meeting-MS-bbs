import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { catchError, Observable, throwError } from 'rxjs';
import { ATTACHMENT_MESSAGES as MSG } from './attachments.messages';

/**
 * Put BEFORE FileInterceptor: turns multer's English errors into the attachment messages
 * (file larger than 10 MB → 413; more than one file or a wrong field name → 400).
 */
@Injectable()
export class AttachmentUploadErrorsInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof PayloadTooLargeException)
          return throwError(() => new PayloadTooLargeException(MSG.tooLarge));
        if (
          err instanceof HttpException &&
          /Unexpected field|Too many|Field name missing/.test(err.message)
        )
          return throwError(() => new BadRequestException(MSG.fileMissing));
        return throwError(() => err);
      }),
    );
  }
}
