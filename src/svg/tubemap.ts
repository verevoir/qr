import type { QrMatrix, LineWidth } from '../types.js';
import {
  duplicateMatrix,
  fixedFeatureMask,
  strokeWidth,
  dotWidth,
} from './shared.js';

/**
 * Tubemap renderer — diagonal-first, then horizontal and vertical fill in the gaps.
 * Each module is consumed by at most one pass (no visual overlaps).
 *
 * Priority: diagonal \ → diagonal / → horizontal → vertical → singles.
 */
export function renderTubemap(qr: QrMatrix, lineWidth: LineWidth): string {
  const matrix = duplicateMatrix(qr.matrix);
  const mask = fixedFeatureMask(qr);
  const sw = strokeWidth(lineWidth);
  const dw = dotWidth(lineWidth);
  const size = qr.size;
  let lines = '';

  const isDark = (row: number, col: number) =>
    mask[row][col] === 1 && matrix[row][col] === 1;

  const consume = (row: number, col: number) => {
    matrix[row][col] = 0;
  };

  // --- Diagonal \ ---
  for (let d = 0; d < 2 * size - 1; d++) {
    const sRow = Math.max(0, d - size + 1);
    const sCol = Math.max(0, size - 1 - d);
    const len = Math.min(size - sRow, size - sCol);
    let rs: number | undefined;
    for (let i = 0; i <= len; i++) {
      const dark = i < len && isDark(sRow + i, sCol + i);
      if (dark) {
        if (rs === undefined) rs = i;
      } else if (rs !== undefined) {
        if (i - rs >= 2) {
          const r1 = sRow + rs,
            c1 = sCol + rs,
            r2 = sRow + i - 1,
            c2 = sCol + i - 1;
          lines += line(c1, r1, c2, r2, sw);
          for (let j = rs; j < i; j++) consume(sRow + j, sCol + j);
        }
        rs = undefined;
      }
    }
  }

  // --- Diagonal / ---
  for (let d = 0; d < 2 * size - 1; d++) {
    const sRow = Math.max(0, d - size + 1);
    const sCol = Math.min(size - 1, d);
    const len = Math.min(size - sRow, sCol + 1);
    let rs: number | undefined;
    for (let i = 0; i <= len; i++) {
      const dark = i < len && isDark(sRow + i, sCol - i);
      if (dark) {
        if (rs === undefined) rs = i;
      } else if (rs !== undefined) {
        if (i - rs >= 2) {
          const r1 = sRow + rs,
            c1 = sCol - rs,
            r2 = sRow + i - 1,
            c2 = sCol - (i - 1);
          lines += line(c1, r1, c2, r2, sw);
          for (let j = rs; j < i; j++) consume(sRow + j, sCol - j);
        }
        rs = undefined;
      }
    }
  }

  // --- Horizontal ---
  for (let row = 0; row < size; row++) {
    let start: number | undefined;
    for (let col = 0; col <= size; col++) {
      const dark = col < size && isDark(row, col);
      if (dark) {
        if (start === undefined) start = col;
      } else if (start !== undefined) {
        if (col - start >= 2) {
          lines += line(start, row, col - 1, row, sw);
          for (let c = start; c < col; c++) consume(row, c);
        }
        start = undefined;
      }
    }
  }

  // --- Vertical ---
  for (let col = 0; col < size; col++) {
    let start: number | undefined;
    for (let row = 0; row <= size; row++) {
      const dark = row < size && isDark(row, col);
      if (dark) {
        if (start === undefined) start = row;
      } else if (start !== undefined) {
        if (row - start >= 2) {
          lines += line(col, start, col, row - 1, sw);
          for (let r = start; r < row; r++) consume(r, col);
        }
        start = undefined;
      }
    }
  }

  // --- Singles ---
  let dots = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (isDark(row, col)) {
        dots += dot(col, row, dw);
      }
    }
  }

  return lines + dots;
}

/**
 * Metro renderer — horizontal over vertical over diagonal.
 * All passes read the original matrix independently; lines may visually
 * overlap at crossing points (same-colour strokes, invisible overlap).
 * Produces the classic tube-map / metro-map layered-line aesthetic.
 *
 * Priority: diagonal (bottom) → vertical → horizontal (top).
 * SVG paints later elements on top, so emit in bottom-to-top order.
 */
