import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/env.js';
import { sessionOptions } from '../../src/config/session.js';
import { productionEnvironment, testEnvironment } from '../helpers.js';

describe('environment validation', () => {
  it('parses explicit local origins and port without reading global process state', () => {
    const env = parseEnvironment(testEnvironment);
    expect(env.PORT).toBe(4000);
    expect(env.ALLOWED_ORIGINS).toEqual(['http://localhost:5173', 'http://localhost:5174']);
  });

  it.each([
    { SESSION_SECRET: '' },
    { SESSION_SECRET: 'x'.repeat(48) },
    { SESSION_SECRET: 'change-me-to-a-very-long-random-secret-please' },
    { MONGODB_URI: '' },
    { MONGODB_URI: 'https://example.com/database' },
    { PORT: '0' },
    { PORT: '4000.1' },
    { SESSION_COOKIE_NAME: 'invalid;cookie' },
    { ALLOWED_ORIGINS: '*' },
    { ALLOWED_ORIGINS: 'http://localhost:5174' },
    { ADMIN_APP_URL: 'http://localhost:5174/path' },
    { TRUST_PROXY_HOPS: 'true' },
  ])('rejects unsafe/malformed configuration %j', (overrides) => {
    expect(() => parseEnvironment({ ...testEnvironment, ...overrides })).toThrow();
  });

  it('rejects non-HTTPS production origins and missing proxy declaration', () => {
    expect(() => parseEnvironment({ ...testEnvironment, NODE_ENV: 'production' })).toThrow();
    expect(() =>
      parseEnvironment({ ...productionEnvironment, TRUST_PROXY_HOPS: undefined }),
    ).toThrow();
    expect(parseEnvironment(productionEnvironment).TRUST_PROXY_HOPS).toBe(1);
  });

  it('does not include credentials in configuration error messages', () => {
    const secret = 'credential-that-must-not-be-logged';
    try {
      parseEnvironment({ ...testEnvironment, MONGODB_URI: secret, PORT: '-1' });
      expect.fail('configuration should fail');
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).toContain('MONGODB_URI');
    }
  });
});

describe('cookie policy for both topologies', () => {
  it.each([
    [testEnvironment, false],
    [productionEnvironment, true],
  ] as const)(
    'sets host-only HttpOnly SameSite=Lax with environment-specific Secure',
    (input, secure) => {
      const options = sessionOptions(parseEnvironment(input));
      expect(options.cookie).toMatchObject({
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 28_800_000,
      });
      expect(options.cookie).not.toHaveProperty('domain');
      expect(options).toMatchObject({ resave: false, saveUninitialized: false, rolling: false });
    },
  );
});
