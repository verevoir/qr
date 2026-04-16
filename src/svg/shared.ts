import type { QrMatrix, LineWidth } from '../types.js';

export function duplicateMatrix(
  matrix: ReadonlyArray<Uint8Array>,
): Uint8Array[] {
  return matrix.map((line) => Uint8Array.from(line));
}

export function fixedFeatureMask(qr: QrMatrix): Uint8Array[] {
  const size = qr.size;
  const mask = Array.from({ length: size }, () => new Uint8Array(size).fill(1));

  // Finder patterns — only the 7x7 pattern itself (rendered by corner renderer).
  // Separator (white, 1 module) and format info are in the matrix and render in-style.
  for (const coord of qr.finderCoordinates) {
    fillMaskArea(mask, coord[0], coord[1], 7, 7, size);
  }

  // Alignment patterns — 5x5 (rendered by corner renderer).
  for (const coord of qr.alignmentCoordinates) {
    fillMaskArea(mask, coord[0], coord[1], 5, 5, size);
  }

  return mask;
}

function fillMaskArea(
  mask: Uint8Array[],
  row: number,
  col: number,
  width: number,
  height: number,
  size: number,
): void {
  for (let r = row; r < Math.min(row + height, size); r++) {
    for (let c = col; c < Math.min(col + width, size); c++) {
      mask[r][c] = 0;
    }
  }
}

export function strokeWidth(lw: LineWidth, thin = 0.325): number {
  return lw === 'thin' ? thin : 0.9;
}

export function dotWidth(lw: LineWidth, thin = 0.325): number {
  return lw === 'thin' ? thin : 0.9;
}

export interface WrapOptions {
  /**
   * Colour of the dark modules. Any CSS colour string. Default `#000`.
   */
  dark?: string;
  /**
   * Colour of the light modules — the inner "white" parts of finder
   * patterns, the separator strokes of the dots style, and so on.
   * Default `#fff`. Pass `'transparent'` to let the page background
   * show through.
   */
  light?: string;
  /**
   * When set, emits a full-size `<rect>` filled with this colour as
   * the first child of the `<svg>`. Distinct from `light` so you can
   * have, say, a dark-grey page background under white light modules.
   */
  background?: string;
}

/**
 * Apply the colour overrides to an already-rendered string of SVG
 * content. The individual renderers emit `fill="#000"` / `fill="#fff"`
 * (and the stroke equivalents) as fixed defaults; `applyColours`
 * rewrites those to the user's values exactly once, at the wrapping
 * boundary. Keeping the substitution contained here means no renderer
 * needs to know about colour and consumers that don't pass `color`
 * get byte-identical output to the pre-colour implementation.
 */
export function applyColours(content: string, options: WrapOptions): string {
  let out = content;
  const dark = options.dark;
  const light = options.light;
  if (dark && dark !== '#000') {
    out = out.replaceAll('"#000"', `"${dark}"`);
  }
  if (light && light !== '#fff') {
    out = out.replaceAll('"#fff"', `"${light}"`);
  }
  return out;
}

export function wrapSvg(
  size: number,
  content: string,
  options: WrapOptions = {},
): string {
  const viewSize = size + 2;
  const coloured = applyColours(content, options);
  const bg = options.background
    ? `<rect width="${viewSize}" height="${viewSize}" fill="${options.background}"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}">` +
    `${bg}<g>${coloured}</g>` +
    `</svg>`
  );
}
