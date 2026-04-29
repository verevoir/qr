import type { QrMatrix, PhotoOptions, LogoOptions } from '../types.js';
import { fixedFeatureMask } from './shared.js';

export function renderLogo(
  qr: QrMatrix,
  dotSize: number,
  logo: LogoOptions,
): string {
  const mask = fixedFeatureMask(qr);
  const sampleAt = logo.sample(qr.size);
  const darkBelow = logo.darkBelow ?? 0.4;
  const lightAbove = logo.lightAbove ?? 0.7;
  const sw = dotSize;
  let dark = '';
  let light = '';

  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (mask[row][col] === 0) continue;
      const lum = sampleAt(row, col).luminance;
      const moduleDark = qr.matrix[row][col] === 1;
      // Two-threshold rule: cull a module only when the image is decisively
      // providing the right contrast. In the mushy band, always render.
      if (moduleDark && lum < darkBelow) continue;
      if (!moduleDark && lum > lightAbove) continue;
      const cx = col + 1.5;
      const cy = row + 1.5;
      if (moduleDark) {
        dark += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
      } else {
        light += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#fff" stroke-width="${sw}" stroke-linecap="round"/>`;
      }
    }
  }

  return `<g id="dark">${dark}</g><g id="light">${light}</g>`;
}

export function renderPhoto(qr: QrMatrix, photo: PhotoOptions): string {
  const mask = fixedFeatureMask(qr);
  const min = photo.minDotSize ?? 0.25;
  const max = photo.maxDotSize ?? 0.9;
  const range = max - min;
  const sampleAt = photo.sample(qr.size);
  let dark = '';
  let centres = '';

  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (mask[row][col] === 0) continue;
      const lum = sampleAt(row, col).luminance;
      const darkness = 1 - Math.max(0, Math.min(1, lum));
      const cx = col + 1.5;
      const cy = row + 1.5;
      const module = qr.matrix[row][col];

      if (module === 1) {
        // Dark module: one dot, diameter scales from min (very light image)
        // to max (very dark image).
        const sw = min + range * darkness;
        dark += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
      } else if (darkness > 0.5) {
        // Light module in a dark image region: draw a big dark dot so the
        // surrounding darkness continues to read through this cell, then
        // cap it with a small light centre the decoder samples as "light".
        const t = (darkness - 0.5) * 2;
        const sw = min + range * t;
        dark += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
        centres += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#fff" stroke-width="${min}" stroke-linecap="round"/>`;
      }
    }
  }

  return `<g id="dark">${dark}</g><g id="light">${centres}</g>`;
}
