import type { QrMatrix, LineWidth } from '../types.js';
import { fixedFeatureMask, dotWidth } from './shared.js';

export function renderDots(qr: QrMatrix, lineWidth: LineWidth): string {
  const mask = fixedFeatureMask(qr);
  const sw = dotWidth(lineWidth);
  let darkDots = '';
  let lightDots = '';

  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (mask[row][col] === 0) continue;
      const cx = col + 1.5;
      const cy = row + 1.5;
      if (qr.matrix[row][col] === 1) {
        darkDots += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
      } else {
        lightDots += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#fff" stroke-width="${sw}" stroke-linecap="round"/>`;
      }
    }
  }

  return `<g id="light">${lightDots}</g><g id="dark">${darkDots}</g>`;
}
