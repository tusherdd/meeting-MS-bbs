import { Transform } from 'class-transformer';

/** Trims and lowercases an email field before validation. */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
