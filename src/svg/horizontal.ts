import type { QrMatrix, LineWidth } from '../types.js';
import {
  duplicateMatrix,
  fixedFeatureMask,
  strokeWidth,
  dotWidth,
} from './shared.js';

export function renderHorizontal(qr: QrMatrix, lineWidth: LineWidth): string {
  const matrix = duplicateMatrix(qr.dataMatrix);
  const mask = fixedFeatureMask(qr);
  const sw = strokeWidth(lineWidth);
  const dw = dotWidth(lineWidth);
  let lines = '';
  let dots = '';

  const size = qr.size;

  // Draw horizontal line segments
  for (let row = 0; row < size; row++) {
    let start: number | undefined;

    for (let col = 0; col < size; col++) {
      if (mask[row][col] === 0) {
        // End any active run at a fixed feature boundary
        if (start !== undefined) {
          lines += emitHorizontalRun(matrix, row, start, col, sw);
          start = undefined;
        }
        continue;
      }

      if (matrix[row][col] === 1) {
        if (start === undefined) start = col;
      } else {
        if (start !== undefined) {
          lines += emitHorizontalRun(matrix, row, start, col, sw);
          start = undefined;
        }
      }
    }

    if (start !== undefined) {
      lines += emitHorizontalRun(matrix, row, start, size, sw);
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

function emitHorizontalRun(
  matrix: Uint8Array[],
  row: number,
  start: number,
  end: number,
  sw: number,
): string {
  const length = end - start;
  if (length <= 1) return '';

  const x1 = start + 1.5;
  const y = row + 1.5;
  const x2 = end - 1 + 1.5;

  // Zero consumed modules so they don't render as dots
  for (let col = start; col < end; col++) {
    matrix[row][col] = 0;
  }

  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
}
