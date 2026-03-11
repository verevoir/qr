import type { QrMatrix, LineWidth } from '../types.js';
import {
  duplicateMatrix,
  fixedFeatureMask,
  strokeWidth,
  dotWidth,
} from './shared.js';

export function renderDiagonal(qr: QrMatrix, lineWidth: LineWidth): string {
  const matrix = duplicateMatrix(qr.matrix);
  const mask = fixedFeatureMask(qr);
  const sw = strokeWidth(lineWidth);
  const dw = dotWidth(lineWidth);
  let lines = '';
  let dots = '';

  const size = qr.size;

  // Scan top-left to bottom-right diagonals (\)
  // There are 2*size - 1 diagonals.
  // Diagonal d: starts at (max(0, d-size+1), max(0, size-1-d))
  for (let d = 0; d < 2 * size - 1; d++) {
    const startRow = Math.max(0, d - size + 1);
    const startCol = Math.max(0, size - 1 - d);
    const diagLength = Math.min(size - startRow, size - startCol);

    let runStart: number | undefined;

    for (let i = 0; i < diagLength; i++) {
      const row = startRow + i;
      const col = startCol + i;

      if (mask[row][col] === 0) {
        if (runStart !== undefined) {
          lines += emitDiagonalRun(matrix, startRow, startCol, runStart, i, sw);
          runStart = undefined;
        }
        continue;
      }

      if (matrix[row][col] === 1) {
        if (runStart === undefined) runStart = i;
      } else {
        if (runStart !== undefined) {
          lines += emitDiagonalRun(matrix, startRow, startCol, runStart, i, sw);
          runStart = undefined;
        }
      }
    }

    if (runStart !== undefined) {
      lines += emitDiagonalRun(
        matrix,
        startRow,
        startCol,
        runStart,
        diagLength,
        sw,
      );
    }
  }

  // Scan top-right to bottom-left diagonals (/)
  for (let d = 0; d < 2 * size - 1; d++) {
    const startRow = Math.max(0, d - size + 1);
    const startCol = Math.min(size - 1, d);
    const diagLength = Math.min(size - startRow, startCol + 1);

    let runStart: number | undefined;

    for (let i = 0; i < diagLength; i++) {
      const row = startRow + i;
      const col = startCol - i;

      if (mask[row][col] === 0) {
        if (runStart !== undefined) {
          lines += emitAntiDiagonalRun(
            matrix,
            startRow,
            startCol,
            runStart,
            i,
            sw,
          );
          runStart = undefined;
        }
        continue;
      }

      if (matrix[row][col] === 1) {
        if (runStart === undefined) runStart = i;
      } else {
        if (runStart !== undefined) {
          lines += emitAntiDiagonalRun(
            matrix,
            startRow,
            startCol,
            runStart,
            i,
            sw,
          );
          runStart = undefined;
        }
      }
    }

    if (runStart !== undefined) {
      lines += emitAntiDiagonalRun(
        matrix,
        startRow,
        startCol,
        runStart,
        diagLength,
        sw,
      );
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

function emitDiagonalRun(
  matrix: Uint8Array[],
  diagStartRow: number,
  diagStartCol: number,
  runStart: number,
  runEnd: number,
  sw: number,
): string {
  const length = runEnd - runStart;
  if (length <= 1) return '';

  const r1 = diagStartRow + runStart;
  const c1 = diagStartCol + runStart;
  const r2 = diagStartRow + runEnd - 1;
  const c2 = diagStartCol + runEnd - 1;

  for (let i = runStart; i < runEnd; i++) {
    matrix[diagStartRow + i][diagStartCol + i] = 0;
  }

  return `<line x1="${c1 + 1.5}" y1="${r1 + 1.5}" x2="${c2 + 1.5}" y2="${r2 + 1.5}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
}

function emitAntiDiagonalRun(
  matrix: Uint8Array[],
  diagStartRow: number,
  diagStartCol: number,
  runStart: number,
  runEnd: number,
  sw: number,
): string {
  const length = runEnd - runStart;
  if (length <= 1) return '';

  const r1 = diagStartRow + runStart;
  const c1 = diagStartCol - runStart;
  const r2 = diagStartRow + runEnd - 1;
  const c2 = diagStartCol - (runEnd - 1);

  for (let i = runStart; i < runEnd; i++) {
    matrix[diagStartRow + i][diagStartCol - i] = 0;
  }

  return `<line x1="${c1 + 1.5}" y1="${r1 + 1.5}" x2="${c2 + 1.5}" y2="${r2 + 1.5}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
}
