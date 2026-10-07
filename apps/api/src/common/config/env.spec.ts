import { validateEnv } from './env';

const secrets = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('applies development defaults when only secrets are set', () => {
    const env = validateEnv(secrets);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      CORS_ORIGINS: ['http://localhost:5173'],
      MAIL_PROVIDER: 'console',
    });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('treats empty strings from .env as unset', () => {
    const env = validateEnv({
      ...secrets,
      DATABASE_URL: '',
      SWAGGER_ENABLED: '',
      MAIL_PROVIDER: '',
    });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.SWAGGER_ENABLED).toBeUndefined();
    expect(env.MAIL_PROVIDER).toBe('console');
  });

  it('parses a comma-separated CORS allow-list and booleans', () => {
    const env = validateEnv({
      ...secrets,
      CORS_ORIGINS: 'https://a.example, https://b.example',
      SWAGGER_ENABLED: 'false',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it.each([
    [{ NODE_ENV: 'production' }, /DATABASE_URL/],
    [{ CORS_ORIGINS: '*' }, /CORS_ORIGINS/],
    [{ PORT: 'abc' }, /PORT/],
    [{ JWT_ACCESS_SECRET: 'short' }, /JWT_ACCESS_SECRET/],
    [{ JWT_REFRESH_SECRET: 'a'.repeat(32) }, /must differ/],
    [{ MAIL_PROVIDER: 'smtp' }, /SMTP_HOST/],
  ])('rejects %o', (override, message) => {
    expect(() => validateEnv({ ...secrets, ...override })).toThrow(message);
  });

  it('requires the JWT secrets', () => {
    expect(() => validateEnv({})).toThrow(/JWT_ACCESS_SECRET/);
  });
});
