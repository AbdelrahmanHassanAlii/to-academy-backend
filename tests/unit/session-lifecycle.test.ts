import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { sessionMiddleware } from '../../src/config/session.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { errorHandler } from '../../src/shared/middleware/error-handler.js';
import { issueCsrf, requireCsrf } from '../../src/shared/middleware/csrf.js';
import {
  establishAdminSession,
  destroySession,
} from '../../src/modules/auth/utils/session-lifecycle.js';
import { testEnvironment } from '../helpers.js';

const env = parseEnvironment(testEnvironment);
const origin = 'http://localhost:5174';
function fixture() {
  const store = new session.MemoryStore();
  const app = express();
  app.use(sessionMiddleware(env, store));
  app.get('/csrf', issueCsrf(env));
  app.post('/login', requireCsrf(env), async (req, res) => {
    await establishAdminSession(req, 'test-identity');
    res.sendStatus(200);
  });
  app.post('/logout', requireCsrf(env), async (req, res) => {
    await destroySession(req, res, env);
    res.sendStatus(200);
  });
  app.get('/me', (req, res) => {
    res.sendStatus(req.session.adminId ? 200 : 401);
  });
  app.use(errorHandler(createLogger('silent')));
  return { store, agent: request.agent(app) };
}

describe('session lifecycle failures', () => {
  it('fails closed if regeneration cannot delete the pre-login session', async () => {
    const { store, agent } = fixture();
    const token = (await agent.get('/csrf').set('Origin', origin)).body.data.csrfToken as string;
    store.destroy = (_id, callback) => {
      callback?.(new Error('test-store-error'));
    };
    const response = await agent.post('/login').set('Origin', origin).set('X-CSRF-Token', token);
    expect(response.status).toBe(503);
    expect((await agent.get('/me')).status).toBe(401);
  });
  it('does not auto-save an authenticated identity after explicit session-save failure', async () => {
    const { store, agent } = fixture();
    const token = (await agent.get('/csrf').set('Origin', origin)).body.data.csrfToken as string;
    const originalSet = store.set.bind(store);
    let failNextSet = true;
    store.set = (id, data, callback) => {
      if (failNextSet) {
        failNextSet = false;
        callback?.(new Error('test-store-error'));
        return;
      }
      originalSet(id, data, callback);
    };
    const response = await agent.post('/login').set('Origin', origin).set('X-CSRF-Token', token);
    expect(response.status).toBe(503);
    expect((await agent.get('/me')).status).toBe(401);
    const all = await new Promise<session.SessionData[]>((resolve, reject) => {
      store.all((error, data) => {
        if (error) reject(error);
        else resolve(Object.values(data ?? {}));
      });
    });
    expect(all.some((data) => data.adminId)).toBe(false);
  });
  it('does not claim logout succeeded when session destruction fails', async () => {
    const { store, agent } = fixture();
    const token = (await agent.get('/csrf').set('Origin', origin)).body.data.csrfToken as string;
    store.destroy = (_id, callback) => {
      callback?.(new Error('test-store-error'));
    };
    const response = await agent.post('/logout').set('Origin', origin).set('X-CSRF-Token', token);
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ success: false, code: 'SESSION_UNAVAILABLE' });
  });
});
