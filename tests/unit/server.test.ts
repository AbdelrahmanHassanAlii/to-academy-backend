import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { closeHttpServer } from '../../src/shared/utils/shutdown.js';
import { startServer } from '../../src/server.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { testEnvironment } from '../helpers.js';

describe('server lifecycle', () => {
  it('drains HTTP and stops accepting new connections', async () => {
    const server = createServer((_req, res) => {
      res.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing address');
    const url = `http://127.0.0.1:${address.port}`;
    expect((await fetch(url)).status).toBe(200);
    await closeHttpServer(server);
    await expect(fetch(url)).rejects.toThrow();
  });

  it('force-closes a request that exceeds the drain deadline', async () => {
    let accepted!: () => void;
    const received = new Promise<void>((resolve) => {
      accepted = resolve;
    });
    const server = createServer(() => {
      accepted();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing address');
    const pending = fetch(`http://127.0.0.1:${address.port}`).catch(() => null);
    await received;
    await closeHttpServer(server, 50);
    expect(await pending).toBeNull();
  });

  it('rejects unreachable MongoDB before starting an HTTP listener', async () => {
    const env = parseEnvironment({
      ...testEnvironment,
      MONGODB_URI: 'mongodb://127.0.0.1:1/to_academy_test',
    });
    await expect(startServer(env, createLogger('silent'))).rejects.toThrow('DATABASE_UNREACHABLE');
  });
});
