import { validateEnv } from './env';

describe('validateEnv', () => {
  it('applies development defaults to an empty environment', () => {
    const env = validateEnv({});
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      CORS_ORIGINS: ['http://localhost:5173'],
    });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('treats empty strings from .env as unset', () => {
    const env = validateEnv({ DATABASE_URL: '', SWAGGER_ENABLED: '' });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.SWAGGER_ENABLED).toBeUndefined();
  });

  it('parses a comma-separated CORS allow-list and booleans', () => {
    const env = validateEnv({
      CORS_ORIGINS: 'https://a.example, https://b.example',
      SWAGGER_ENABLED: 'false',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('requires DATABASE_URL in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() => validateEnv({ CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
