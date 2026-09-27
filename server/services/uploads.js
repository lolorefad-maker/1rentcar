import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../lib/http.js';

/** Detects the real image type from magic bytes — the Content-Type header is not trusted. */
const SIGNATURES = [
  { ext: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', matches: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { ext: 'avif', matches: (b) => b.toString('ascii', 4, 12).startsWith('ftypavi') },
];

export async function saveUpload(publicDir, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    throw new HttpError(400, 'empty_upload', 'No image data received');
  }
  const type = SIGNATURES.find((signature) => signature.matches(buffer));
  if (!type) throw new HttpError(415, 'unsupported_image', 'Only JPEG, PNG, WebP or AVIF images are accepted');

  const month = new Date().toISOString().slice(0, 7);
  const dir = path.join(publicDir, 'uploads', month);
  await fs.mkdir(dir, { recursive: true });
  const name = `${crypto.randomUUID()}.${type.ext}`;
  await fs.writeFile(path.join(dir, name), buffer);
  return `/uploads/${month}/${name}`;
}
