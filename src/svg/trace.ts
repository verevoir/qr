/**
 * Two-layer outline pipeline — stage 1: tracing.
 *
 * Converts a set of dark grid cells into ordered, clockwise paths that the
 * renderer (`render.ts`) will inflate into a filled outline. The tracer has
 * no QR-specific knowledge — it operates on arbitrary cell sets so it can
 * be built up and verified against trivial shapes (lines, triangles,
 * squares, saddles, hollows) before being wired into the QR pipeline.
 *
 * See `.meta/filled-outline.md` for the full rebuild plan.
 *
 * ## Conventions
 *
 * - Coordinates are `(x, y)` in grid space: `x = col`, `y = row`, and `y`
 *   grows downward (SVG screen convention).
 * - Neighbours are evaluated clockwise from NE — reading order (L→R, T→B)
 *   means we naturally "look right first". With diagonals:
 *   `NE, E, SE, S, SW, W, NW, N`; without: `E, S, W, N`.
 * - Every traced path is **closed and clockwise**. The right-hand
 *   perpendicular of each edge points outward, so the renderer can inflate
 *   the path into a filled outline by offsetting each edge outward by half
 *   the intended line thickness.
 * - A **degenerate line** (1-cell-wide run) is a 2-vertex closed path with
 *   edges `A→B` and `B→A`. Offsetting diverges the edges into the two
 *   long sides of a capsule, so line thickness drops out of the same
 *   mechanism used for general regions.
 */

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** A dark grid cell as `[row, col]`. Origin top-left; `row` grows downward. */
export type Cell = readonly [row: number, col: number];

/** String key for a cell. Build with `cellKey(r, c)`. */
export type CellKey = `${number},${number}`;

export function cellKey(row: number, col: number): CellKey {
  return `${row},${col}`;
}

/**
 * The canonical input representation — a set of dark cells keyed
 * `"row,col"`. `Set` semantics keep membership checks cheap during
 * traversal without allocating intermediate arrays.
 */
export type CellSet = ReadonlySet<CellKey>;

// ---------------------------------------------------------------------------
// Traced paths
// ---------------------------------------------------------------------------

/**
 * A vertex in grid coordinate space. Not necessarily integer — a
 * degenerate line path puts its endpoints at the outer face-midpoints
 * (H / V) or outer corners (D) of the terminal cells, not at integer
 * module corners.
 */
export type Vertex = readonly [x: number, y: number];

/**
 * A closed clockwise path — an ordered list of vertices where the final
 * vertex implicitly connects back to the first. `path.length >= 2`. A
 * 2-vertex path is a degenerate line: both edges lie between the same
 * pair of points but travel in opposite directions.
 */
export type Path = readonly Vertex[];

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface TraceOptions {
  /**
   * When `true`, cells that share only a corner count as connected and
   * the tracer may emit 45° edges between them. When `false` (default),
   * only cells sharing a full edge (N / E / S / W) are connected.
   */
  readonly diagonals?: boolean;
}

// ---------------------------------------------------------------------------
// Clockwise neighbours
// ---------------------------------------------------------------------------

/**
 * 8-connected neighbour offsets as `[dRow, dCol]`, ordered clockwise from
 * NE — the first direction you look when scanning in reading order.
 */
export const CLOCKWISE_8: readonly Cell[] = [
  [-1, 1], // NE
  [0, 1], //  E
  [1, 1], //  SE
  [1, 0], //  S
  [1, -1], // SW
  [0, -1], // W
  [-1, -1], // NW
  [-1, 0], // N
];

/** 4-connected neighbour offsets, clockwise from E. */
export const CLOCKWISE_4: readonly Cell[] = [
  [0, 1], //  E
  [1, 0], //  S
  [0, -1], // W
  [-1, 0], // N
];

/**
 * Return the neighbours of `cell` that are present in `cells`, in
 * clockwise order starting from NE (8-connected) or E (4-connected).
 */
export function clockwiseNeighbours(
  cell: Cell,
  cells: CellSet,
  options: TraceOptions = {},
): readonly Cell[] {
  const [row, col] = cell;
  const offsets = options.diagonals ? CLOCKWISE_8 : CLOCKWISE_4;
  const present: Cell[] = [];
  for (const [dr, dc] of offsets) {
    const nr = row + dr;
    const nc = col + dc;
    if (cells.has(cellKey(nr, nc))) present.push([nr, nc]);
  }
  return present;
}

// ---------------------------------------------------------------------------
// Trace entry point
// ---------------------------------------------------------------------------

