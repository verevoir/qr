/**
 * Two-layer outline pipeline — stage 2: rendering.
 *
 * Takes the ordered clockwise paths produced by `trace.ts` and
 * inflates them into a filled SVG outline via per-edge offset.
 *
 * ## How offsetting works
 *
 * Each edge `A → B` of every path is pushed outward — along its
 * left-hand perpendicular in SVG screen coordinates (y-down) — by
 * `offset`. The tracer's clockwise winding guarantees that left-hand
 * is always the *outward* direction (away from the filled interior),
 * so outer boundaries expand and inner holes shrink, thickening the
 * filled outline in both directions. At each vertex, the new corner
 * is the intersection of the two adjacent offset lines.
 *
 * Three geometric cases, all handled by one pass:
 *
 * - **Ordinary corner** (turn angle anywhere between 0° and 360°
 *   except 180°): the two offset lines meet at a miter point. The
 *   shift from the original vertex to the miter is
 *   `offset × (p1 + p2) / (1 + u1·u2)` where `p1`/`p2` are the two
 *   left-hand perpendiculars and `u1`/`u2` the unit tangents.
 * - **180° reversal** (two edges pointing opposite directions — the
 *   tips of a degenerate 2-vertex line, the arm tips of an X saddle):
 *   the miter formula would divide by zero. Emit two vertices
 *   instead — one at the end of the incoming offset edge and one at
 *   the start of the outgoing offset edge — producing a flat cap.
 * - **Concave turn** (interior angle > 180°, e.g. the inside corner
 *   of an L): the miter still exists and points into the concavity.
 *   This correctly fills part of the notch for thick outlines.
 *
 * The emitted string is the value of an SVG `d` attribute, so it
 * can be dropped straight into `<path d="...">`. Consumers should
 * render with the SVG default `fill-rule="nonzero"` so that outer
 * clockwise + inner counter-clockwise windings combine into
 * filled-with-holes.
 */

import type { Path, Trace, Vertex } from './trace.js';

export interface RenderOptions {
  /**
   * Signed perpendicular distance applied to every edge of a region
   * path. Positive expands outward (grows outer boundaries, shrinks
   * holes); negative shrinks inward. Default `0` — renders region
   * outlines cells-exactly. Does NOT apply to line-like paths
   * (2-vertex capsules, self-intersecting arm pinwheels) — those use
   * `lineThickness` instead, so thick capsules stay thick regardless
   * of whether you're inflating or deflating the region shapes.
   */
  readonly offset?: number;
  /**
   * Full width of a line-like path in module units — applied to
   * 2-vertex capsule lines and to multi-vertex paths that contain
   * 180° reversals (Stage 6 X pinwheel, etc.). Default `1.0` (full
   * cell width). Reduce for "thin" variants — the narrower the line,
   * the less dark area spills into light cells at diagonal joins.
   */
  readonly lineThickness?: number;
  /**
   * Optional `[x, y]` translation applied to every output coordinate.
   * Useful for padding the trace inside a larger SVG viewBox without
   * re-traversing the path data.
   */
  readonly translate?: readonly [x: number, y: number];
  /**
   * How corners on the offset polygon are joined.
   * - `'sharp'` (default): straight L commands at each miter vertex.
   * - `'rounded'`: at each non-flat-cap miter, pull the two adjacent
   *   edges in by `cornerRadius` and connect with a quadratic bézier
   *   whose control point is the sharp miter location.
   */
  readonly corners?: 'sharp' | 'rounded';
  /**
   * Corner radius for the `'rounded'` treatment, in module units.
   * Clamped to half the length of each adjacent edge so it never
   * overshoots. Default `0.25`.
   */
  readonly cornerRadius?: number;
}

/**
 * Thin-outline renderer. For each multi-vertex path, emits two closed
 * subpaths:
 *
 * - an **outer** ring, CW, with every edge shifted outward (left-hand
 *   perpendicular) by `offset / 2`
 * - an **inner** ring, the same path shifted inward by `offset / 2`,
 *   emitted in reverse so its winding is CCW
 *
 * With SVG's default `nonzero` fill rule, CW + CCW cancel inside the
 * inner ring, leaving only the thin band between the two as filled —
 * the QR outline appears as a stroke rather than a solid shape.
 *
 * Dots (single-cell components) render as diamonds whose horizontal
 * and vertical half-diagonals equal `offset / 2`.
 *
 * Unlike `render`, this function does not compute miter joins — each
 * edge contributes its own pair of offset endpoints, so axis-aligned
 * corners get a tiny extra vertex pair rather than a mitered corner.
 * Cheap, and acceptable for the narrow treatment.
 */
export function renderNarrow(
  trace: Trace,
  options: RenderOptions = {},
): string {
  const halfOffset = (options.offset ?? 1) / 2;
  const diagonalOffset = halfOffset / Math.SQRT2;
  const [tx, ty] = options.translate ?? [0, 0];

  let d = '';
  for (const path of trace.paths) {
    d += renderNarrowPath(path, halfOffset, diagonalOffset, tx, ty);
  }
  for (const [c, r] of trace.dots) {
    d += renderDot(c + 0.5, r + 0.5, halfOffset, tx, ty);
  }
  return d;
}