export function renderMetro(qr: QrMatrix, lineWidth: LineWidth): string {
  const mask = fixedFeatureMask(qr);
  const sw = strokeWidth(lineWidth);
  const dw = dotWidth(lineWidth);
  const size = qr.size;

  const isDark = (row: number, col: number) =>
    row >= 0 &&
    row < size &&
    col >= 0 &&
    col < size &&
    mask[row][col] === 1 &&
    qr.matrix[row][col] === 1;

  // Track which modules appear in at least one run (for singles pass)
  const covered = Array.from({ length: size }, () => new Uint8Array(size));

  let diagLines = '';
  let vLines = '';
  let hLines = '';

  // --- Diagonal \ (bottom layer) ---
  for (let d = 0; d < 2 * size - 1; d++) {
    const sRow = Math.max(0, d - size + 1);
    const sCol = Math.max(0, size - 1 - d);
    const len = Math.min(size - sRow, size - sCol);
    let rs: number | undefined;
    for (let i = 0; i <= len; i++) {
      const dark = i < len && isDark(sRow + i, sCol + i);
      if (dark) {
        if (rs === undefined) rs = i;
      } else if (rs !== undefined) {
        if (i - rs >= 2) {
          const r1 = sRow + rs,
            c1 = sCol + rs,
            r2 = sRow + i - 1,
            c2 = sCol + i - 1;
          diagLines += line(c1, r1, c2, r2, sw);
          for (let j = rs; j < i; j++) covered[sRow + j][sCol + j] = 1;
        }
        rs = undefined;
      }
    }
  }

  // --- Diagonal / (bottom layer) ---
  for (let d = 0; d < 2 * size - 1; d++) {
    const sRow = Math.max(0, d - size + 1);
    const sCol = Math.min(size - 1, d);
    const len = Math.min(size - sRow, sCol + 1);
    let rs: number | undefined;
    for (let i = 0; i <= len; i++) {
      const dark = i < len && isDark(sRow + i, sCol - i);
      if (dark) {
        if (rs === undefined) rs = i;
      } else if (rs !== undefined) {
        if (i - rs >= 2) {
          const r1 = sRow + rs,
            c1 = sCol - rs,
            r2 = sRow + i - 1,
            c2 = sCol - (i - 1);
          diagLines += line(c1, r1, c2, r2, sw);
          for (let j = rs; j < i; j++) covered[sRow + j][sCol - j] = 1;
        }
        rs = undefined;
      }
    }
  }

  // --- Vertical (middle layer) ---
  for (let col = 0; col < size; col++) {
    let start: number | undefined;
    for (let row = 0; row <= size; row++) {
      const dark = row < size && isDark(row, col);
      if (dark) {
        if (start === undefined) start = row;
      } else if (start !== undefined) {
        if (row - start >= 2) {
          vLines += line(col, start, col, row - 1, sw);
          for (let r = start; r < row; r++) covered[r][col] = 1;
        }
        start = undefined;
      }
    }
  }

  // --- Horizontal (top layer) ---
  for (let row = 0; row < size; row++) {
    let start: number | undefined;
    for (let col = 0; col <= size; col++) {
      const dark = col < size && isDark(row, col);
      if (dark) {
        if (start === undefined) start = col;
      } else if (start !== undefined) {
        if (col - start >= 2) {
          hLines += line(start, row, col - 1, row, sw);
          for (let c = start; c < col; c++) covered[row][c] = 1;
        }
        start = undefined;
      }
    }
  }

  // --- Singles (modules not in any run) ---
  let dots = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (isDark(row, col) && covered[row][col] === 0) {
        dots += dot(col, row, dw);
      }
    }
  }

  // Bottom to top: diagonal → vertical → horizontal → singles
  return diagLines + vLines + hLines + dots;
}

// ---------------------------------------------------------------------------
// SVG primitives
// ---------------------------------------------------------------------------

function line(
  c1: number,
  r1: number,
  c2: number,
  r2: number,
  sw: number,
): string {
  return `<line x1="${c1 + 1.5}" y1="${r1 + 1.5}" x2="${c2 + 1.5}" y2="${r2 + 1.5}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
}

function dot(col: number, row: number, dw: number): string {
  return `<line x1="${col + 1.5}" y1="${row + 1.5}" x2="${col + 1.5}" y2="${row + 1.5}" stroke="#000" stroke-width="${dw}" stroke-linecap="round"/>`;
}
