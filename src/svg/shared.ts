import type { QrMatrix, LineWidth } from '../types.js';

export function duplicateMatrix(
  matrix: ReadonlyArray<Uint8Array>,
): Uint8Array[] {
  return matrix.map((line) => Uint8Array.from(line));
}

export function fixedFeatureMask(qr: QrMatrix): Uint8Array[] {
  const size = qr.size;
  const mask = Array.from({ length: size }, () => new Uint8Array(size).fill(1));

  for (const coord of qr.finderCoordinates) {
    const r = coord[0] === 0 ? 0 : coord[0] - 1;
    const c = coord[1] === 0 ? 0 : coord[1] - 1;
    const w = coord[0] === 0 && coord[1] === 0 ? 9 : 8;
    const h = coord[0] === 0 && coord[1] === 0 ? 9 : 8;
    // Fill the full area including separator
    for (let row = r; row < Math.min(r + h, size); row++) {
      for (let col = c; col < Math.min(c + w, size); col++) {
        mask[row][col] = 0;
      }
    }
  }

  // Finder patterns with separators: top-left 9x9, top-right 8x9, bottom-left 9x8
  fillMaskArea(mask, 0, 0, 9, 9, size);
  fillMaskArea(mask, 0, size - 8, 8, 9, size);
  fillMaskArea(mask, size - 8, 0, 9, 8, size);

  for (const coord of qr.alignmentCoordinates) {
    fillMaskArea(mask, coord[0], coord[1], 5, 5, size);
  }

  // Timing patterns (full row 6 and column 6)
  for (let i = 0; i < size; i++) {
    mask[6][i] = 0;
    mask[i][6] = 0;
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
  return lw === 'thin' ? 0.5 : 0.9;
}

export function dotWidth(lw: LineWidth): number {
  return lw === 'thin' ? 0.5 : 0.9;
}

export function wrapSvg(
  size: number,
  content: string,
  layers: boolean,
): string {
  const viewSize = size + 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}">`;
  if (layers) {
    svg += content;
  } else {
    svg += `<g>${content}</g>`;
  }
  svg += '</svg>';
  return svg;
}
