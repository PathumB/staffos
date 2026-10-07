import type { ValidationError } from '@nestjs/common';
import { flattenValidationErrors } from './validation.pipe';

function error(
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return { property, constraints, children };
}

describe('flattenValidationErrors', () => {
  it('maps top-level and nested errors to dotted paths', () => {
    const errors = [
      error('headcount', { min: 'headcount must not be less than 1' }),
      error('address', undefined, [error('city', { isString: 'city must be a string' })]),
    ];

    expect(flattenValidationErrors(errors)).toEqual({
      headcount: ['headcount must not be less than 1'],
      'address.city': ['city must be a string'],
    });
  });
});
