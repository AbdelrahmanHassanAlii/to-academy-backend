import { Writable } from 'node:stream';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import express from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { errorHandler } from '../../src/shared/middleware/error-handler.js';
import { validateRequest } from '../../src/shared/middleware/validate-request.js';
import { createRateLimiter } from '../../src/shared/middleware/rate-limit.js';
import { productionEnvironment, testEnvironment } from '../helpers.js';

const env = parseEnvironment(testEnvironment);
const logger = createLogger('silent');
const app = (ready: () => Promise<boolean> = async () => true) =>
  createApp({ env, logger, isReady: ready });

describe('foundation HTTP contracts', () => {
  it.each([
    ['Content-Type', 'application/json; charset=iso-8859-1'],
    ['Content-Encoding', 'not-a-real-encoding'],
  ])('returns 415 for unsupported request body %s', async (header, value) => {
    const res = await request(app())
      .post('/missing')
      .set('Content-Type', 'application/json')
      .set(header, value)
      .send('{"hello":"world"}');
    expect(res.status).toBe(415);
    expect(res.body).toMatchObject({ success: false, code: 'UNSUPPORTED_MEDIA_TYPE', errors: [] });
  });
  it('returns minimal liveness with security headers and no session cookie', async () => {
    const res = await request(app()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Service is alive',
      data: { status: 'ok' },
      meta: null,
    });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('returns readiness only when the injected live dependency probe succeeds', async () => {
    expect((await request(app()).get('/api/v1/ready')).status).toBe(200);
    const res = await request(app(async () => false)).get('/api/v1/ready');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_READY', errors: [] });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('conceals dependency exceptions in readiness', async () => {
    const res = await request(
      app(async () => {
        throw new Error('private-database-error-sentinel');
      }),
    ).get('/api/v1/ready');
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('private-database-error-sentinel');
  });

  it('returns JSON 404 for unknown/unimplemented modules', async () => {
    const res = await request(app()).get('/api/v1/courses');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND', errors: [] });
  });

  it('rejects malformed and oversized JSON centrally', async () => {
    const malformed = await request(app())
      .post('/missing')
      .set('Content-Type', 'application/json')
      .send('{invalid');
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('INVALID_JSON');
    const large = await request(app())
      .post('/missing')
      .send({ content: 'a'.repeat(110_000) });
    expect(large.status).toBe(413);
    expect(large.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('serves only implemented OpenAPI operations and Swagger UI', async () => {
    const spec = await request(app()).get('/api/v1/openapi.json');
    expect(spec.status).toBe(200);
    expect(Object.keys(spec.body.paths).sort()).toEqual([
      '/admin/admins/me',
      '/auth/csrf',
      '/auth/login',
      '/auth/logout',
      '/auth/me',
      '/health',
      '/ready',
    ]);
    expect(spec.body.components.securitySchemes.sessionCookie.in).toBe('cookie');
    const docs = await request(app()).get('/api/v1/docs/');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('swagger-ui');
  });
});

describe('CORS', () => {
  it('allows credentialed production subdomain requests and rejects lookalike domains', async () => {
    const production = createApp({
      env: parseEnvironment(productionEnvironment),
      logger,
      isReady: async () => true,
    });
    const res = await request(production)
      .get('/api/v1/health')
      .set('Origin', 'https://admin.toacademy.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://admin.toacademy.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(
      (
        await request(production)
          .get('/api/v1/health')
          .set('Origin', 'https://admin.toacademy.com.evil.example')
      ).status,
    ).toBe(403);
  });
  it.each(['http://localhost:5173', 'http://localhost:5174'])(
    'permits explicit credentialed origin %s',
    async (origin) => {
      const res = await request(app())
        .options('/api/v1/auth/csrf')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'X-CSRF-Token');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers.vary).toContain('Origin');
    },
  );

  it.each(['https://evil.example', 'null', 'http://localhost:5174.evil.example'])(
    'rejects untrusted origin %s',
    async (origin) => {
      const res = await request(app()).get('/api/v1/health').set('Origin', origin);
      expect(res.status).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    },
  );
});

describe('shared validation and errors', () => {
  it('classifies known database connectivity failures as safe retryable 503 errors', async () => {
    const fixture = express();
    fixture.get('/', () => {
      throw new mongoose.mongo.MongoNetworkError('private-database-sentinel');
    });
    fixture.use(errorHandler(logger));
    const res = await request(fixture).get('/');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('DATABASE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('private-database-sentinel');
  });
  it('logs method/status/id without request headers, query values or bodies', async () => {
    let lines = '';
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines += String(chunk);
        done();
      },
    });
    const fixture = createApp({
      env,
      logger: createLogger('info', sink),
      isReady: async () => true,
    });
    await request(fixture)
      .get('/api/v1/health?email=private-person@example.com')
      .set('Cookie', 'private-cookie')
      .set('Authorization', 'private-authorization')
      .set('X-CSRF-Token', 'private-token');
    expect(lines).toContain('/api/v1/health');
    expect(lines).not.toContain('private-');
    expect(JSON.parse(lines.trim()).res.statusCode).toBe(200);
  });
  it('provides parsed input in response locals and rejects unknown keys', async () => {
    const fixture = express();
    fixture.use(express.json());
    fixture.post(
      '/',
      validateRequest(z.object({ count: z.number().int().positive() }).strict()),
      (_req, res) => {
        res.json(res.locals.validated);
      },
    );
    fixture.use(errorHandler(logger));
    expect((await request(fixture).post('/').send({ count: 3 })).body).toEqual({ count: 3 });
    const invalid = await request(fixture).post('/').send({ count: -1, admin: true });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors.length).toBeGreaterThan(0);
  });

  it('does not expose unexpected errors or unsafe raw request values in logs', async () => {
    let lines = '';
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines += String(chunk);
        done();
      },
    });
    const log = createLogger('info', sink);
    const fixture = express();
    fixture.get('/', () => {
      throw new Error('password=private-secret mongodb://credentials');
    });
    fixture.use(errorHandler(log));
    const res = await request(fixture).get('/');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('private-secret');
    expect(lines).not.toContain('private-secret');
  });

  it('rate limits with the JSON error contract and retry metadata', async () => {
    const fixture = express();
    fixture.use(createRateLimiter({ limit: 1, windowMs: 60_000 }));
    fixture.get('/', (_req, res) => {
      res.sendStatus(200);
    });
    expect((await request(fixture).get('/')).status).toBe(200);
    const res = await request(fixture).get('/');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false, code: 'RATE_LIMITED', errors: [] });
    expect(res.headers['retry-after']).toBeDefined();
  });
});