/**
 * Trace a set of cells into clockwise closed paths.
 *
 * Built up stage by stage. Currently handles:
 *
 * - Empty input → `[]`.
 * - **Stage 3** — a single straight line (H / V, or D with `diagonals`):
 *   one 2-vertex closed path. Endpoints at the outer face midpoints for
 *   H/V and at the outer corners for D.
 * - **Stage 4** — a 3-cell L arrangement in a 2×2 bounding box with
 *   `diagonals` enabled: one 3-vertex closed path whose hypotenuse is
 *   a 45° edge replacing the inner corner of the L.
 * - **Stage 5** — a solid rectangular region (≥ 2 × 2, no gaps): one
 *   4-vertex closed path at the corners of the bounding box.
 * - **Stage 6** — the classic X saddle (5 cells in a 3×3 bounding box
 *   at the four corners plus the centre, `diagonals` enabled): one
 *   self-intersecting 8-vertex closed path that visits each arm tip
 *   once and the shape's geometric centre four times. See
 *   `detectXSaddle` for the rationale.
 * - **Stage 7** — a rectangular ring (filled bounding box with a
 *   single solid rectangular hole in the strict interior): outer
 *   clockwise path + inner counter-clockwise path. The opposite
 *   windings keep the filled material on the right-hand side of
 *   every edge, so Stage 9's per-edge offset inflates the outer
 *   boundary outward AND shrinks the hole inward (filled area
 *   thickens in both directions).
 *
 * Anything else throws `UnsupportedShapeError` until Stage 8's
 * general tracer subsumes all of the above.
 */
export function trace(
  cells: CellSet,
  options: TraceOptions = {},
): readonly Path[] {
  if (cells.size === 0) return [];
  const diagonals = options.diagonals ?? false;

  const line = detectStraightLine(cells, diagonals);
  if (line) return [line];

  const triangle = detectTriangle(cells, diagonals);
  if (triangle) return [triangle];

  const rectangle = detectSolidRectangle(cells);
  if (rectangle) return [rectangle];

  const xSaddle = detectXSaddle(cells, diagonals);
  if (xSaddle) return [xSaddle];

  const ring = detectRectangularRing(cells);
  if (ring) return ring;

  throw new UnsupportedShapeError(
    'trace: shape not yet supported (stage 8 unifies this)',
  );
}

export class UnsupportedShapeError extends Error {
  override name = 'UnsupportedShapeError';
}

// ---------------------------------------------------------------------------
// Stage 3 — straight-line detection
// ---------------------------------------------------------------------------

function parseCellKey(key: CellKey): Cell {
  const comma = key.indexOf(',');
  return [Number(key.slice(0, comma)), Number(key.slice(comma + 1))];
}

/**
 * Return the 2-vertex closed path for a contiguous straight line, or
 * `null` if `cells` is not a straight line.
 *
 * A "straight line" means every cell lies on a single row, column, or —
 * when `diagonals` is true — a single 45° line `r - c = k` (`\`) or
 * `r + c = k` (`/`), AND the cells form a contiguous run with no gaps.
 *
 * Endpoint convention (chosen so the first edge points roughly SE):
 *
 *   H line (row `y`, cols `a..b`):         `[a, y+0.5] → [b+1, y+0.5]`
 *   V line (col `x`, rows `a..b`):         `[x+0.5, a] → [x+0.5, b+1]`
 *   `\` diagonal (rows `a..b`, cols `a..b` offset): `[minC, minR] → [maxC+1, maxR+1]`
 *   `/` diagonal (top-right to bottom-left):         `[maxC+1, minR] → [minC, maxR+1]`
 *
 * Each returned path is a closed 2-vertex loop: edges `A→B` and `B→A`
 * offset in opposite perpendicular directions produce the two sides of
 * a capsule at render time.
 */
function detectStraightLine(cells: CellSet, diagonals: boolean): Path | null {
  if (cells.size < 2) return null;

  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const key of cells) {
    const [r, c] = parseCellKey(key);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }

  // Horizontal — all cells share a row; cols must form a contiguous run
  if (minR === maxR) {
    return cells.size === maxC - minC + 1
      ? [
          [minC, minR + 0.5],
          [maxC + 1, minR + 0.5],
        ]
      : null;
  }

  // Vertical — all cells share a col; rows must form a contiguous run
  if (minC === maxC) {
    return cells.size === maxR - minR + 1
      ? [
          [minC + 0.5, minR],
          [minC + 0.5, maxR + 1],
        ]
      : null;
  }

  // Diagonal — only with diagonals enabled, and only if the bounding box
  // is square and every cell lies on the same diagonal
  if (!diagonals) return null;

  const span = maxR - minR;
  if (span !== maxC - minC || cells.size !== span + 1) return null;

  // `\` diagonal: cells at (minR + i, minC + i) for i in 0..span
  let backslash = true;
  for (let i = 0; i <= span; i++) {
    if (!cells.has(cellKey(minR + i, minC + i))) {
      backslash = false;
      break;
    }
  }
  if (backslash) {
    return [
      [minC, minR],
      [maxC + 1, maxR + 1],
    ];
  }

  // `/` diagonal: cells at (minR + i, maxC - i) for i in 0..span
  for (let i = 0; i <= span; i++) {
    if (!cells.has(cellKey(minR + i, maxC - i))) return null;
  }
  return [
    [maxC + 1, minR],
    [minC, maxR + 1],
  ];
}

