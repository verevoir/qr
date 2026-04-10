import type { QrMatrix } from '../types.js';
import { fixedFeatureMask } from './shared.js';

/**
 * Outline renderer — traces outlines of connected dark-module regions
 * as filled SVG paths. Uses edge-based boundary tracing for correctness.
 *
 * @param cornerRadius — quadratic bezier radius at path corners (0 = sharp)
 */
export function renderGrid(qr: QrMatrix, cornerRadius = 0.25): string {
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

  // Find connected components via flood-fill
  const visited = Array.from({ length: size }, () => new Uint8Array(size));
  let out = '';

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (grid[row][col] === 0 || visited[row][col] === 1) continue;

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

      const cells = new Set(component.map(([r, c]) => `${r},${c}`));
      const path = traceOutline(cells, cornerRadius);
      if (path) {
        out += `<path d="${path}" fill="#000" fill-rule="evenodd"/>`;
      }
    }
  }

  return out;
}

/**
 * Trace the boundary of a connected set of cells using directed boundary edges.
 *
 * For each cell, checks its 4 edges. An edge is a boundary edge if the
 * neighbour across it is not in the set. Edges are directed so the filled
 * cell is always to the left of the travel direction (counterclockwise
 * for outer boundaries, clockwise for holes).
 *
 * For 4-connected components, each dual-grid vertex has exactly one
 * incoming and one outgoing boundary edge, so chaining is unambiguous.
 */
function traceOutline(cells: Set<string>, cornerRadius: number): string | null {
  if (cells.size === 0) return null;

  const has = (r: number, c: number) => cells.has(`${r},${c}`);

  // Collect directed boundary edges on the dual grid.
  // Cell (r,c) occupies the square from vertex (c,r) to vertex (c+1,r+1).
  interface DEdge {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  const edges: DEdge[] = [];

  for (const key of cells) {
    const [r, c] = key.split(',').map(Number);
    if (!has(r - 1, c)) edges.push({ x1: c, y1: r, x2: c + 1, y2: r }); // top
    if (!has(r, c + 1)) edges.push({ x1: c + 1, y1: r, x2: c + 1, y2: r + 1 }); // right
    if (!has(r + 1, c)) edges.push({ x1: c + 1, y1: r + 1, x2: c, y2: r + 1 }); // bottom
    if (!has(r, c - 1)) edges.push({ x1: c, y1: r + 1, x2: c, y2: r }); // left
  }

  // Index edges by start vertex
  const fromMap = new Map<string, DEdge[]>();
  for (const e of edges) {
    const k = `${e.x1},${e.y1}`;
    if (!fromMap.has(k)) fromMap.set(k, []);
    fromMap.get(k)!.push(e);
  }

  // Chain edges into closed loops and build SVG path
  const used = new Set<DEdge>();
  const ox = 1;
  const oy = 1;
  let d = '';

  for (const startEdge of edges) {
    if (used.has(startEdge)) continue;

    // Collect all vertices in this loop
    const points: [number, number][] = [];
    points.push([startEdge.x1, startEdge.y1]);
    points.push([startEdge.x2, startEdge.y2]);
    used.add(startEdge);

    let cur = startEdge;

    while (true) {
      const k = `${cur.x2},${cur.y2}`;
      const candidates = fromMap.get(k);
      if (!candidates) break;

      let next: DEdge | undefined;
      for (const c of candidates) {
        if (!used.has(c)) {
          next = c;
          break;
        }
      }

      if (!next) break;
      used.add(next);

      if (next.x2 === startEdge.x1 && next.y2 === startEdge.y1) break;

      points.push([next.x2, next.y2]);
      cur = next;
    }

    // Remove collinear intermediate points
    const simplified = simplifyLoop(points);

    if (cornerRadius > 0) {
      d += roundedSubpath(simplified, ox, oy, cornerRadius);
    } else {
      d += `M${simplified[0][0] + ox},${simplified[0][1] + oy}`;
      for (let i = 1; i < simplified.length; i++) {
        d += `L${simplified[i][0] + ox},${simplified[i][1] + oy}`;
      }
      d += 'Z';
    }
  }

  return d || null;
}

/**
 * Build a rounded SVG subpath for one closed loop of corner points.
 * At each corner, the last `r` units of the incoming edge and the first `r`
 * units of the outgoing edge are replaced with a quadratic bezier curve
 * whose control point is the original corner vertex.
 */
function roundedSubpath(
  pts: [number, number][],
  ox: number,
  oy: number,
  r: number,
): string {
  const n = pts.length;
  if (n < 3) {
    // Degenerate — just emit straight lines
    let s = `M${pts[0][0] + ox},${pts[0][1] + oy}`;
    for (let i = 1; i < n; i++) s += `L${pts[i][0] + ox},${pts[i][1] + oy}`;
    return s + 'Z';
  }

  let s = '';

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    // Direction from prev → curr
    const dx0 = curr[0] - prev[0];
    const dy0 = curr[1] - prev[1];
    const len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);

    // Direction from curr → next
    const dx1 = next[0] - curr[0];
    const dy1 = next[1] - curr[1];
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

    // Clamp radius so it doesn't exceed half the shorter edge
    const cr = Math.min(r, len0 / 2, len1 / 2);

    // Point where curve starts (on prev→curr edge, r before curr)
    const ax = curr[0] - (dx0 / len0) * cr + ox;
    const ay = curr[1] - (dy0 / len0) * cr + oy;

    // Point where curve ends (on curr→next edge, r after curr)
    const bx = curr[0] + (dx1 / len1) * cr + ox;
    const by = curr[1] + (dy1 / len1) * cr + oy;

    // Control point is the original corner
    const cx = curr[0] + ox;
    const cy = curr[1] + oy;

    if (i === 0) {
      s += `M${ax},${ay}`;
    } else {
      s += `L${ax},${ay}`;
    }

    s += `Q${cx},${cy},${bx},${by}`;
  }

  return s + 'Z';
}

/** Remove points that lie on a straight line between their neighbours. */
function simplifyLoop(pts: [number, number][]): [number, number][] {
  if (pts.length <= 3) return pts;

  const n = pts.length;
  const result: [number, number][] = [];

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const dx1 = curr[0] - prev[0];
    const dy1 = curr[1] - prev[1];
    const dx2 = next[0] - curr[0];
    const dy2 = next[1] - curr[1];

    // Keep if direction changes (cross product ≠ 0)
    if (dx1 * dy2 !== dy1 * dx2) {
      result.push(curr);
    }
  }

  return result.length >= 3 ? result : pts;
}
