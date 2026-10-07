import { loginSchema } from '@staffos/shared';
import { AppValidationPipe } from './validation.pipe';
import { createZodDto } from './zod';

class LoginDto extends createZodDto(loginSchema) {}

describe('AppValidationPipe with Zod DTOs', () => {
  const pipe = new AppValidationPipe();
  const meta = { type: 'body' as const, metatype: LoginDto };

  it('returns parsed (normalised) data', async () => {
    await expect(pipe.transform({ email: ' A@B.CO ', password: 'x' }, meta)).resolves.toEqual({
      email: 'a@b.co',
      password: 'x',
    });
  });

  it('reports field errors and unknown fields in the standard shape', async () => {
    await expect(pipe.transform({ email: 'nope', isAdmin: true }, meta)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        fields: {
          email: [expect.any(String)],
          password: [expect.any(String)],
          isAdmin: ['Unknown field.'],
        },
      },
    });
  });
});
