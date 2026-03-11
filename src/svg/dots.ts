import type { QrMatrix, LineWidth } from '../types.js';
import { fixedFeatureMask, dotWidth } from './shared.js';

export function renderDots(
  qr: QrMatrix,
  layers: boolean,
  lineWidth: LineWidth,
): string {
  const mask = fixedFeatureMask(qr);
  const sw = dotWidth(lineWidth);
  let darkDots = '';
  let lightDots = '';
  let bgDots = '';

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

  // Background dots for the fixed features (timing patterns)
  const size = qr.size;
  const end = size - 7;
  const width = size - 17;
  bgDots += `<line x1="9.5" y1="7.5" x2="${9.5 + width}" y2="7.5" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity="0.5"/>`;
  bgDots += `<line x1="7.5" y1="9.5" x2="7.5" y2="${9.5 + width}" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity="0.5"/>`;

  for (let offset = 8; offset < end; offset += 2) {
    bgDots += `<line x1="7.5" y1="${offset + 1.5}" x2="7.5" y2="${offset + 1.5}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
    bgDots += `<line x1="${offset + 1.5}" y1="7.5" x2="${offset + 1.5}" y2="7.5" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
  }

  if (layers) {
    return (
      `<g id="background">${bgDots}</g>` +
      `<g id="light">${lightDots}</g>` +
      `<g id="dark">${darkDots}</g>`
    );
  }

  return bgDots + lightDots + darkDots;
}
