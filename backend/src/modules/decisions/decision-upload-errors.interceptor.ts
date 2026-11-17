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
import { DECISION_MESSAGES as MSG } from './decisions.messages';

/**
 * Put BEFORE FilesInterceptor: turns multer's English errors into the decision messages
 * (file larger than 10 MB → 413; more than 10 files or a wrong field → 400).
 */
@Injectable()
export class DecisionUploadErrorsInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof PayloadTooLargeException)
          return throwError(() => new PayloadTooLargeException(MSG.tooLarge));
        if (err instanceof HttpException && /Too many files/.test(err.message))
          return throwError(() => new BadRequestException(MSG.tooMany));
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
