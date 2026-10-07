import {
  ArgumentMetadata,
  HttpStatus,
  Injectable,
  PipeTransform,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ErrorCode } from '@staffos/shared';
import type { z } from 'zod';
import { AppException } from '../errors/app.exception';
import { isZodDto } from './zod';

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

/** Maps Zod issues to the same `{ field: [messages] }` shape as class-validator errors. */
export function zodIssuesToFields(issues: readonly z.core.$ZodIssue[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  const add = (path: string, message: string) => {
    (fields[path || '_root'] ??= []).push(message);
  };
  for (const issue of issues) {
    const path = issue.path.map(String).join('.');
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) add(path ? `${path}.${key}` : key, 'Unknown field.');
    } else {
      add(path, issue.message);
    }
  }
  return fields;
}

export function validationFailed(fields: Record<string, string[]>): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.VALIDATION_FAILED,
    'Request validation failed.',
    { fields },
  );
}

/**
 * Global pipe: Zod DTOs (createZodDto) are parsed with their schema; classic class-validator
 * DTOs keep working. Unknown fields are rejected either way (CLAUDE.md §7).
 */
@Injectable()
export class AppValidationPipe implements PipeTransform {
  private readonly classValidator = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => validationFailed(flattenValidationErrors(errors)),
  });

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (isZodDto(metadata.metatype)) {
      const result = metadata.metatype.zodSchema.safeParse(value ?? {});
      if (!result.success) {
        throw validationFailed(zodIssuesToFields(result.error.issues));
      }
      return result.data;
    }
    return this.classValidator.transform(value, metadata);
  }
}
