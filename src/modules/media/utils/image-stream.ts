import { Transform, type TransformCallback } from 'node:stream';
import { AppError } from '../../../shared/errors/app-error.js';
import { PngContainer } from './image-container.js';
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export class ImageValidationStream extends Transform {
  size = 0;
  private prefix = Buffer.alloc(0);
  private checked = false;
  private readonly png = new PngContainer();
  private tail: Buffer = Buffer.alloc(0);
  constructor(private readonly mime: string) {
    super();
    if (!IMAGE_EXTENSIONS[mime])
      throw new AppError(415, 'UNSUPPORTED_IMAGE', 'Only JPEG, PNG and WebP are supported');
  }
  private check() {
    const p = this.prefix;
    const valid =
      this.mime === 'image/png'
        ? p.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        : this.mime === 'image/jpeg'
          ? p[0] === 255 && p[1] === 216 && p[2] === 255
          : p.toString('ascii', 0, 4) === 'RIFF' && p.toString('ascii', 8, 12) === 'WEBP';
    if (!valid)
      throw new AppError(
        415,
        'INVALID_IMAGE_SIGNATURE',
        'Image signature does not match MIME type',
      );
    this.checked = true;
  }
  override _transform(chunk: Buffer, _encoding: BufferEncoding, cb: TransformCallback) {
    try {
      this.size += chunk.length;
      if (this.size > MAX_IMAGE_SIZE)
        throw new AppError(413, 'IMAGE_TOO_LARGE', 'Maximum image size is 5 MiB');
      if (this.mime === 'image/png') this.png.write(chunk);
      if (this.mime === 'image/jpeg')
        this.tail =
          chunk.length >= 2 ? chunk.subarray(-2) : Buffer.concat([this.tail, chunk]).subarray(-2);
      if (!this.checked) {
        const take = Math.min(12 - this.prefix.length, chunk.length);
        this.prefix = Buffer.concat([this.prefix, chunk.subarray(0, take)]);
        if (this.prefix.length === 12) {
          this.check();
          this.push(this.prefix);
          this.push(chunk.subarray(take));
        }
      } else this.push(chunk);
      cb();
    } catch (error) {
      cb(error as Error);
    }
  }
  override _flush(cb: TransformCallback) {
    try {
      if (!this.checked) {
        this.check();
        this.push(this.prefix);
      }
      if (this.mime === 'image/png') this.png.finish();
      if (
        (this.mime === 'image/jpeg' && !this.tail.equals(Buffer.from([255, 217]))) ||
        (this.mime === 'image/webp' &&
          (this.prefix.length < 12 || this.prefix.readUInt32LE(4) + 8 !== this.size))
      )
        throw new AppError(415, 'INVALID_IMAGE_CONTAINER', 'Incomplete or invalid image container');
      cb();
    } catch (error) {
      cb(error as Error);
    }
  }
}
export function safeOriginalName(raw: string) {
  return (
    raw
      .replace(/\\/g, '/')
      .split('/')
      .pop()!
      .replace(/[\p{C}]/gu, '')
      .slice(0, 200) || 'image'
  );
}
