import type { QrMatrix, PhotoOptions, LogoOptions } from '../types.js';
import { fixedFeatureMask } from './shared.js';

export function renderLogo(
  qr: QrMatrix,
  dotSize: number,
  _logo: LogoOptions,
): string {
  const mask = fixedFeatureMask(qr);
  // Half-diameter dots throughout — both dark and light are equal-
  // rank QR markers in mono logo, so they share a single size that
  // tracks the line-width selection. (Color-logo's overlay-only
  // shrink rule doesn't apply here: there's no "coloured base
  // underneath" carrying separate information.)
  const dotWidth = dotSize / 2;
  let dark = '';
  let light = '';

  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (mask[row][col] === 0) continue;
      const moduleDark = qr.matrix[row][col] === 1;
      const cx = col + 1.5;
      const cy = row + 1.5;
      if (moduleDark) {
        dark += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#000" stroke-width="${dotWidth}" stroke-linecap="round"/>`;
      } else {
        light += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#fff" stroke-width="${dotWidth}" stroke-linecap="round"/>`;
      }
    }
  }

  return `<g id="dark">${dark}</g><g id="light">${light}</g>`;
}

export function renderPhoto(qr: QrMatrix, photo: PhotoOptions): string {
  const mask = fixedFeatureMask(qr);
  const min = photo.minDotSize ?? 0.25;
  const max = photo.maxDotSize ?? 1;
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
        // Light module in a dark image region: draw a big dark dot so
        // the surrounding darkness continues to read through this
        // cell, then cap it with a small light centre the decoder
        // samples as "light".
        const t = (darkness - 0.5) * 2;
        const sw = min + range * t;
        dark += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
        centres += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#fff" stroke-width="${min}" stroke-linecap="round"/>`;
      }
    }
  }

  return `<g id="dark">${dark}</g><g id="light">${centres}</g>`;
}

/**
 * Coloured variant of the `logo` style. Every module gets a coloured
 * dot underneath sized by `sample.prominence` (typically
 * `max(1 − V, S × V)` over the source pixel's HSV) so vivid colours
 * and deep darks render larger while pale tints stay subtle. The
 * dark/light QR structure is then overlaid:
 *
 * Centre overlays are added only when the emitted hue would
 * otherwise mis-decode:
 *
 * - **Dark modules** with a light hue (yellow, cyan…) get a small
 *   dark anchor so the decoder reads them as dark.
 * - **Light modules** with a dark hue get a small white centre so
 *   the decoder reads them as light.
 *
 * Light modules over already-light hues — and dark modules over
 * already-dark hues — keep the bare coloured dot. Hiding the colour
 * inside a uniform white centre on every light module washed light-
 * coloured image areas back out to white.
 *
 * Falls back gracefully on a luminance-only sampler: if `prominence`
 * isn't supplied, dot size scales with `1 − luminance`; if `color`
 * isn't supplied, dots render `#000`. In that case the output is
 * effectively the photo-style modulation in monochrome.
 */
export function renderColorLogo(
  qr: QrMatrix,
  dotSize: number,
  options: PhotoOptions,
): string {
  const mask = fixedFeatureMask(qr);
  // Coloured base dots stay on a fixed scale — the dot-size /
  // "thin" selection only thins the overlays (white centre, dark
  // anchor) so the colour information itself is unaffected by the
  // line-width control.
  const min = options.minDotSize ?? 0.5;
  const max = options.maxDotSize ?? 1;
  const range = max - min;
  const overlaySize = dotSize / 2;
  // Threshold above which the emitted hue itself is light enough
  // to need a dark anchor inside the dot.
  const anchorAbove = 0.5;
  // Below this prominence, the source pixel contributes essentially
  // nothing (white / transparent areas of the image) — light modules
  // skip rendering entirely so the background reads as clean white.
  const lightSkipBelow = 0.05;
  const sampleAt = options.sample(qr.size);
  let coloured = '';
  let light = '';
  let anchors = '';

  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (mask[row][col] === 0) continue;
      const cx = col + 1.5;
      const cy = row + 1.5;
      const moduleDark = qr.matrix[row][col] === 1;
      const sample = sampleAt(row, col);
      const color = sample.color ?? '#000';
      const lum = Math.max(0, Math.min(1, sample.luminance));
      const prominence = Math.max(0, Math.min(1, sample.prominence ?? 1 - lum));
      const sw = min + range * prominence;

      const colorLum = sample.colorLuminance ?? 0;
      if (moduleDark) {
        // Dark module always renders so the decoder can read the
        // QR pattern even over white / transparent image areas.
        coloured += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
        // Anchor with a small dark centre when the emitted hue is
        // light enough that the decoder would otherwise read this
        // cell as a light module.
        if (colorLum > anchorAbove) {
          anchors += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#000" stroke-width="${overlaySize}" stroke-linecap="round"/>`;
        }
      } else if (prominence > lightSkipBelow) {
        // Light module: only render when the source pixel actually
        // contributes — skip white / transparent image areas so the
        // background reads as clean white instead of speckled with
        // half-size light dots.
        coloured += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
        if (colorLum <= anchorAbove) {
          // Light module sitting on a dark colour: punch a small
          // white centre so the decoder still reads "light". Skip
          // when the colour is already light (yellow, cyan, pale
          // tints) — the hue itself reads as light, and a white
          // centre would just hide most of the coloured ring.
          light += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="#fff" stroke-width="${overlaySize}" stroke-linecap="round"/>`;
        }
      }
    }
  }

  return `<g id="dark">${coloured}</g><g id="anchors">${anchors}</g><g id="light">${light}</g>`;
}
