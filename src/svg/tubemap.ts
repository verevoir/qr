import type { QrMatrix, LineWidth } from '../types.js';
import {
  duplicateMatrix,
  fixedFeatureMask,
  strokeWidth,
  dotWidth,
} from './shared.js';

/**
 * Tubemap renderer — combines diagonal, horizontal, and vertical line segments.
 *
 * Priority order:
 *   1. Diagonal runs (\ and / — both passes share the matrix)
 *   2. Horizontal runs from remaining modules
 *   3. Vertical runs from remaining modules
 *   4. Singles as dots
 *
 * Each module is consumed by at most one pass, so there are no visual overlaps.
 * Round linecaps create natural junctions where lines from different passes meet.
 */
export function renderTubemap(qr: QrMatrix, lineWidth: LineWidth): string {
  const matrix = duplicateMatrix(qr.dataMatrix);
  const mask = fixedFeatureMask(qr);
  const sw = strokeWidth(lineWidth);
  const dw = dotWidth(lineWidth);
  const size = qr.size;
  let lines = '';

  // --- Pass 1: Diagonal \ (top-left to bottom-right) ---
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
          lines += emitDiag(matrix, startRow, startCol, runStart, i, 1, sw);
          runStart = undefined;
        }
        continue;
      }
      if (matrix[row][col] === 1) {
        if (runStart === undefined) runStart = i;
      } else {
        if (runStart !== undefined) {
          lines += emitDiag(matrix, startRow, startCol, runStart, i, 1, sw);
          runStart = undefined;
        }
      }
    }
    if (runStart !== undefined) {
      lines += emitDiag(
        matrix,
        startRow,
        startCol,
        runStart,
        diagLength,
        1,
        sw,
      );
    }
  }

  // --- Pass 2: Diagonal / (top-right to bottom-left) ---
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
          lines += emitDiag(matrix, startRow, startCol, runStart, i, -1, sw);
          runStart = undefined;
        }
        continue;
      }
      if (matrix[row][col] === 1) {
        if (runStart === undefined) runStart = i;
      } else {
        if (runStart !== undefined) {
          lines += emitDiag(matrix, startRow, startCol, runStart, i, -1, sw);
          runStart = undefined;
        }
      }
    }
    if (runStart !== undefined) {
      lines += emitDiag(
        matrix,
        startRow,
        startCol,
        runStart,
        diagLength,
        -1,
        sw,
      );
    }
  }

  // --- Pass 3: Horizontal ---
  for (let row = 0; row < size; row++) {
    let start: number | undefined;
    for (let col = 0; col < size; col++) {
      if (mask[row][col] === 0) {
        if (start !== undefined) {
          lines += emitHorizontal(matrix, row, start, col, sw);
          start = undefined;
        }
        continue;
      }
      if (matrix[row][col] === 1) {
        if (start === undefined) start = col;
      } else {
        if (start !== undefined) {
          lines += emitHorizontal(matrix, row, start, col, sw);
          start = undefined;
        }
      }
    }
    if (start !== undefined) {
      lines += emitHorizontal(matrix, row, start, size, sw);
    }
  }

  // --- Pass 4: Vertical ---
  for (let col = 0; col < size; col++) {
    let start: number | undefined;
    for (let row = 0; row < size; row++) {
      if (mask[row][col] === 0) {
        if (start !== undefined) {
          lines += emitVertical(matrix, col, start, row, sw);
          start = undefined;
        }
        continue;
      }
      if (matrix[row][col] === 1) {
        if (start === undefined) start = row;
      } else {
        if (start !== undefined) {
          lines += emitVertical(matrix, col, start, row, sw);
          start = undefined;
        }
      }
    }
    if (start !== undefined) {
      lines += emitVertical(matrix, col, start, size, sw);
    }
  }

  // --- Pass 5: Remaining singles as dots ---
  let dots = '';
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

// ---------------------------------------------------------------------------
// Emit helpers — each marks consumed modules as 0 in the matrix
// ---------------------------------------------------------------------------

function emitDiag(
  matrix: Uint8Array[],
  diagStartRow: number,
  diagStartCol: number,
  runStart: number,
  runEnd: number,
  colDir: 1 | -1,
  sw: number,
): string {
  const length = runEnd - runStart;
  if (length <= 1) return '';

  const r1 = diagStartRow + runStart;
  const c1 = diagStartCol + colDir * runStart;
  const r2 = diagStartRow + runEnd - 1;
  const c2 = diagStartCol + colDir * (runEnd - 1);

  for (let i = runStart; i < runEnd; i++) {
    matrix[diagStartRow + i][diagStartCol + colDir * i] = 0;
  }

  return `<line x1="${c1 + 1.5}" y1="${r1 + 1.5}" x2="${c2 + 1.5}" y2="${r2 + 1.5}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
}

function emitHorizontal(
  matrix: Uint8Array[],
  row: number,
  start: number,
  end: number,
  sw: number,
): string {
  const length = end - start;
  if (length <= 1) return '';

  for (let col = start; col < end; col++) {
    matrix[row][col] = 0;
  }

  return `<line x1="${start + 1.5}" y1="${row + 1.5}" x2="${end - 1 + 1.5}" y2="${row + 1.5}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
}

function emitVertical(
  matrix: Uint8Array[],
  col: number,
  start: number,
  end: number,
  sw: number,
): string {
  const length = end - start;
  if (length <= 1) return '';

  for (let row = start; row < end; row++) {
    matrix[row][col] = 0;
  }

  return `<line x1="${col + 1.5}" y1="${start + 1.5}" x2="${col + 1.5}" y2="${end - 1 + 1.5}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
}
