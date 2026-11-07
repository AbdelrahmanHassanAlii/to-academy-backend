import type { Server } from 'node:http';

export async function closeHttpServer(server: Server, timeoutMs = 10_000): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => {
      server.closeAllConnections();
    }, timeoutMs);
    deadline.unref();
    server.close((error) => {
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve();
    });
    server.closeIdleConnections();
  });
}
