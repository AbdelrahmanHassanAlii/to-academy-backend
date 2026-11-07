import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/env.js';
import { sessionMiddleware } from '../../src/config/session.js';
import { requireCsrf, issueCsrf, enforceSessionExpiry } from '../../src/shared/middleware/csrf.js';
import { errorHandler } from '../../src/shared/middleware/error-handler.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { productionEnvironment, testEnvironment } from '../helpers.js';

function fixture(production = false, trustProxy = true) {
  const env = parseEnvironment(production ? productionEnvironment : testEnvironment);
  const app = express();
  if (trustProxy) app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(express.json());
  // MemoryStore is deliberately test-only. The production composition requires a real MongoStore.
  app.use(sessionMiddleware(env, new session.MemoryStore()));
  app.use(enforceSessionExpiry(env));
  app.get('/csrf', issueCsrf(env));
  app.post('/protected', requireCsrf(env), (_req, res) => {
    res.json({ saved: true });
  });
  app.post('/expire', requireCsrf(env), (req, res) => {
    req.session.expiresAt = Date.now() - 1;
    res.sendStatus(200);
  });
  app.use(errorHandler(createLogger('silent')));
  return app;
}

describe('synchronizer CSRF foundation', () => {
  it('maps session-store read failures to safe 503 responses', async () => {
    const env = parseEnvironment(testEnvironment);
    const store = new session.MemoryStore();
    const app = express();
    app.use(sessionMiddleware(env, store));
    app.get('/csrf', issueCsrf(env));
    app.use(errorHandler(createLogger('silent')));
    const agent = request.agent(app);
    await agent.get('/csrf').set('Origin', 'http://localhost:5174').expect(200);
    store.get = (_id, callback) => {
      callback(new Error('mongodb://private-password'));
    };
    const res = await agent.get('/csrf').set('Origin', 'http://localhost:5174');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SESSION_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('private-password');
  });
  it('requires an exact trusted Origin even for token issuance', async () => {
    expect((await request(fixture()).get('/csrf')).status).toBe(403);
    expect(
      (await request(fixture()).get('/csrf').set('Origin', 'https://evil.example')).status,
    ).toBe(403);
  });

  it('binds random tokens to a cookie session and accepts localhost credentialed writes', async () => {
    const app = fixture();
    const agent = request.agent(app);
    const res = await agent.get('/csrf').set('Origin', 'http://localhost:5174');
    expect(res.status).toBe(200);
    expect(res.body.data.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(res.headers['cache-control']).toBe('no-store');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    const token = res.body.data.csrfToken as string;
    expect(
      (
        await agent
          .post('/protected')
          .set('Origin', 'http://localhost:5174')
          .set('X-CSRF-Token', token)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/protected')
          .set('Origin', 'http://localhost:5174')
          .set('X-CSRF-Token', token)
      ).status,
    ).toBe(403);
    expect(
      (
        await agent
          .post('/protected')
          .set('Origin', 'https://evil.example')
          .set('X-CSRF-Token', token)
      ).status,
    ).toBe(403);
    expect((await agent.post('/protected').set('X-CSRF-Token', token)).status).toBe(403);
    expect((await agent.post('/protected').set('Origin', 'http://localhost:5174')).status).toBe(
      403,
    );
    expect(
      (
        await agent
          .post('/protected')
          .set('Origin', 'http://localhost:5174')
          .set('X-CSRF-Token', 'a'.repeat(64))
      ).status,
    ).toBe(403);
  });

  it('expires sessions server-side even before Mongo TTL removal', async () => {
    const agent = request.agent(fixture());
    const token = (await agent.get('/csrf').set('Origin', 'http://localhost:5174')).body.data
      .csrfToken as string;
    await agent
      .post('/expire')
      .set('Origin', 'http://localhost:5174')
      .set('X-CSRF-Token', token)
      .expect(200);
    const expired = await agent
      .post('/protected')
      .set('Origin', 'http://localhost:5174')
      .set('X-CSRF-Token', token);
    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe('SESSION_EXPIRED');
    expect(String(expired.headers['set-cookie'])).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('sets a Secure host-only production cookie behind the declared TLS proxy', async () => {
    const app = fixture(true);
    const res = await request(app)
      .get('/csrf')
      .set('Origin', 'https://admin.toacademy.com')
      .set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
    expect(String(res.headers['set-cookie'])).toContain('Secure');
    expect(String(res.headers['set-cookie'])).not.toContain('Domain=');
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] ?? '';
    const write = await request(app)
      .post('/protected')
      .set('Origin', 'https://admin.toacademy.com')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', res.body.data.csrfToken as string);
    expect(write.status).toBe(200);
    const insecure = await request(fixture(true, false))
      .get('/csrf')
      .set('Origin', 'https://admin.toacademy.com')
      .set('X-Forwarded-Proto', 'https');
    expect(insecure.headers['set-cookie']).toBeUndefined();
  });
});
