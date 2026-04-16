import type { QrMatrix, CornerStyle, SvgColor } from '../types.js';
import { renderCorners } from './corners.js';
import { applyColours } from './shared.js';
import { traceComponents, cellKey } from './trace.js';
import type { CellKey, CellSet, Path } from './trace.js';
import { render } from './render.js';
import { trace as traceNew } from './trace-new.js';
import type { Trace as TraceNew, Vertex as VertexNew } from './trace-new.js';

// ---------------------------------------------------------------------------
// Public treatment API
// ---------------------------------------------------------------------------

/** How 90° corners on connected regions are rendered. */
export type CornerTreatment = 'sharp' | 'rounded';

/**
 * Composable visual treatment for the data-module layer.
 *
 * - `corners` — how miter corners are drawn. Default `'sharp'`.
 * - `inset` — inward offset from the true module edge, in module
 *   units. `0` fills each cell fully; `0.05` fills ~90% (equivalent
 *   to the old `stroke-width: 0.9`); `0.175` fills ~65% (thin).
 *   Default `0`.
 * - `diagonal` — when `true`, cells that share only a corner count as
 *   connected and a small 0.125-module chamfer at each saddle corner
 *   gives the outline a crystalline, linked appearance. Default
 *   `false`.
 */
export interface TreatmentOptions {
  corners?: CornerTreatment;
  inset?: number;
  diagonal?: boolean;
}

/**
 * Sharp corners, no inset — fully-filled cells with crisp 90° joins.
 * The successor to the v1 `metro` style.
 */
export const SHARP: TreatmentOptions = { corners: 'sharp', inset: 0 };

/**
 * Rounded corners, no inset — fully-filled cells with smoothed joins.
 * The successor to the v1 `grid` style.
 */
export const ROUNDED: TreatmentOptions = { corners: 'rounded', inset: 0 };

/**
 * Sharp corners + diagonal-touch chamfering. Cells that meet only at a
 * corner are visually linked by a small 45° bevel at each saddle.
 */
export const SHARP_DIAGONAL: TreatmentOptions = {
  corners: 'sharp',
  inset: 0,
  diagonal: true,
};

/**
 * Rounded corners + diagonal-touch chamfering.
 */
export const ROUNDED_DIAGONAL: TreatmentOptions = {
  corners: 'rounded',
  inset: 0,
  diagonal: true,
};

export interface OutlineOptions {
  /**
   * Visual style of the finder patterns (the three large corner squares).
   * Defaults to `'rounded'`.
   */
  cornerStyle?: CornerStyle;
  /**
   * Visual treatment applied to all data modules and alignment patterns.
   * Defaults to `SHARP` (sharp corners, no inset, no diagonal).
   */
  treatment?: TreatmentOptions;
  /**
   * Colour controls. See `SvgColor` — applied via the root `color`
   * attribute and `--qr-light` custom property.
   */
  color?: SvgColor;
}

/**
 * Render a QR matrix using the two-layer trace + render pipeline.
 *
 * The data modules go through `traceComponents` — which splits the
 * cell set into connected components and runs each through the full
 * `trace()` pipeline (Stage 3–7 creative detectors first, Stage 8
 * faithful outline as fallback). Small diagonally-connected shapes
 * render as their clean geometric form; larger or less regular
 * components render as cell-border outlines. The resulting paths
 * go through `render`, which inflates each edge outward by the
 * requested offset.
 *
 * The finder patterns are rendered separately by `renderCorners`
 * because they always want an identifiable three-square look that's
 * independent of the data-module treatment.
 *
 * Produces an SVG with two named groups so consumers can target
 * each layer independently with CSS or downstream tooling:
 *
 * - `<g id="finder">` — the three finder patterns (`cornerStyle`)
 * - `<g id="data">` — data modules + alignment patterns (`treatment`)
 *
 * Alignment patterns are part of the data group so they pick up the
 * same treatment as surrounding modules.
 */