function renderNarrowPath(
  path: Path,
  halfOffset: number,
  diagonalOffset: number,
  tx: number,
  ty: number,
): string {
  const n = path.length;
  if (n < 2) return '';

  const outerPoints: Vertex[] = [];
  const innerPoints: Vertex[] = [];
  for (let i = 0; i < n; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    const off = pathOffset(a, b, halfOffset, diagonalOffset);
    outerPoints.push(addOffset(a, off));
    outerPoints.push(addOffset(b, off));
    innerPoints.push(subtractOffset(a, off));
    innerPoints.push(subtractOffset(b, off));
  }

  return polyline(outerPoints, tx, ty) + polyline(innerPoints.reverse(), tx, ty);
}

function polyline(points: readonly Vertex[], tx: number, ty: number): string {
  if (points.length === 0) return '';
  let d = `M${fmt(points[0][0] + tx)},${fmt(points[0][1] + ty)}`;
  for (let i = 1; i < points.length; i++) {
    d += `L${fmt(points[i][0] + tx)},${fmt(points[i][1] + ty)}`;
  }
  return d + 'Z';
}

function renderDot(
  cx: number,
  cy: number,
  halfOffset: number,
  tx: number,
  ty: number,
): string {
  const x = cx + tx;
  const y = cy + ty;
  return (
    `M${fmt(x)},${fmt(y - halfOffset)}` +
    `L${fmt(x + halfOffset)},${fmt(y)}` +
    `L${fmt(x)},${fmt(y + halfOffset)}` +
    `L${fmt(x - halfOffset)},${fmt(y)}Z`
  );
}

function addOffset(vertex: Vertex, offset: Vertex): Vertex {
  return [vertex[0] + offset[0], vertex[1] + offset[1]];
}

function subtractOffset(vertex: Vertex, offset: Vertex): Vertex {
  return [vertex[0] - offset[0], vertex[1] - offset[1]];
}

/**
 * Outward (left-hand) perpendicular offset for a single edge, snapped
 * to the 8-compass direction the edge is travelling in. Axis-aligned
 * edges use `offset`; 45° diagonals use `diagonalOffset` (typically
 * `offset / √2`, so the resulting capsule has the same perpendicular
 * half-width regardless of edge direction).
 *
 * Left-hand perpendicular in SVG screen coords (y-down) of a direction
 * `(dx, dy)` is `(dy, -dx)` — for a clockwise path this points outward.
 * Collapses to `[Math.sign(dy) * s, -Math.sign(dx) * s]`.
 */
export function pathOffset(
  lastVertex: Vertex,
  vertex: Vertex,
  offset: number,
  diagonalOffset: number,
): Vertex {
  const dx = vertex[0] - lastVertex[0];
  const dy = vertex[1] - lastVertex[1];
  if (dx === 0 && dy === 0) throw new Error("Don't be silly");
  const scale = dx === 0 || dy === 0 ? offset : diagonalOffset;
  // `+ 0` collapses `-0` to `0` for stable test equality and cleaner SVG output.
  return [Math.sign(dy) * scale + 0, -Math.sign(dx) * scale + 0];
}

/**
 * Inflate an array of clockwise-wound paths into a single SVG
 * path-data string. Each input path contributes one `M...L...Z`
 * subpath; multiple paths concatenate naturally.
 */
export function render(
  paths: readonly Path[],
  options: RenderOptions = {},
): string {
  const offset = options.offset ?? 0;
  const lineThickness = options.lineThickness ?? 1;
  const lineOffset = lineThickness / 2;
  const [tx, ty] = options.translate ?? [0, 0];
  const rounded =
    options.corners === 'rounded' && (options.cornerRadius ?? 0.25) > 0;
  const cornerRadius = options.cornerRadius ?? 0.25;
  let d = '';
  for (const path of paths) {
    // Line-like paths (2-vertex degenerate capsules, multi-vertex
    // paths with 180° reversals) use the line thickness's
    // half-width as their per-edge offset so they inflate into a
    // visible capsule. Region paths use the signed `offset` option
    // directly, so `offset: 0` renders regions cells-exactly while
    // lines still render at the requested thickness.
    const edgeOffset = isLineLike(path) ? lineOffset : offset;
    d += renderPath(path, edgeOffset, tx, ty, rounded, cornerRadius);
  }
  return d;
}

/**
 * Detect whether a path's edges travel in self-opposing directions.
 * True for 2-vertex degenerate lines (always line-like) and for
 * multi-vertex paths that contain any 180° reversal — characteristic
 * of the X saddle's arm tips and other arm-and-centre shapes the
 * trace layer emits as capsule families.
 */
