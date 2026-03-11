import type { QrMatrix, LineWidth } from '../types.js';
import {
  duplicateMatrix,
  fixedFeatureMask,
  strokeWidth,
  dotWidth,
} from './shared.js';

export function renderVertical(qr: QrMatrix, lineWidth: LineWidth): string {
  const matrix = duplicateMatrix(qr.dataMatrix);
  const mask = fixedFeatureMask(qr);
  const sw = strokeWidth(lineWidth);
  const dw = dotWidth(lineWidth);
  let lines = '';
  let dots = '';

  const size = qr.size;

  // Draw vertical line segments
  for (let col = 0; col < size; col++) {
    let start: number | undefined;

    for (let row = 0; row < size; row++) {
      if (mask[row][col] === 0) {
        if (start !== undefined) {
          lines += emitVerticalRun(matrix, col, start, row, sw);
          start = undefined;
        }
        continue;
      }

      if (matrix[row][col] === 1) {
        if (start === undefined) start = row;
      } else {
        if (start !== undefined) {
          lines += emitVerticalRun(matrix, col, start, row, sw);
          start = undefined;
        }
      }
    }

    if (start !== undefined) {
      lines += emitVerticalRun(matrix, col, start, size, sw);
    }
  }

  // Remaining single modules rendered as dots
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (mask[row][col] === 0) continue;
      if (matrix[row][col] === 1) {
        dots += `<line x1="${col + 1.5}" y1="${row + 1.5}" x2="${col + 1.5}" y2="${row + 1.5}" stroke="#000" stroke-width="${dw}" stroke-linecap="round"/>`;
      }
    }
  }

  return lines + dots;
}

function emitVerticalRun(
  matrix: Uint8Array[],
  col: number,
  start: number,
  end: number,
  sw: number,
): string {
  const length = end - start;
  if (length <= 1) return '';

  const x = col + 1.5;
  const y1 = start + 1.5;
  const y2 = end - 1 + 1.5;

  for (let row = start; row < end; row++) {
    matrix[row][col] = 0;
  }

  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
}
