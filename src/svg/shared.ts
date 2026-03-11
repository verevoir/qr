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

export function strokeWidth(lw: LineWidth): number {
  return lw === 'thin' ? 0.65 : 0.9;
}

export function dotWidth(lw: LineWidth): number {
  return lw === 'thin' ? 0.65 : 0.9;
}

export function wrapSvg(size: number, content: string): string {
  const viewSize = size + 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}"><g>${content}</g></svg>`;
}
