import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { normalizeBanglaDeep } from '../utils/bangla';

/**
 * Global pipe, runs BEFORE the ValidationPipe (SPEC.md §13.13): every string in a request body
 * or query string (names, titles, agenda, notes, search text, ...) gets the Bangla nukta letters
 * in the stored form (normalizeBangla), so new data is always stored the same way and a search
 * typed with another form still matches. Password and token fields are never changed.
 */
@Injectable()
export class BanglaTextPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body' && metadata.type !== 'query') return value;
    return normalizeBanglaDeep(value, metadata.data ?? '');
  }
}
