import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Lets controllers use the Zod schemas from packages/shared as DTO classes, so the API and the
 * web forms validate with exactly the same rules (CLAUDE.md §10):
 *
 *   class LoginDto extends createZodDto(loginSchema) {}
 *   login(@Body() body: LoginDto) { … }   // AppValidationPipe parses with loginSchema
 */
export type ZodDtoClass<S extends z.ZodType = z.ZodType> = {
  new (): z.output<S>;
  readonly zodSchema: S;
};

export function createZodDto<S extends z.ZodType>(schema: S): ZodDtoClass<S> {
  class ZodDto {
    static readonly zodSchema = schema;
  }
  return ZodDto as unknown as ZodDtoClass<S>;
}

export function isZodDto(metatype: unknown): metatype is ZodDtoClass {
  return (
    typeof metatype === 'function' &&
    'zodSchema' in metatype &&
    (metatype as ZodDtoClass).zodSchema instanceof z.ZodType
  );
}

type OpenApiSchema = Record<string, unknown>;

export function toOpenApiSchema(
  schema: z.ZodType,
  io: 'input' | 'output' = 'input',
): OpenApiSchema {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  }) as OpenApiSchema;
}

// Swagger's option types are deep unions; the generated JSON schema is structurally valid.
type SwaggerSchema = Parameters<typeof ApiOkResponse>[0] extends infer O
  ? O extends { schema?: infer S }
    ? S
    : never
  : never;

export const ApiZodBody = (schema: z.ZodType): MethodDecorator =>
  ApiBody({ schema: toOpenApiSchema(schema) as SwaggerSchema });

export const ApiZodOkResponse = (schema: z.ZodType, description?: string): MethodDecorator =>
  ApiOkResponse({ schema: toOpenApiSchema(schema, 'output') as SwaggerSchema, description });

/** Documents the common list parameters (api-contract.md §1.2). */
export const ApiListQuery = (filters: string[] = []): MethodDecorator =>
  applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number }),
    ApiQuery({ name: 'pageSize', required: false, type: Number }),
    ApiQuery({ name: 'sort', required: false, type: String, example: '-createdAt' }),
    ApiQuery({ name: 'search', required: false, type: String }),
    ...filters.map((f) => ApiQuery({ name: `filter[${f}]`, required: false, type: String })),
  );
