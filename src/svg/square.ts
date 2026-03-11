import type { QrMatrix } from '../types.js';
import { fixedFeatureMask } from './shared.js';

export function renderSquare(qr: QrMatrix): string {
  const mask = fixedFeatureMask(qr);
  let out = '';

  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (mask[row][col] === 0) continue;
      if (qr.matrix[row][col] === 1) {
        out += `<rect x="${col + 0.5}" y="${row + 0.5}" width="1" height="1" fill="#000"/>`;
      }
    }
  }

  return out;
}
