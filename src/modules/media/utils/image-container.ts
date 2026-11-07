import { crc32 } from 'node:zlib';
import { AppError } from '../../../shared/errors/app-error.js';
const invalid = () =>
  new AppError(415, 'INVALID_IMAGE_CONTAINER', 'Malformed or unsupported image container');
// Incremental PNG framing and CRC validation: buffers at most eight bytes, never chunk data.
export class PngContainer {
  private skip = 8;
  private pending = Buffer.alloc(0);
  private phase: 'header' | 'data' | 'crc' = 'header';
  private remaining = 0;
  private checksum = 0;
  private type = '';
  private first = true;
  private ended = false;
  private sawData = false;
  private dataEnded = false;
  write(bytes: Buffer) {
    let offset = Math.min(this.skip, bytes.length);
    this.skip -= offset;
    while (offset < bytes.length) {
      if (this.ended) throw invalid();
      if (this.phase === 'data') {
        const take = Math.min(this.remaining, bytes.length - offset);
        this.checksum = crc32(bytes.subarray(offset, offset + take), this.checksum);
        offset += take;
        this.remaining -= take;
        if (this.remaining === 0) this.phase = 'crc';
        continue;
      }
      const need = (this.phase === 'header' ? 8 : 4) - this.pending.length;
      const take = Math.min(need, bytes.length - offset);
      this.pending = Buffer.concat([this.pending, bytes.subarray(offset, offset + take)]);
      offset += take;
      if (take < need) continue;
      if (this.phase === 'header') {
        this.remaining = this.pending.readUInt32BE(0);
        this.type = this.pending.toString('ascii', 4, 8);
        if (
          this.remaining > 5 * 1024 * 1024 ||
          !/^[A-Za-z]{4}$/.test(this.type) ||
          ['acTL', 'fcTL', 'fdAT'].includes(this.type)
        )
          throw invalid();
        if (this.first ? this.type !== 'IHDR' || this.remaining !== 13 : this.type === 'IHDR')
          throw invalid();
        if (
          this.type[0] === this.type[0]!.toUpperCase() &&
          !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(this.type)
        )
          throw invalid();
        this.first = false;
        if (this.type === 'IDAT') {
          if (this.dataEnded) throw invalid();
          this.sawData = true;
        } else if (this.sawData) this.dataEnded = true;
        if (this.type === 'PLTE' && this.sawData) throw invalid();
        if (this.type === 'IEND' && (this.remaining !== 0 || !this.sawData)) throw invalid();
        this.checksum = crc32(this.pending.subarray(4));
        this.phase = this.remaining ? 'data' : 'crc';
      } else {
        if (this.pending.readUInt32BE(0) !== this.checksum) throw invalid();
        if (this.type === 'IEND') this.ended = true;
        this.phase = 'header';
      }
      this.pending = Buffer.alloc(0);
    }
  }
  finish() {
    if (!this.ended || this.pending.length || this.skip) throw invalid();
  }
}
