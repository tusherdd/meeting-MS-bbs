import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { catchError, Observable, throwError } from 'rxjs';
import { EnvVars } from '../../config/env.validation';
import { PROFILE_MESSAGES } from '../../modules/profile/profile.messages';

/**
 * Put BEFORE FileInterceptor: turns multer's English errors (file too large, unexpected
 * field, too many files) into Bangla messages with the right status codes.
 */
@Injectable()
export class UploadErrorsInterceptor implements NestInterceptor {
  private readonly maxMb: number;

  constructor(config: ConfigService<EnvVars, true>) {
    this.maxMb = config.get('MAX_UPLOAD_MB', { infer: true });
  }

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof PayloadTooLargeException) {
          return throwError(
            () =>
              new PayloadTooLargeException(
                PROFILE_MESSAGES.photoTooLarge(this.maxMb),
              ),
          );
        }
        if (
          err instanceof HttpException &&
          /Unexpected field|Too many|Field name missing/.test(err.message)
        ) {
          return throwError(
            () => new BadRequestException(PROFILE_MESSAGES.photoTooManyFiles),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
