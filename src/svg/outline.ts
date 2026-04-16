import type { QrMatrix } from '../types.js';
import { trace } from './trace.js';
import type { Trace, Vertex } from './trace.js';

// ---------------------------------------------------------------------------
// Public API — each renderer is a self-contained function that produces
// SVG content (data modules only). Finder patterns and SVG wrapping are
// handled by `toSvg` in index.ts, same as every other style.
// ---------------------------------------------------------------------------

/**
 * Debug renderer — shows the raw walker paths as thin stroked lines
 * and dots as small circles. Paths in black, hole outlines in red.
 *
 * Returns SVG content (not a complete `<svg>` element).
 */
export function renderOutlineDebug(qr: QrMatrix): string {
  const grid = buildDataGrid(qr);
  const traced = trace(grid);
  const tx = 1;
  const ty = 1;
  const sw = 0.25;
  const r = sw / 2;

  let content = '';
  for (const path of traced.paths) {
    content += polyline(path.vertices, tx, ty, '#000', sw);
    for (const hole of path.holeVertices) {
      content += polyline(hole, tx, ty, '#c00', sw);
    }
    for (const dot of path.dots) {
      content += `<circle cx="${fmt(dot.x + 0.5 + tx)}" cy="${fmt(dot.y + 0.5 + ty)}" r="${r}" fill="#c00"/>`;
    }
  }
  for (const dot of traced.dots) {
    content += `<circle cx="${fmt(dot.x + 0.5 + tx)}" cy="${fmt(dot.y + 0.5 + ty)}" r="${r}" fill="#000"/>`;
  }
  return content;
}

/**
 * Filled outline renderer — draws each traced path as a thick stroked
 * line (stroke-width 1 = full cell width) with round joins and caps.
 * The browser handles all the corner/cap geometry natively — no manual
 * offset maths, no miter spikes, no crossover loops.
 *
 * For fabrication/printing: the SVG stroke IS the filled shape.
 * Illustrator can expand strokes to outlines for laser/CNC paths.
 *
 * Returns SVG content (not a complete `<svg>` element).
 */
export function renderOutline(qr: QrMatrix, lineWidth = 1): string {
  const grid = buildDataGrid(qr);
  const traced = trace(grid);
  const tx = 1;
  const ty = 1;
  const dotHalf = lineWidth >= 0.5 ? 0.6 : 0.5; // 1.2-unit diamond when thick

  let content = '';
  for (const path of traced.paths) {
    content += polyline(path.vertices, tx, ty, '#000', lineWidth);
    // Diamond dot at tips (dead-end reversals where prev == next)
    // and at the path's start/close vertex.
    const verts = path.vertices;
    const n = verts.length;
    const seen = new Set<string>();
    const addDiamond = (v: Vertex) => {
      const k = `${v.x},${v.y}`;
      if (seen.has(k)) return;
      seen.add(k);
      content += cellShape('diamond', v.x + 0.5 + tx, v.y + 0.5 + ty, dotHalf, '#000');
    };
    // Start/close point
    if (n > 0) addDiamond(verts[0]);
    // Tips (reversals)
    for (let i = 0; i < n; i++) {
      const prev = verts[(i - 1 + n) % n];
      const next = verts[(i + 1) % n];
      if (prev.x === next.x && prev.y === next.y) addDiamond(verts[i]);
    }
  }
  for (const dot of traced.dots) {
    content += cellShape('diamond', dot.x + 0.5 + tx, dot.y + 0.5 + ty, dotHalf, '#000');
  }

  return content + alignmentOverlay(qr);
}

/**
 * Circuit renderer — like network but with circular dots at tips and
 * rounder corners. Same trace, same stroke approach, different
 * personality.
 */
