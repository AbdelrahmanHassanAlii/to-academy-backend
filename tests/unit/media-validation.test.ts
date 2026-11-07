import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';

describe('streaming image validation', () => {
  it('checks split signatures against claimed MIME, and counts streamed bytes', async () => {
    const { ImageValidationStream } = await import('../../src/modules/media/utils/image-stream.js');
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
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
  it('rejects missing PNG terminators, corrupt checksums, APNG and invalid container lengths', async () => {
    const { ImageValidationStream } = await import('../../src/modules/media/utils/image-stream.js');
    const image = sharp({ create: { width: 2, height: 2, channels: 3, background: '#123456' } });
    const png = await image.png().toBuffer();
    const corrupt = Buffer.from(png);
    corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1;
    const apng = Buffer.from(png);
    apng.write('acTL', 12, 'ascii');
    const jpeg = await image.jpeg().toBuffer();
    const webp = await image.webp().toBuffer();
    const sink = () =>
      new Writable({
        write(_c, _e, cb) {
          cb();
        },
      });
    for (const [bytes, mime] of [
      [png.subarray(0, -12), 'image/png'],
      [corrupt, 'image/png'],
      [apng, 'image/png'],
      [Buffer.concat([png, Buffer.from('x')]), 'image/png'],
      [jpeg.subarray(0, -2), 'image/jpeg'],
      [Buffer.concat([webp, Buffer.from('x')]), 'image/webp'],
    ] as const) {
      await expect(
        pipeline(Readable.from([bytes]), new ImageValidationStream(mime), sink()),
      ).rejects.toMatchObject({ status: 415 });
    }
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
