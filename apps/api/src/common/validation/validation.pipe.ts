import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { ErrorCode } from '@staffos/shared';
import { AppException } from '../errors/app.exception';

/** Flattens nested class-validator errors into `{ "address.city": ["city must be a string"] }`. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      fields[path] = Object.values(error.constraints);
    }
    if (error.children?.length) {
      Object.assign(fields, flattenValidationErrors(error.children, path));
    }
  }
  return fields;
}

/** Global DTO validation: unknown fields are rejected, not silently dropped (CLAUDE.md §7). */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_FAILED,
        'Request validation failed.',
        { fields: flattenValidationErrors(errors) },
      ),
  });
}
