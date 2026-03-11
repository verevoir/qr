import type { QrMatrix } from '../types.js';
import { renderGrid } from './grid.js';

/**
 * Square renderer — outlines of connected dark-module regions
 * with sharp corners. Fabrication-friendly (closed paths, no strokes).
 */
export function renderSquare(qr: QrMatrix): string {
  return renderGrid(qr, 0);
}