function isLineLike(path: Path): boolean {
  const n = path.length;
  if (n === 2) return true;
  for (let i = 0; i < n; i++) {
    const prev = path[(i - 1 + n) % n];
    const curr = path[i];
    const next = path[(i + 1) % n];
    const d1x = curr[0] - prev[0];
    const d1y = curr[1] - prev[1];
    const d2x = next[0] - curr[0];
    const d2y = next[1] - curr[1];
    const d1len2 = d1x * d1x + d1y * d1y;
    const d2len2 = d2x * d2x + d2y * d2y;
    if (d1len2 < 1e-12 || d2len2 < 1e-12) continue;
    const dot = d1x * d2x + d1y * d2y;
    // 180° reversal ⇒ dot = −√(|d1|² × |d2|²) ⇒ dot² = |d1|²|d2|² AND dot < 0
    if (dot < 0 && Math.abs(dot * dot - d1len2 * d2len2) < 1e-9) {
      return true;
    }
  }
  return false;
}

interface OffsetVertex {
  readonly x: number;
  readonly y: number;
  /** `true` if this vertex is a miter corner (eligible for rounding);
   * `false` for one of the two vertices that form a 180° flat cap. */
  readonly miter: boolean;
}

function renderPath(
  path: Path,
  offset: number,
  tx: number,
  ty: number,
  rounded: boolean,
  cornerRadius: number,
): string {
  const n = path.length;
  if (n < 2) return '';

  const out: OffsetVertex[] = [];
  for (let i = 0; i < n; i++) {
    const prev = path[(i - 1 + n) % n];
    const curr = path[i];
    const next = path[(i + 1) % n];
    emitVertex(prev, curr, next, offset, out);
  }
  const m = out.length;
  if (m < 2) return '';

  if (!rounded) {
    let d = `M${fmt(out[0].x + tx)},${fmt(out[0].y + ty)}`;
    for (let i = 1; i < m; i++) {
      d += `L${fmt(out[i].x + tx)},${fmt(out[i].y + ty)}`;
    }
    return d + 'Z';
  }

  // Rounded corners: at each miter vertex, pull in by `cornerRadius`
  // along each adjacent edge and connect with a quadratic bézier whose
  // control point is the original miter. Flat-cap vertices (pairs at
  // a 180° reversal) pass through with a straight L.
  let d = '';
  let started = false;
  for (let i = 0; i < m; i++) {
    const prev = out[(i - 1 + m) % m];
    const curr = out[i];
    const next = out[(i + 1) % m];
    if (curr.miter) {
      const [ax, ay] = interpolate(curr, prev, cornerRadius);
      const [bx, by] = interpolate(curr, next, cornerRadius);
      d += started
        ? `L${fmt(ax + tx)},${fmt(ay + ty)}`
        : `M${fmt(ax + tx)},${fmt(ay + ty)}`;
      d += `Q${fmt(curr.x + tx)},${fmt(curr.y + ty)},${fmt(bx + tx)},${fmt(by + ty)}`;
    } else {
      d += started
        ? `L${fmt(curr.x + tx)},${fmt(curr.y + ty)}`
        : `M${fmt(curr.x + tx)},${fmt(curr.y + ty)}`;
    }
    started = true;
  }
  return d + 'Z';
}

/**
 * Append one (ordinary/concave corner) or two (180° reversal) output
 * vertices for a single input vertex. See the file-level comment for
 * the three geometric cases handled here.
 */
function emitVertex(
  prev: Vertex,
  curr: Vertex,
  next: Vertex,
  offset: number,
  out: OffsetVertex[],
): void {
  const [u1x, u1y] = unitTangent(prev, curr);
  const [u2x, u2y] = unitTangent(curr, next);
  // Left-hand perpendicular in SVG screen coordinates: (dy, -dx)
  const p1x = u1y;
  const p1y = -u1x;
  const p2x = u2y;
  const p2y = -u2x;

  const denom = 1 + u1x * u2x + u1y * u2y;
  if (Math.abs(denom) < 1e-9) {
    out.push({
      x: curr[0] + offset * p1x,
      y: curr[1] + offset * p1y,
      miter: false,
    });
    out.push({
      x: curr[0] + offset * p2x,
      y: curr[1] + offset * p2y,
      miter: false,
    });
    return;
  }
  const sx = (p1x + p2x) / denom;
  const sy = (p1y + p2y) / denom;
  out.push({
    x: curr[0] + offset * sx,
    y: curr[1] + offset * sy,
    miter: true,
  });
}

/** Move from `from` toward `toward` by `distance`, clamped to half the gap. */
function interpolate(
  from: OffsetVertex,
  toward: OffsetVertex,
  distance: number,
): [number, number] {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [from.x, from.y];
  const r = Math.min(distance, len / 2);
  return [from.x + (dx / len) * r, from.y + (dy / len) * r];
}

function unitTangent(from: Vertex, to: Vertex): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [0, 0];
  return [dx / len, dy / len];
}

/**
 * Format a coordinate for SVG output: round to 4 decimals and strip
 * trailing zeros / negative zero. Keeps path strings short while
 * staying sub-pixel accurate at any reasonable rendered size.
 */
function fmt(n: number): string {
  const rounded = Math.round(n * 10000) / 10000;
  // `-0` → `0`
  const normalised = rounded === 0 ? 0 : rounded;
  return String(normalised);
}
