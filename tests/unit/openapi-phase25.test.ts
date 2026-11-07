import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { testEnvironment } from '../helpers.js';
describe('Phase 2.5 documented HTTP contract', () => {
  it('serves all new operations with correct admin security and multipart/binary contracts', async () => {
    const app = createApp({
      env: parseEnvironment(testEnvironment),
      logger: createLogger('silent'),
      isReady: async () => true,
    });
    const { body: spec } = await request(app).get('/api/v1/openapi.json').expect(200);
    const paths: Record<string, string[]> = {
      '/admin/media': ['get', 'post'],
      '/admin/media/{id}': ['get', 'delete'],
      '/admin/media/{id}/content': ['get'],
      '/media/{id}': ['get'],
      '/articles': ['get'],
      '/articles/{slug}': ['get'],
      '/admin/articles': ['get', 'post'],
      '/admin/articles/{id}': ['get', 'patch', 'delete'],
      '/settings': ['get'],
      '/admin/settings': ['get', 'patch'],
    };
    for (const [path, methods] of Object.entries(paths))
      for (const method of methods) {
        const operation = spec.paths[path][method];
        expect(operation.responses).toHaveProperty(method === 'post' ? '201' : '200');
        if (path.startsWith('/admin/')) {
          expect(operation.security).toEqual([{ sessionCookie: [] }]);
          if (method !== 'get')
            expect(operation.parameters.map((p: { name: string }) => p.name)).toEqual(
              expect.arrayContaining(['Origin', 'X-CSRF-Token']),
            );
        } else expect(operation.security).toEqual([]);
      }
    expect(spec.paths['/admin/media'].post.requestBody.content).toHaveProperty(
      'multipart/form-data',
    );
    expect(spec.paths['/media/{id}'].get.responses['200'].content).toHaveProperty('image/png');
    expect(spec.components.schemas.ArticlePublic.properties).not.toHaveProperty('status');
    expect(spec.components.schemas.AcademySettings.properties).not.toHaveProperty('_id');
    expect(spec.components.schemas.MediaMetadata.properties).not.toHaveProperty('gridfsId');
  });
});
