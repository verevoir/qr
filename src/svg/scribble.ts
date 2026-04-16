import type { QrMatrix, LineWidth } from '../types.js';
import {
  duplicateMatrix,
  fixedFeatureMask,
  strokeWidth,
  dotWidth,
} from './shared.js';

// --- Connected component finding (8-connected) ---

interface Pt {
  row: number;
  col: number;
}

const NEIGHBOURS_8: readonly [number, number][] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

function findComponents(
  matrix: Uint8Array[],
  mask: Uint8Array[],
  size: number,
): Pt[][] {
  const visited: Uint8Array[] = Array.from(
    { length: size },
    () => new Uint8Array(size),
  );
  const components: Pt[][] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (visited[r][c] || mask[r][c] === 0 || matrix[r][c] === 0) continue;

      const comp: Pt[] = [];
      const queue: Pt[] = [{ row: r, col: c }];
      visited[r][c] = 1;

      while (queue.length > 0) {
        const p = queue.shift()!;
        comp.push(p);

        for (const [dr, dc] of NEIGHBOURS_8) {
          const nr = p.row + dr;
          const nc = p.col + dc;
          if (
            nr >= 0 &&
            nr < size &&
            nc >= 0 &&
            nc < size &&
            !visited[nr][nc] &&
            mask[nr][nc] === 1 &&
            matrix[nr][nc] === 1
          ) {
            visited[nr][nc] = 1;
            queue.push({ row: nr, col: nc });
          }
        }
      }

      components.push(comp);
    }
  }

  return components;
}

// --- Walk configuration ---

interface WalkConfig {
  /** Priority table when in the "A" state (e.g. backslash or rightward). */
  prioA: readonly [number, number][];
  /** Priority table when in the "B" state (e.g. slash or leftward). */
  prioB: readonly [number, number][];
  /** Classify a move: returns true for "A", false for "B", null to keep. */
  classify: (dr: number, dc: number) => boolean | null;
  /** Bezier turn radius. 0 = sharp corners, 0.5 = flowing curves. */
  radius: number;
}

// Scribble: diagonal zigzag — prefer \, then /, sweep downward.
const SCRIBBLE_CONFIG: WalkConfig = {
  radius: 0.5,
  prioA: [
    [1, 1], // continue \ down-right
    [1, -1], // turn to / down-left
    [1, 0], // bridge down
    [0, 1], // bridge right
    [0, -1], // bridge left
    [-1, 1], // / up-right (reverse)
    [-1, -1], // \ up-left (reverse)
    [-1, 0], // up (last resort)
  ],
  prioB: [
    [1, -1], // continue / down-left
    [1, 1], // turn to \ down-right
    [1, 0], // bridge down
    [0, -1], // bridge left
    [0, 1], // bridge right
    [-1, -1], // \ up-left (reverse)
    [-1, 1], // / up-right (reverse)
    [-1, 0], // up (last resort)
  ],
  classify(dr, dc) {
    if (dr !== 0 && dc !== 0) return dc === dr; // \ = A, / = B
    return null;
  },
};

// Metro: horizontal zigzag — prefer right, then left, sweep downward.
const METRO_CONFIG: WalkConfig = {
  radius: 0.15,
  prioA: [
    [0, 1], // continue right
    [1, 1], // diagonal down-right (forward momentum)
    [1, 0], // bridge down
    [1, -1], // diagonal down-left (start turning)
    [0, -1], // reverse left
    [-1, 1], // up-right
    [-1, 0], // up
    [-1, -1], // up-left
  ],
  prioB: [
    [0, -1], // continue left
    [1, -1], // diagonal down-left (forward momentum)
    [1, 0], // bridge down
    [1, 1], // diagonal down-right (start turning)
    [0, 1], // reverse right
    [-1, -1], // up-left
    [-1, 0], // up
    [-1, 1], // up-right
  ],
  classify(_dr, dc) {
    if (dc > 0) return true; // rightward = A
    if (dc < 0) return false; // leftward = B
    return null; // vertical — keep current
  },
};

// --- Greedy walk through a component ---

function pickNext(
  current: Pt,
  preferA: boolean,
  config: WalkConfig,
  members: Set<number>,
  visited: Set<number>,
  size: number,
): Pt | null {
  const prio = preferA ? config.prioA : config.prioB;
  for (const [dr, dc] of prio) {
    const nr = current.row + dr;
    const nc = current.col + dc;
    const key = nr * size + nc;
    if (
      nr >= 0 &&
      nr < size &&
      nc >= 0 &&
      nc < size &&
      members.has(key) &&
      !visited.has(key)
    ) {
      return { row: nr, col: nc };
    }
  }
  return null;
}

