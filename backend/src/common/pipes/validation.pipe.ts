import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

/**
 * Flattens class-validator errors into a list of messages. The built-in English message for
 * a forbidden (non-whitelisted) field is replaced by a Bangla one; DTO messages are Bangla
 * already.
 */
export function validationMessages(
  errors: ValidationError[],
  parentPath = '',
): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    for (const [constraint, message] of Object.entries(
      error.constraints ?? {},
    )) {
      messages.push(
        constraint === 'whitelistValidation'
          ? `"${path}" ফিল্ডটি এখানে পাঠানো বা পরিবর্তন করা যাবে না।`
          : message,
      );
    }
    if (error.children?.length) {
      messages.push(...validationMessages(error.children, path));
    }
  }
  return messages;
}

/** Global pipe (SPEC.md §9.6): whitelist + forbidNonWhitelisted + transform. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true, // strip unknown properties...
    forbidNonWhitelisted: true, // ...and reject the request if any were sent
    transform: true, // payloads become DTO instances (query strings → numbers etc.)
    exceptionFactory: (errors) =>
      new BadRequestException(validationMessages(errors)),
  });
}
