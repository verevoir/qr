import type { QrMatrix, CornerStyle, SvgColor } from '../types.js';
import { renderCorners } from './corners.js';
import { applyColours } from './shared.js';
import { trace } from './trace.js';
import type { Trace, Vertex } from './trace.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OutlineOptions {
  /**
   * Visual style of the finder patterns (the three large corner squares).
   * Defaults to `'rounded'`.
   */
  cornerStyle?: CornerStyle;
  /**
   * Colour controls. See `SvgColor` — applied via the root `color`
   * attribute and `--qr-light` custom property.
   */
  color?: SvgColor;
}

/**
 * Outline renderer using the per-cell DFS walker.
 *
 * Renders each traced path as a filled offset polygon (miter joins on
 * outside corners, averaged joins on inside corners, square caps at
 * 180° reversals). Dots render as diamonds. Alignment patterns are
 * overlaid as clean concentric squares.
 *
 * Produces an SVG with two named groups:
 * - `<g id="finder">` — the three finder patterns
 * - `<g id="data">` — data modules + alignment overlays
 */
export function toSvgOutlineNarrow(
  qr: QrMatrix,
  options: OutlineOptions = {},
): string {
  const cornerStyle = options.cornerStyle ?? 'rounded';

  const finderOnlyQr: QrMatrix = { ...qr, alignmentCoordinates: [] };
  const finderContent = renderCorners(finderOnlyQr, cornerStyle);

  const grid = buildDataGrid(qr);
  const traced = trace(grid);
  const pathData = renderTrace(traced, 1, 1);

  let alignContent = '';
  for (const [ar, ac] of qr.alignmentCoordinates) {
    const x = ac - 2 + 1;
    const y = ar - 2 + 1;
    alignContent +=
      `<rect x="${x}" y="${y}" width="5" height="5" fill="#000"/>` +
      `<rect x="${x + 1}" y="${y + 1}" width="3" height="3" fill="#fff"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="1" height="1" fill="#000"/>`;
  }

  const dataContent = pathData
    ? `<path d="${pathData}" fill="#000" fill-rule="nonzero"/>`
    : '';

  const viewSize = qr.size + 2;
  const color = options.color ?? {};
  const coloured = applyColours(
    `<g id="finder">${finderContent}</g><g id="data">${dataContent}${alignContent}</g>`,
    color,
  );
  const bg = color.background
    ? `<rect width="${viewSize}" height="${viewSize}" fill="${color.background}"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}">` +
    bg +
    coloured +
    `</svg>`
  );
}

/**
 * Debug renderer — shows the raw walker paths as thin stroked lines
 * and dots as small circles. No offset maths, no fill-rule gymnastics.
 * Just "what did the walker produce?" rendered visually.
 *
 * Paths: thin black stroked polylines (stroke-width 0.25).
 * Holes: thin red stroked polylines.
 * Dots: small black filled circles (r=0.125).
 * Hole-dots: small red filled circles.
 */
export function toSvgOutlineDebug(
  qr: QrMatrix,
  options: OutlineOptions = {},
): string {
  const cornerStyle = options.cornerStyle ?? 'rounded';
  const finderOnlyQr: QrMatrix = { ...qr, alignmentCoordinates: [] };
  const finderContent = renderCorners(finderOnlyQr, cornerStyle);

  const grid = buildDataGrid(qr);
  const traced = trace(grid);
  const tx = 1;
  const ty = 1;
  const sw = 0.25;
  const r = sw / 2;

  let dataContent = '';
  for (const path of traced.paths) {
    dataContent += debugPolyline(path.vertices, tx, ty, '#000', sw);
    for (const hole of path.holeVertices) {
      dataContent += debugPolyline(hole, tx, ty, '#c00', sw);
    }
    for (const dot of path.dots) {
      dataContent += `<circle cx="${fmt(dot.x + 0.5 + tx)}" cy="${fmt(dot.y + 0.5 + ty)}" r="${r}" fill="#c00"/>`;
    }
  }
  for (const dot of traced.dots) {
    dataContent += `<circle cx="${fmt(dot.x + 0.5 + tx)}" cy="${fmt(dot.y + 0.5 + ty)}" r="${r}" fill="#000"/>`;
  }

  const viewSize = qr.size + 2;
  const color = options.color ?? {};
  const coloured = applyColours(
    `<g id="finder">${finderContent}</g><g id="data">${dataContent}</g>`,
    color,
  );
  const bg = color.background
    ? `<rect width="${viewSize}" height="${viewSize}" fill="${color.background}"/>`
    : `<rect width="${viewSize}" height="${viewSize}" fill="#fff"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}">` +
    bg +
    coloured +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildDataGrid(qr: QrMatrix): Uint8Array[] {
  const { size, matrix, finderCoordinates } = qr;
  const excluded = new Set<string>();
  for (const [fr, fc] of finderCoordinates) {
    for (let r = fr; r < Math.min(fr + 7, size); r++) {
      for (let c = fc; c < Math.min(fc + 7, size); c++) {
        excluded.add(`${r},${c}`);
      }
    }
  }
  const grid: Uint8Array[] = [];
  for (let r = 0; r < size; r++) {
    const row = new Uint8Array(size);
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1 && !excluded.has(`${r},${c}`)) row[c] = 1;
    }
    grid.push(row);
  }
  return grid;
}

function renderTrace(traced: Trace, tx: number, ty: number): string {
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
  return d;
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

function debugPolyline(
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