export function renderCircuit(qr: QrMatrix, lineWidth = 0.5): string {
  const grid = buildDataGrid(qr);
  const traced = trace(grid);
  const tx = 1;
  const ty = 1;
  const dotRadius = lineWidth >= 0.5 ? 0.6 : 0.5; // 1.2-unit circles when thick

  let content = '';
  for (const path of traced.paths) {
    content += polyline(path.vertices, tx, ty, '#000', lineWidth);
    // Circle at tips and start
    const verts = path.vertices;
    const n = verts.length;
    const seen = new Set<string>();
    const addCircle = (v: Vertex) => {
      const k = `${v.x},${v.y}`;
      if (seen.has(k)) return;
      seen.add(k);
      content += `<circle cx="${fmt(v.x + 0.5 + tx)}" cy="${fmt(v.y + 0.5 + ty)}" r="${fmt(dotRadius)}" fill="#000"/>`;
    };
    if (n > 0) addCircle(verts[0]);
    for (let i = 0; i < n; i++) {
      const prev = verts[(i - 1 + n) % n];
      const next = verts[(i + 1) % n];
      if (prev.x === next.x && prev.y === next.y) addCircle(verts[i]);
    }
  }
  for (const dot of traced.dots) {
    content += `<circle cx="${fmt(dot.x + 0.5 + tx)}" cy="${fmt(dot.y + 0.5 + ty)}" r="${fmt(dotRadius)}" fill="#000"/>`;
  }

  return content + alignmentOverlay(qr);
}

function alignmentOverlay(qr: QrMatrix): string {
  let content = '';
  // Overlay clean alignment marks
  for (const [ar, ac] of qr.alignmentCoordinates) {
    const x = ac - 2 + 1;
    const y = ar - 2 + 1;
    content +=
      `<rect x="${x}" y="${y}" width="5" height="5" fill="#000"/>` +
      `<rect x="${x + 1}" y="${y + 1}" width="3" height="3" fill="#fff"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="1" height="1" fill="#000"/>`;
  }
  return content;
}

/**
 * Cell-based renderer — every dark cell becomes a dot of the specified
 * shape and size. Replaces the old renderSquare/renderDots with a
 * single parameterised function.
 *
 * When `renderLight` is true, light cells also render (in the light
 * colour) so the QR can overlay an image with both layers visible.
 */
export function renderCells(
  qr: QrMatrix,
  shape: 'square' | 'circle' | 'diamond',
  dotSize: number,
  renderLight = false,
): string {
  const grid = buildDataGrid(qr);
  const size = qr.size;
  const tx = 1;
  const ty = 1;
  const half = dotSize / 2;
  let content = '';

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      if (cell === 2) continue; // excluded (finder/alignment)
      const dark = cell === 1;
      if (!dark && !renderLight) continue;
      const cx = x + 0.5 + tx;
      const cy = y + 0.5 + ty;
      const fill = dark ? '#000' : '#fff';
      content += cellShape(shape, cx, cy, half, fill);
    }
  }
  return content;
}

function cellShape(
  shape: 'square' | 'circle' | 'diamond',
  cx: number,
  cy: number,
  half: number,
  fill: string,
): string {
  switch (shape) {
    case 'square':
      return `<rect x="${fmt(cx - half)}" y="${fmt(cy - half)}" width="${fmt(half * 2)}" height="${fmt(half * 2)}" fill="${fill}"/>`;
    case 'circle':
      return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(half)}" fill="${fill}"/>`;
    case 'diamond':
      return (
        `<path d="M${fmt(cx)},${fmt(cy - half)}` +
        `L${fmt(cx + half)},${fmt(cy)}` +
        `L${fmt(cx)},${fmt(cy + half)}` +
        `L${fmt(cx - half)},${fmt(cy)}Z" fill="${fill}"/>`
      );
  }
}

// ---------------------------------------------------------------------------
// Data grid
// ---------------------------------------------------------------------------

/**
 * Values: 0 = light data cell, 1 = dark data cell, 2 = excluded
 * (finder/alignment region — rendered separately by renderCorners).
 * The distinction lets renderCells skip excluded cells when drawing
 * light dots, so white dots don't overlay finder/alignment patterns.
 */