export function toSvgOutline(
  qr: QrMatrix,
  options: OutlineOptions = {},
): string {
  const cornerStyle = options.cornerStyle ?? 'rounded';
  const treatment = options.treatment ?? SHARP;
  const diagonals = treatment.diagonal ?? false;
  // Treatment.inset shrinks the rendered shape inward by that much on
  // each side; the new per-edge offset is outward-positive, so we
  // negate. `inset: 0` → `offset: 0` → cells-exactly.
  const offset = -(treatment.inset ?? 0);
  const corners = treatment.corners ?? 'sharp';

  // Finder patterns unchanged from the previous pipeline — pass a view
  // with no alignment coordinates so renderCorners ignores them.
  const finderOnlyQr: QrMatrix = { ...qr, alignmentCoordinates: [] };
  const finderContent = renderCorners(finderOnlyQr, cornerStyle);

  // Data modules + alignment patterns via trace + render, component
  // by component. Small diagonally-connected components that match
  // the Stage 3–7 creative detectors render as their clean shape:
  // 3-cell L → 3-vertex triangle (hypotenuse replaces the concave
  // stair-step); 5-cell X → 8-vertex pinwheel with four arms meeting
  // at a single centre point; straight runs → 2-vertex capsule lines.
  // Components that don't match a detector fall through to the
  // Stage 8 unified tracer for a faithful cell-border outline.
  const cells = buildDataCellSet(qr);
  // `saddleNotch: 0.5` makes saddle chamfers genuinely visible at
  // render sizes designers actually use. Smaller notches (tried
  // 0.125) produce mathematically correct diagonals but end up at
  // ~1 pixel of bevel on a 200px QR — invisible in practice. At
  // 0.5 each filled cell has its saddle-corner triangle trimmed,
  // and cells surrounded by saddles (e.g. the centre of an X)
  // render as inscribed diamonds. The scan sweep confirmed every
  // URL length decodes cleanly at every notch from 0.1 through 0.5
  // once the adjacent-saddle trim-overflow bug was fixed. Small
  // components (L triangles, X pinwheels, capsule lines) still use
  // the creative detectors unchanged; the notch only affects
  // Stage 8 fallback geometry.
  const { paths: componentPaths, dots } = traceComponents(cells, {
    diagonals,
    saddleNotch: diagonals ? 0.5 : 0,
  });
  // `render()` expects every filled region as a closed path, so
  // rebuild each single-cell dot into its 4-vertex unit square.
  // `renderNarrow` handles dots natively as diamonds.
  const paths: Path[] = [...componentPaths];
  for (const [c, r] of dots) {
    paths.push([
      [c, r],
      [c + 1, r],
      [c + 1, r + 1],
      [c, r + 1],
    ]);
  }
  // Third iteration: line-like paths at 0.125 (one-eighth cell).
  // NB: this thins the Stage 3 capsule lines and the Stage 6
  // X-pinwheel arms; it does NOT thin the Stage 8 region edges
  // (saddle bridges, concave/convex chamfers). The "diagonal
  // thickness" a caller sees on bigger components is the filled
  // region's perpendicular extent, which is independent of
  // lineThickness. A proper fix wants a detector that pulls
  // diagonal runs out of bigger components and renders them as
  // stroked lines — deferred as a future style variant.
  const lineThickness = 0.125 * (1 - 2 * (treatment.inset ?? 0));
  const pathData = render(paths, {
    offset,
    lineThickness,
    corners,
    translate: [1, 1], //                      1-module padding inside the viewBox
  });
  // `evenodd` rather than the SVG default `nonzero`: when adjacent
  // saddle chamfers produce short overlapping edge fragments on the
  // same cell face, `evenodd` cancels them out correctly. The
  // trade-off is that outer-CW + inner-CCW holes would also punch
  // through — but our trace emits both outer and inner loops as CW
  // for chained `buildBoundaryEdges` output; `evenodd` happens to
  // still punch holes correctly in that case via crossing counts.
  const dataContent = pathData
    ? `<path d="${pathData}" fill="#000" fill-rule="evenodd"/>`
    : '';

  const viewSize = qr.size + 2;
  const color = options.color ?? {};
  const coloured = applyColours(
    `<g id="finder">${finderContent}</g><g id="data">${dataContent}</g>`,
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
 * Outline renderer using the new per-cell DFS walker (trace-new.ts).
 *
 * Renders each traced component as a filled polygon with holes cut
 * out via `evenodd` fill-rule. Single-cell dots (standalone or
 * inside holes) render as diamonds. The walker's vertex output maps
 * directly to SVG coordinates — each vertex `{x, y}` is the
 * top-left corner of the cell at column `x`, row `y` in grid space.
 *
 * Hole outlines are emitted as additional sub-paths inside the same
 * `<path>` element; `evenodd` makes them punch through regardless
 * of winding order.
 */
export function toSvgOutlineNarrow(
  qr: QrMatrix,
  options: OutlineOptions = {},
): string {
  const cornerStyle = options.cornerStyle ?? 'rounded';

  const finderOnlyQr: QrMatrix = { ...qr, alignmentCoordinates: [] };
  const finderContent = renderCorners(finderOnlyQr, cornerStyle);

  const grid = buildDataGrid(qr);
  const traced = traceNew(grid);
  const pathData = renderTraceNew(traced, 1, 1);

  const dataContent = pathData
    ? `<path d="${pathData}" fill="#000" fill-rule="nonzero"/>`
    : '';

  const viewSize = qr.size + 2;
  const color = options.color ?? {};
  const coloured = applyColours(
    `<g id="finder">${finderContent}</g><g id="data">${dataContent}</g>`,
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
  const traced = traceNew(grid);
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

function debugPolyline(
  verts: readonly VertexNew[],
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

/**
 * Convert the QR matrix into a `Uint8Array[]` grid suitable for
 * `trace-new.ts`, with finder regions zeroed out.
 */
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

/**
 * Render trace-new output as an SVG path-data string.
 *
 * The walker's vertices are a centreline through cell positions.
 * Each edge is offset perpendicular to produce the actual boundary:
 *
 * - Outer outlines inflate outward (left-hand perpendicular for CW
 *   winding) by `halfWidth`, producing the shape's filled boundary.
 * - Hole outlines deflate inward (right-hand perpendicular) by
 *   `halfWidth`, so they cut into the shape.
 * - Dots (standalone + hole-dots) render as diamonds.
 *
 * At each vertex the miter point of adjacent offset edges is
 * computed. 180° reversals (dead-end spikes) emit a flat cap.
 */
function renderTraceNew(
  traced: TraceNew,
  tx: number,
  ty: number,
): string {
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

/**
 * Offset a closed centreline path perpendicular to each edge,
 * computing miter joins at corners. Falls back to a bevel (two
 * points) when the miter ratio exceeds `MITER_LIMIT` to prevent
 * spikes at sharp DFS-backtrack turns.
 *
 * Vertices are cell positions `{x, y}`, shifted to cell centres
 * `(x+0.5, y+0.5)` before offsetting.
 *
 * `halfWidth > 0` inflates outward (for outer boundaries).
 * When `reverse` is true, the output polygon winds CCW — used for
 * hole subpaths so `fill-rule="nonzero"` punches them through.
 */
export function offsetSubpath(
  verts: readonly VertexNew[],
  halfWidth: number,
  tx: number,
  ty: number,
  reverse = false,
): string {
  // Strip duplicate closing vertex — the walker emits start at both
  // ends, but the offset loop wraps cyclically so the last→first
  // edge is implicit.
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

    const [u1x, u1y] = unitTan(
      prev.x + 0.5,
      prev.y + 0.5,
      cx,
      cy,
    );
    const [u2x, u2y] = unitTan(cx, cy, next.x + 0.5, next.y + 0.5);

    // Left-hand perpendiculars (outward for CW in SVG y-down)
    const p1x = u1y;
    const p1y = -u1x;
    const p2x = u2y;
    const p2y = -u2x;

    const denom = 1 + u1x * u2x + u1y * u2y;
    if (Math.abs(denom) < 1e-9) {
      // 180° reversal — square cap extending halfWidth beyond the
      // vertex along the incoming edge direction, so degenerate
      // capsules (2-vertex lines) cover both cells fully.
      points.push({
        x: cx + halfWidth * (u1x + p1x),
        y: cy + halfWidth * (u1y + p1y),
      });
      points.push({
        x: cx + halfWidth * (u1x - p1x),
        y: cy + halfWidth * (u1y - p1y),
      });
    } else {
      // Cross product of tangent vectors determines whether the left
      // side of the CW path is the outside (convex) or inside
      // (concave) of this turn.
      const cross = u1x * u2y - u1y * u2x;
      if (cross >= 0) {
        // Outside corner (CW turn) — miter gives a clean sharp point
        const sx = (p1x + p2x) / denom;
        const sy = (p1y + p2y) / denom;
        points.push({
          x: cx + halfWidth * sx,
          y: cy + halfWidth * sy,
        });
      } else {
        // Inside corner (CCW turn) — average the two offset points
        // to prevent the crossover loop that a miter would create
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

function fmt(n: number): string {
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded === 0 ? 0 : rounded);
}

/**
 * Collect every dark data module (and alignment module) into a
 * `CellSet`, excluding the three 7×7 finder regions which are
 * rendered separately.
 */
function buildDataCellSet(qr: QrMatrix): CellSet {
  const { size, matrix, finderCoordinates } = qr;
  const excluded = new Set<string>();
  for (const [fr, fc] of finderCoordinates) {
    for (let r = fr; r < Math.min(fr + 7, size); r++) {
      for (let c = fc; c < Math.min(fc + 7, size); c++) {
        excluded.add(`${r},${c}`);
      }
    }
  }
  const cells = new Set<CellKey>();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1 && !excluded.has(`${r},${c}`)) {
        cells.add(cellKey(r, c));
      }
    }
  }
  return cells;
}
