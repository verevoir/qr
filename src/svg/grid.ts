import type { QrMatrix } from '../types.js';
import { fixedFeatureMask } from './shared.js';

/**
 * Grid renderer — traces outlines of connected dark-module regions
 * as filled SVG paths with rounded corners at convex turns.
 */
export function renderGrid(qr: QrMatrix): string {
  const mask = fixedFeatureMask(qr);
  const size = qr.size;

  // Build a working grid: 1 = dark data module, 0 = anything else
  const grid: number[][] = [];
  for (let row = 0; row < size; row++) {
    grid[row] = [];
    for (let col = 0; col < size; col++) {
      grid[row][col] =
        mask[row][col] === 1 && qr.matrix[row][col] === 1 ? 1 : 0;
    }
  }

  // Find connected components and trace each as a filled path
  const visited = Array.from({ length: size }, () => new Uint8Array(size));
  let out = '';

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (grid[row][col] === 0 || visited[row][col] === 1) continue;

      // Flood-fill to find the component
      const component: [number, number][] = [];
      const queue: [number, number][] = [[row, col]];
      visited[row][col] = 1;

      while (queue.length > 0) {
        const [r, c] = queue.pop()!;
        component.push([r, c]);
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const nr = r + dr;
          const nc = c + dc;
          if (
            nr >= 0 &&
            nr < size &&
            nc >= 0 &&
            nc < size &&
            grid[nr][nc] === 1 &&
            visited[nr][nc] === 0
          ) {
            visited[nr][nc] = 1;
            queue.push([nr, nc]);
          }
        }
      }

      // Build a set for fast lookup
      const cells = new Set(component.map(([r, c]) => `${r},${c}`));
      const path = traceOutline(cells);
      if (path) {
        out += `<path d="${path}" fill="#000" stroke="#000" stroke-width="0.1" stroke-linejoin="round"/>`;
      }
    }
  }

  return out;
}

/**
 * Trace the outer boundary of a connected set of cells.
 * Uses a marching-squares approach on the dual grid (corners between cells).
 * Returns an SVG path string with coordinates offset by +1 for the QR viewbox padding.
 */
function traceOutline(cells: Set<string>): string | null {
  if (cells.size === 0) return null;

  // Find the topmost-leftmost cell to start
  let startRow = Infinity;
  let startCol = Infinity;
  for (const key of cells) {
    const [r, c] = key.split(',').map(Number);
    if (r < startRow || (r === startRow && c < startCol)) {
      startRow = r;
      startCol = c;
    }
  }

  // We trace the outline by walking the boundary edges.
  // Start at the top-left corner of the top-left cell, going right.
  // Directions: 0=right, 1=down, 2=left, 3=up
  const has = (r: number, c: number) => cells.has(`${r},${c}`);

  type Point = [number, number];
  const points: Point[] = [];

  // Start at top-left corner of startRow,startCol moving right
  let x = startCol;
  let y = startRow;
  let dir = 0; // right

  const sx = x;
  const sy = y;
  const sdir = dir;

  do {
    points.push([x, y]);

    // Determine the cell to the left and ahead relative to our direction
    // We use the "left-hand rule": keep the filled area to our left
    let leftCell: boolean;
    let aheadLeftCell: boolean;

    switch (dir) {
      case 0: // moving right: left = cell above-left = (y-1, x)
        leftCell = has(y - 1, x);
        aheadLeftCell = has(y - 1, x + 1) || false;
        break;
      case 1: // moving down: left = cell to-right = (y, x)
        leftCell = has(y, x);
        aheadLeftCell = has(y + 1, x) || false;
        break;
      case 2: // moving left: left = cell below = (y, x-1)
        leftCell = has(y, x - 1);
        aheadLeftCell = has(y, x - 2) || false;
        break;
      case 3: // moving up: left = cell to-left = (y-1, x-1)
        leftCell = has(y - 1, x - 1);
        aheadLeftCell = has(y - 2, x - 1) || false;
        break;
      default:
        leftCell = false;
        aheadLeftCell = false;
    }

    // Advance position based on direction
    switch (dir) {
      case 0:
        x++;
        break;
      case 1:
        y++;
        break;
      case 2:
        x--;
        break;
      case 3:
        y--;
        break;
    }

    // Decision: if the cell to the left is empty, turn left (interior corner)
    // If the cell ahead-left is filled, turn right (exterior corner)
    // Otherwise continue straight
    if (!leftCell) {
      dir = (dir + 3) % 4; // turn left
    } else if (aheadLeftCell) {
      dir = (dir + 1) % 4; // turn right
    }
    // else: continue straight
  } while (!(x === sx && y === sy && dir === sdir));

  if (points.length < 3) return null;

  // Convert to SVG path with +1 offset for viewbox padding
  const ox = 1; // x offset
  const oy = 1; // y offset
  let d = `M${points[0][0] + ox},${points[0][1] + oy}`;
  for (let i = 1; i < points.length; i++) {
    d += `L${points[i][0] + ox},${points[i][1] + oy}`;
  }
  d += 'Z';

  return d;
}