function buildDataGrid(qr: QrMatrix): Uint8Array[] {
  const { size, matrix, finderCoordinates, alignmentCoordinates } = qr;
  const excluded = new Set<string>();
  for (const [fr, fc] of finderCoordinates) {
    for (let r = fr; r < Math.min(fr + 7, size); r++) {
      for (let c = fc; c < Math.min(fc + 7, size); c++) {
        excluded.add(`${r},${c}`);
      }
    }
  }
  for (const [ar, ac] of alignmentCoordinates) {
    for (let r = ar - 2; r <= ar + 2; r++) {
      for (let c = ac - 2; c <= ac + 2; c++) {
        if (r >= 0 && r < size && c >= 0 && c < size) {
          excluded.add(`${r},${c}`);
        }
      }
    }
  }
  const grid: Uint8Array[] = [];
  for (let r = 0; r < size; r++) {
    const row = new Uint8Array(size);
    for (let c = 0; c < size; c++) {
      if (excluded.has(`${r},${c}`)) {
        row[c] = 2;
      } else if (matrix[r][c] === 1) {
        row[c] = 1;
      }
    }
    grid.push(row);
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Offset renderer internals
// ---------------------------------------------------------------------------

function renderTraceOffset(traced: Trace, tx: number, ty: number): string {
  const halfWidth = 0.5;
  let d = '';

  for (const path of traced.paths) {
    d += offsetSubpath(path.vertices, halfWidth, tx, ty);
    for (const hole of path.holeVertices) {
      d += offsetSubpath(hole, halfWidth, tx, ty, true);
    }
    for (const dot of path.dots) {
      d += diamondSubpath(dot.x + 0.5, dot.y + 0.5, halfWidth, tx, ty);
    }
  }
  for (const dot of traced.dots) {
    d += diamondSubpath(dot.x + 0.5, dot.y + 0.5, halfWidth, tx, ty);
  }
  return d
    ? `<path d="${d}" fill="#000" fill-rule="nonzero"/>`
    : '';
}

export function offsetSubpath(
  verts: readonly Vertex[],
  halfWidth: number,
  tx: number,
  ty: number,
  reverse = false,
): string {
  const last = verts[verts.length - 1];
  const vertices =
    verts.length > 2 && last.x === verts[0].x && last.y === verts[0].y
      ? verts.slice(0, -1)
      : verts;
  const n = vertices.length;
  if (n < 2) return '';

  const points: { x: number; y: number }[] = [];

  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];

    const cx = curr.x + 0.5;
    const cy = curr.y + 0.5;

    const [u1x, u1y] = unitTan(prev.x + 0.5, prev.y + 0.5, cx, cy);
    const [u2x, u2y] = unitTan(cx, cy, next.x + 0.5, next.y + 0.5);

    const p1x = u1y;
    const p1y = -u1x;
    const p2x = u2y;
    const p2y = -u2x;

    const denom = 1 + u1x * u2x + u1y * u2y;
    if (Math.abs(denom) < 1e-9) {
      points.push({
        x: cx + halfWidth * (u1x + p1x),
        y: cy + halfWidth * (u1y + p1y),
      });
      points.push({
        x: cx + halfWidth * (u1x - p1x),
        y: cy + halfWidth * (u1y - p1y),
      });
    } else {
      const cross = u1x * u2y - u1y * u2x;
      if (cross >= 0) {
        const sx = (p1x + p2x) / denom;
        const sy = (p1y + p2y) / denom;
        points.push({ x: cx + halfWidth * sx, y: cy + halfWidth * sy });
      } else {
        points.push({
          x: cx + halfWidth * (p1x + p2x) / 2,
          y: cy + halfWidth * (p1y + p2y) / 2,
        });
      }
    }
  }

  if (points.length === 0) return '';
  if (reverse) points.reverse();
  let s = `M${fmt(points[0].x + tx)},${fmt(points[0].y + ty)}`;
  for (let i = 1; i < points.length; i++) {
    s += `L${fmt(points[i].x + tx)},${fmt(points[i].y + ty)}`;
  }
  return s + 'Z';
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function diamondSubpath(
  cx: number,
  cy: number,
  half: number,
  tx: number,
  ty: number,
): string {
  const x = cx + tx;
  const y = cy + ty;
  return (
    `M${fmt(x)},${fmt(y - half)}` +
    `L${fmt(x + half)},${fmt(y)}` +
    `L${fmt(x)},${fmt(y + half)}` +
    `L${fmt(x - half)},${fmt(y)}Z`
  );
}

function polyline(
  verts: readonly Vertex[],
  tx: number,
  ty: number,
  color: string,
  strokeWidth: number,
): string {
  if (verts.length < 2) return '';
  let d = `M${fmt(verts[0].x + 0.5 + tx)},${fmt(verts[0].y + 0.5 + ty)}`;
  for (let i = 1; i < verts.length; i++) {
    d += `L${fmt(verts[i].x + 0.5 + tx)},${fmt(verts[i].y + 0.5 + ty)}`;
  }
  d += 'Z';
  return `<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function unitTan(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): [number, number] {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [0, 0];
  return [dx / len, dy / len];
}

function fmt(n: number): string {
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded === 0 ? 0 : rounded);
}