// ---------------------------------------------------------------------------
// Stage 4 — triangle detection
// ---------------------------------------------------------------------------

/**
 * Return the 3-vertex closed path for a 3-cell L arrangement in a 2×2
 * bounding box, or `null` otherwise.
 *
 * Each of the 4 orientations omits one of the box's four corner cells.
 * The traced triangle uses the three outer corners of the bounding box
 * that are NOT the missing cell's outer corner — so the "inner" corner
 * of the L is replaced by a 45° hypotenuse. Requires `diagonals`.
 *
 * Vertex order is clockwise in SVG screen coordinates (y-down), so the
 * renderer's right-hand = interior convention holds.
 */
function detectTriangle(cells: CellSet, diagonals: boolean): Path | null {
  if (!diagonals || cells.size !== 3) return null;

  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const key of cells) {
    const [r, c] = parseCellKey(key);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  if (maxR - minR !== 1 || maxC - minC !== 1) return null;

  const nw: Vertex = [minC, minR];
  const ne: Vertex = [maxC + 1, minR];
  const sw: Vertex = [minC, maxR + 1];
  const se: Vertex = [maxC + 1, maxR + 1];

  const hasNW = cells.has(cellKey(minR, minC));
  const hasNE = cells.has(cellKey(minR, maxC));
  const hasSW = cells.has(cellKey(maxR, minC));
  const hasSE = cells.has(cellKey(maxR, maxC));

  // Exactly one of the four positions must be absent for this to be a
  // 3-cell L in a 2×2 box
  if (!hasNW) return [ne, se, sw];
  if (!hasNE) return [nw, se, sw];
  if (!hasSW) return [nw, ne, se];
  if (!hasSE) return [nw, ne, sw];
  return null;
}

// ---------------------------------------------------------------------------
// Stage 5 — solid rectangle detection
// ---------------------------------------------------------------------------

/**
 * Return the 4-vertex closed path for a solid axis-aligned rectangular
 * region of cells (at least 2 wide AND 2 tall, no gaps), or `null`.
 *
 * 1×N regions are handled by `detectStraightLine` at Stage 3, so this
 * only fires for regions where both dimensions are ≥ 2. The returned
 * path walks the bounding-box corners clockwise: NW → NE → SE → SW.
 *
 * Independent of the `diagonals` option — all cells in a solid
 * rectangle are 4-connected to their neighbours.
 */
function detectSolidRectangle(cells: CellSet): Path | null {
  if (cells.size < 4) return null;

  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const key of cells) {
    const [r, c] = parseCellKey(key);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }

  const width = maxC - minC + 1;
  const height = maxR - minR + 1;
  if (width < 2 || height < 2) return null;
  if (cells.size !== width * height) return null;

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (!cells.has(cellKey(r, c))) return null;
    }
  }

  return [
    [minC, minR], // NW
    [maxC + 1, minR], // NE
    [maxC + 1, maxR + 1], // SE
    [minC, maxR + 1], // SW
  ];
}

// ---------------------------------------------------------------------------
// Stage 6 — X-saddle detection
// ---------------------------------------------------------------------------

/**
 * Return the 8-vertex closed path for the canonical X saddle — five
 * cells arranged at the four corners plus the centre of a 3×3 bounding
 * box, with `diagonals` enabled — or `null` otherwise.
 *
 * The shape is modelled as four diagonal arms meeting at the geometric
 * centre `(minC + 1.5, minR + 1.5)`. Each arm is a degenerate line
 * (Stage 3 rule): tip → centre and centre → tip on the two "sides" of
 * the arm, so that when the renderer offsets each edge outward by half
 * the intended line thickness, the two opposite-direction edges diverge
 * into a capsule — identical geometry to a 2-vertex line, just with
 * four of them sharing an endpoint.
 *
 * Concatenating all four arms into a single closed loop, walking the
 * tips in clockwise order (NW, NE, SE, SW):
 *
 *   nwTip → centre → neTip → centre → seTip → centre → swTip → centre
 *
 * yields an 8-vertex, self-intersecting path with zero signed area.
 * That's intentional: the "clockwise winding" invariant holds **locally
 * per edge** (each arm's two edges travel in opposite directions, so
 * their left-hand perpendiculars — the outward offset direction — point
 * apart), which is all the per-edge offset renderer needs. The global
 * polygon is not a simple polygon and no polygon-offset semantics apply.
 *
 * Only the canonical 3×3 X is handled here. The general multi-saddle
 * tracer in Stage 8 will subsume this (and the diagonal 2-cell case
 * already handled as a line in Stage 3).
 */
