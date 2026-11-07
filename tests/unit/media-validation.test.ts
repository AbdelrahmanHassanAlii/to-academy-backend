import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

describe('streaming image validation', () => {
  it('checks split signatures against claimed MIME, and counts streamed bytes', async () => {
    const { ImageValidationStream } = await import('../../src/modules/media/utils/image-stream.js');
    const bytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const check = new ImageValidationStream('image/png');
    await pipeline(
      Readable.from([...bytes].map((byte) => Buffer.from([byte]))),
      check,
      new Writable({
        write(_c, _e, cb) {
          cb();
        },
      }),
    );
    expect(check.size).toBe(bytes.length);
    await expect(
      pipeline(
        Readable.from([bytes]),
        new ImageValidationStream('image/jpeg'),
        new Writable({
          write(_c, _e, cb) {
            cb();
          },
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it('rejects SVG, empty images and oversized streamed data', async () => {
    const { ImageValidationStream } = await import('../../src/modules/media/utils/image-stream.js');
    const sink = () =>
      new Writable({
        write(_c, _e, cb) {
          cb();
        },
      });
    expect(() => new ImageValidationStream('image/svg+xml')).toThrow();
    await expect(
      pipeline(Readable.from([]), new ImageValidationStream('image/png'), sink()),
    ).rejects.toMatchObject({ status: 415 });
    const header = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    await expect(
      pipeline(
        Readable.from([header, Buffer.alloc(5 * 1024 * 1024)]),
        new ImageValidationStream('image/png'),
        sink(),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