function walkComponent(
  component: Pt[],
  size: number,
  config: WalkConfig,
): Pt[][] {
  const memberSet = new Set(component.map((p) => p.row * size + p.col));
  const visited = new Set<number>();

  const sorted = [...component].sort((a, b) => a.row - b.row || a.col - b.col);

  const paths: Pt[][] = [];

  for (const start of sorted) {
    const key = start.row * size + start.col;
    if (visited.has(key)) continue;

    const path: Pt[] = [start];
    visited.add(key);

    let current = start;
    let preferA = true;

    while (true) {
      const next = pickNext(current, preferA, config, memberSet, visited, size);
      if (!next) break;

      const dr = next.row - current.row;
      const dc = next.col - current.col;

      const c = config.classify(dr, dc);
      if (c !== null) preferA = c;

      path.push(next);
      visited.add(next.row * size + next.col);
      current = next;
    }

    paths.push(path);
  }

  return paths;
}

// --- Path simplification and smooth rendering ---

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Merge consecutive co-linear points into segments, keeping only turn points. */
function simplify(points: Pt[]): [number, number][] {
  const coords: [number, number][] = points.map((p) => [
    p.col + 1.5,
    p.row + 1.5,
  ]);

  if (coords.length <= 2) return coords;

  const result: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length - 1; i++) {
    const dx1 = coords[i][0] - coords[i - 1][0];
    const dy1 = coords[i][1] - coords[i - 1][1];
    const dx2 = coords[i + 1][0] - coords[i][0];
    const dy2 = coords[i + 1][1] - coords[i][1];
    if (dx1 !== dx2 || dy1 !== dy2) {
      result.push(coords[i]);
    }
  }
  result.push(coords[coords.length - 1]);
  return result;
}

/** Render a simplified point sequence as a smooth SVG path with rounded turns. */
function smoothPath(
  pts: [number, number][],
  sw: number,
  radius: number,
): string {
  if (pts.length === 2) {
    return `<line x1="${pts[0][0]}" y1="${pts[0][1]}" x2="${pts[1][0]}" y2="${pts[1][1]}" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
  }

  let d = `M${pts[0][0]},${pts[0][1]}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const dx1 = curr[0] - prev[0];
    const dy1 = curr[1] - prev[1];
    const dx2 = next[0] - curr[0];
    const dy2 = next[1] - curr[1];

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    const r = Math.min(radius, len1 / 2, len2 / 2);

    // Point just before the turn
    const bx = r2(curr[0] - (dx1 / len1) * r);
    const by = r2(curr[1] - (dy1 / len1) * r);

    // Point just after the turn
    const ax = r2(curr[0] + (dx2 / len2) * r);
    const ay = r2(curr[1] + (dy2 / len2) * r);

    d += ` L${bx},${by}`;
    d += ` Q${curr[0]},${curr[1]} ${ax},${ay}`;
  }

  const last = pts[pts.length - 1];
  d += ` L${last[0]},${last[1]}`;

  return `<path d="${d}" fill="none" stroke="#000" stroke-width="${sw}" stroke-linecap="round"/>`;
}

// --- Shared render logic ---

function renderWithConfig(
  qr: QrMatrix,
  lineWidth: LineWidth,
  config: WalkConfig,
): string {
  const matrix = duplicateMatrix(qr.matrix);
  const mask = fixedFeatureMask(qr);
  const sw = strokeWidth(lineWidth, 0.5);
  const dw = dotWidth(lineWidth, 0.5);
  const size = qr.size;

  const components = findComponents(matrix, mask, size);

  let svg = '';

  for (const comp of components) {
    if (comp.length === 1) {
      const { row, col } = comp[0];
      svg += `<line x1="${col + 1.5}" y1="${row + 1.5}" x2="${col + 1.5}" y2="${row + 1.5}" stroke="#000" stroke-width="${dw}" stroke-linecap="round"/>`;
      continue;
    }

    const paths = walkComponent(comp, size, config);

    for (const path of paths) {
      if (path.length === 1) {
        const { row, col } = path[0];
        svg += `<line x1="${col + 1.5}" y1="${row + 1.5}" x2="${col + 1.5}" y2="${row + 1.5}" stroke="#000" stroke-width="${dw}" stroke-linecap="round"/>`;
      } else {
        const pts = simplify(path);
        svg += smoothPath(pts, sw, config.radius);
      }
    }
  }

  return svg;
}

// --- Public entry points ---

export function renderScribble(qr: QrMatrix, lineWidth: LineWidth): string {
  return renderWithConfig(qr, lineWidth, SCRIBBLE_CONFIG);
}

export function renderMetroScribble(
  qr: QrMatrix,
  lineWidth: LineWidth,
): string {
  return renderWithConfig(qr, lineWidth, METRO_CONFIG);
}