function detectXSaddle(cells: CellSet, diagonals: boolean): Path | null {
  if (!diagonals || cells.size !== 5) return null;

  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const key of cells) {
    const [r, c] = parseCellKey(key);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  if (maxR - minR !== 2 || maxC - minC !== 2) return null;

  const required: CellKey[] = [
    cellKey(minR, minC), // NW corner cell
    cellKey(minR, maxC), // NE corner cell
    cellKey(maxR, minC), // SW corner cell
    cellKey(maxR, maxC), // SE corner cell
    cellKey(minR + 1, minC + 1), // centre cell
  ];
  for (const k of required) {
    if (!cells.has(k)) return null;
  }

  const nwTip: Vertex = [minC, minR];
  const neTip: Vertex = [maxC + 1, minR];
  const seTip: Vertex = [maxC + 1, maxR + 1];
  const swTip: Vertex = [minC, maxR + 1];
  const centre: Vertex = [minC + 1.5, minR + 1.5];

  return [nwTip, centre, neTip, centre, seTip, centre, swTip, centre];
}

// ---------------------------------------------------------------------------
// Stage 7 — rectangular O-ring detection
// ---------------------------------------------------------------------------

/**
 * Return `[outerCW, innerCCW]` for a rectangular ring — a solid
 * rectangular bounding box minus a single solid rectangular hole that
 * sits strictly inside (does not touch any edge of the bounding box)
 * — or `null` otherwise.
 *
 * **Winding convention**: the outer path walks clockwise in SVG screen
 * coordinates (NW → NE → SE → SW), the inner path walks
 * counter-clockwise around the hole (NW → SW → SE → NE). The filled
 * material is therefore on the right-hand side of every edge in both
 * loops, so the Stage 9 renderer — which offsets each edge outward
 * along its *left-hand* perpendicular — expands the outer boundary
 * outward AND contracts the hole inward. Filled thickness grows in
 * both directions, which is what an offset outline of a hollow shape
 * should do.
 *
 * Only single-hole rectangular rings are handled here. Multi-hole and
 * non-rectangular holes are deferred to Stage 8's general tracer.
 */
function detectRectangularRing(cells: CellSet): Path[] | null {
  if (cells.size < 8) return null; // 3×3 with centre missing is the smallest

  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const key of cells) {
    const [r, c] = parseCellKey(key);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }

  const width = maxC - minC + 1;
  const height = maxR - minR + 1;
  if (width < 3 || height < 3) return null;

  // Collect empty cells inside the bounding box — these must form one
  // solid rectangular block to qualify as a ring hole.
  let holeMinR = Infinity;
  let holeMaxR = -Infinity;
  let holeMinC = Infinity;
  let holeMaxC = -Infinity;
  let emptyCount = 0;
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (!cells.has(cellKey(r, c))) {
        emptyCount++;
        if (r < holeMinR) holeMinR = r;
        if (r > holeMaxR) holeMaxR = r;
        if (c < holeMinC) holeMinC = c;
        if (c > holeMaxC) holeMaxC = c;
      }
    }
  }

  if (emptyCount === 0) return null; // solid — Stage 5's territory

  const holeWidth = holeMaxC - holeMinC + 1;
  const holeHeight = holeMaxR - holeMinR + 1;
  // Empty cells must exactly fill their bounding box — a solid hole
  if (emptyCount !== holeWidth * holeHeight) return null;
  // Hole must sit strictly inside the outer bounding box
  if (
    holeMinR === minR ||
    holeMaxR === maxR ||
    holeMinC === minC ||
    holeMaxC === maxC
  ) {
    return null;
  }
  // Consistency: filled cells = bb area − hole area
  if (cells.size !== width * height - holeWidth * holeHeight) return null;

  const outer: Path = [
    [minC, minR],
    [maxC + 1, minR],
    [maxC + 1, maxR + 1],
    [minC, maxR + 1],
  ];
  const inner: Path = [
    [holeMinC, holeMinR],
    [holeMinC, holeMaxR + 1],
    [holeMaxC + 1, holeMaxR + 1],
    [holeMaxC + 1, holeMinR],
  ];
  return [outer, inner];
}
