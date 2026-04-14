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
  /**
   * How much of each saddle corner to chamfer with a diagonal, in
   * module units. Only meaningful when `diagonals` is true.
   *
   * - `0` (default) — the diagonal runs corner-to-corner, fully bridging
   *   the two diagonally-adjacent cells. Matches the "no-notch" style
   *   described for custom shapes (`\`, `/`, X saddle).
   * - `> 0` — the corner of each filled cell that meets the saddle is
   *   trimmed by this much, and a short 45° diagonal spans the trim.
   *   The two cells are NOT geometrically bridged — they remain
   *   topologically one component (for boundary-tracing purposes) but
   *   most of the empty-cell space at the saddle stays empty.
   *
   * For QR rendering, pass `~0.125`: the cells remain visually linked
   * by a faint diagonal at each saddle, but scanners still see the
   * empty cells between them as empty.
   */
  readonly saddleNotch?: number;
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
 * - **Stage 8 fallback** — anything else is routed through
 *   `unifiedTrace()`, which partitions `cells` into connected
 *   components (4-connected, or 8-connected when `diagonals` is on),
 *   walks each component's directed-edge boundary, applies
 *   no-notch saddle diagonals at corner-only touches when needed,
 *   and chains the edges into closed loops. Outer loops wind
 *   clockwise; any inner loops around holes wind counter-clockwise.
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

  return unifiedTrace(cells, diagonals, options.saddleNotch ?? 0);
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

// ---------------------------------------------------------------------------
// Stage 8 — unified fallback tracer
// ---------------------------------------------------------------------------

/**
 * Fallback tracer. Handles any cell set the Stage 3–7 detectors don't
 * claim, producing proper boundary outlines via directed-edge tracing.
 *
 * Pipeline per call:
 *
 * 1. **Components** — partition `cells` into connected components.
 *    Uses 8-connectivity when `diagonals` is on so diagonally-touching
 *    cells merge into a single component; 4-connectivity otherwise.
 * 2. **Boundary edges** — for each cell in a component, emit one
 *    directed edge per face exposed to a 4-connected-empty neighbour.
 *    Edges are directed so the filled cell is on the right of travel:
 *    top face east, right face south, bottom face west, left face
 *    north. Outer loops therefore wind clockwise in SVG screen
 *    coordinates (y-down) and hole loops wind counter-clockwise — the
 *    same winding convention Stage 7 produces by hand.
 * 3. **Saddle diagonals** — when `diagonals` is on and two
 *    diagonally-opposite cells of the component share a corner while
 *    the other two cells at that corner are empty, the four
 *    axis-aligned faces converging on the shared corner are removed
 *    and replaced with two 45° diagonal edges that bypass the pinch.
 *    No notch — the diagonals touch the corner-cell corners directly,
 *    because line thickness is applied downstream by per-edge offset.
 * 4. **Chain** — walk edges tail-to-head into closed loops using a
 *    start-vertex index; the directed-edge-with-cell-on-right
 *    convention guarantees a balanced degree-2 graph so chaining is
 *    deterministic.
 * 5. **Simplify** — drop collinear intermediate vertices so straight
 *    runs collapse to a single segment.
 */
/**
 * Trace a cell set using only the Stage 8 fallback, skipping the
 * Stage 3–7 creative detectors. Emits faithful cell-border outlines
 * for every connected component — no line-as-2-vertex collapse, no
 * triangle-for-L, no X-saddle pinwheel — which is what callers who
 * want "cells exactly" (e.g. the QR outline renderer) need.
 *
 * Public variant of the internal `unifiedTrace` helper.
 */
export function traceUniform(
  cells: CellSet,
  options: TraceOptions = {},
): readonly Path[] {
  return unifiedTrace(
    cells,
    options.diagonals ?? false,
    options.saddleNotch ?? 0,
  );
}

function unifiedTrace(
  cells: CellSet,
  diagonals: boolean,
  notch: number,
): readonly Path[] {
  const paths: Path[] = [];
  for (const component of findComponents(cells, diagonals)) {
    let edges: DualEdge[];
    if (diagonals && notch > 0) {
      // Saddle-aware: truncate each cell face at the notch on any
      // saddle endpoint, then add the chamfer diagonals separately.
      // Correctly handles adjacent saddles that share a cell face
      // (the middle portion of the face is preserved).
      edges = buildChamferedBoundary(component, notch);
    } else {
      edges = buildBoundaryEdges(component);
      if (diagonals) edges = applySaddleDiagonals(edges, component, notch);
    }
    for (const loop of chainIntoLoops(edges)) {
      paths.push(simplifyLoop(loop));
    }
  }
  return paths;
}

/** Partition `cells` into connected components under the chosen rule. */
function findComponents(cells: CellSet, diagonals: boolean): CellSet[] {
  const visited = new Set<CellKey>();
  const components: CellSet[] = [];
  for (const start of cells) {
    if (visited.has(start)) continue;
    const component = new Set<CellKey>();
    const stack: CellKey[] = [start];
    while (stack.length > 0) {
      const key = stack.pop() as CellKey;
      if (visited.has(key)) continue;
      visited.add(key);
      component.add(key);
      const [r, c] = parseCellKey(key);
      for (const [nr, nc] of clockwiseNeighbours(
        [r, c],
        cells,
        { diagonals },
      )) {
        const nk = cellKey(nr, nc);
        if (!visited.has(nk)) stack.push(nk);
      }
    }
    components.push(component);
  }
  return components;
}

// A directed boundary segment on the dual grid.
type DualEdge = { x1: number; y1: number; x2: number; y2: number };

/**
 * Emit one directed edge per 4-connected-exposed cell face. Direction
 * is chosen so the filled cell sits on the right of travel, which —
 * in SVG screen coordinates where y grows downward — gives outer
 * boundaries clockwise winding and hole boundaries counter-clockwise.
 */
function buildBoundaryEdges(component: CellSet): DualEdge[] {
  const edges: DualEdge[] = [];
  for (const key of component) {
    const [r, c] = parseCellKey(key);
    if (!component.has(cellKey(r - 1, c))) {
      edges.push({ x1: c, y1: r, x2: c + 1, y2: r });
    }
    if (!component.has(cellKey(r, c + 1))) {
      edges.push({ x1: c + 1, y1: r, x2: c + 1, y2: r + 1 });
    }
    if (!component.has(cellKey(r + 1, c))) {
      edges.push({ x1: c + 1, y1: r + 1, x2: c, y2: r + 1 });
    }
    if (!component.has(cellKey(r, c - 1))) {
      edges.push({ x1: c, y1: r + 1, x2: c, y2: r });
    }
  }
  return edges;
}

/**
 * Replace the zigzag that forms at each "saddle" vertex with a pair of
 * 45° diagonals that bypass the pinch.
 *
 * A saddle is a grid corner `V = (vx, vy)` where the four cells
 * surrounding it split into two diagonally-opposite pairs: one pair in
 * the component, the other pair outside it. Two cases:
 *
 * - **`\` saddle** (NW and SE cells present, NE and SW absent): the
 *   four axis-aligned edges that converge on V are removed and
 *   replaced with diagonals
 *     `(vx, vy−1) → (vx+1, vy)` (upper side, SE travel) and
 *     `(vx, vy+1) → (vx−1, vy)` (lower side, NW travel).
 * - **`/` saddle** (NE and SW cells present, NW and SE absent): the
 *   four axis-aligned edges are replaced with
 *     `(vx−1, vy) → (vx, vy−1)` (upper side, NE travel) and
 *     `(vx+1, vy) → (vx, vy+1)` (lower side, SW travel).
 *
 * Removal is done via a `Set` keyed by the edge's directed endpoints,
 * so when two saddles both claim the same face (which happens when a
 * cell is sandwiched between two saddles, e.g. the centre cell of an
 * X pattern) the face is removed only once and the book-keeping stays
 * consistent.
 */
function applySaddleDiagonals(
  edges: DualEdge[],
  component: CellSet,
  notch: number,
): DualEdge[] {
  const toRemove = new Set<string>();
  const toAdd: DualEdge[] = [];
  const checkedVertices = new Set<string>();
  const a = notch;

  for (const key of component) {
    const [r, c] = parseCellKey(key);
    for (let dr = 0; dr <= 1; dr++) {
      for (let dc = 0; dc <= 1; dc++) {
        const vx = c + dc;
        const vy = r + dr;
        const vk = `${vx},${vy}`;
        if (checkedVertices.has(vk)) continue;
        checkedVertices.add(vk);

        const nw = component.has(cellKey(vy - 1, vx - 1));
        const ne = component.has(cellKey(vy - 1, vx));
        const sw = component.has(cellKey(vy, vx - 1));
        const se = component.has(cellKey(vy, vx));

        if (nw && se && !ne && !sw) {
          toRemove.add(edgeKey(vx, vy - 1, vx, vy)); //     NW.R
          toRemove.add(edgeKey(vx, vy, vx - 1, vy)); //     NW.B
          toRemove.add(edgeKey(vx, vy + 1, vx, vy)); //     SE.L
          toRemove.add(edgeKey(vx, vy, vx + 1, vy)); //     SE.T
          if (a === 0) {
            // Full diagonals: corner-to-corner, bridging both cells
            toAdd.push({ x1: vx, y1: vy - 1, x2: vx + 1, y2: vy });
            toAdd.push({ x1: vx, y1: vy + 1, x2: vx - 1, y2: vy });
          } else {
            // Chamfered: trim a tiny triangle off each cell's saddle
            // corner. Cells remain geometrically disconnected; most
            // of the empty saddle region stays empty.
            //
            // NW cell's SE corner trimmed by `a × a / 2`:
            toAdd.push({ x1: vx, y1: vy - 1, x2: vx, y2: vy - a });
            toAdd.push({ x1: vx, y1: vy - a, x2: vx - a, y2: vy });
            toAdd.push({ x1: vx - a, y1: vy, x2: vx - 1, y2: vy });
            // SE cell's NW corner trimmed:
            toAdd.push({ x1: vx, y1: vy + 1, x2: vx, y2: vy + a });
            toAdd.push({ x1: vx, y1: vy + a, x2: vx + a, y2: vy });
            toAdd.push({ x1: vx + a, y1: vy, x2: vx + 1, y2: vy });
          }
        } else if (ne && sw && !nw && !se) {
          toRemove.add(edgeKey(vx + 1, vy, vx, vy)); //     NE.B
          toRemove.add(edgeKey(vx, vy, vx, vy - 1)); //     NE.L
          toRemove.add(edgeKey(vx - 1, vy, vx, vy)); //     SW.T
          toRemove.add(edgeKey(vx, vy, vx, vy + 1)); //     SW.R
          if (a === 0) {
            toAdd.push({ x1: vx - 1, y1: vy, x2: vx, y2: vy - 1 });
            toAdd.push({ x1: vx + 1, y1: vy, x2: vx, y2: vy + 1 });
          } else {
            // NE cell's SW corner trimmed:
            toAdd.push({ x1: vx + 1, y1: vy, x2: vx + a, y2: vy });
            toAdd.push({ x1: vx + a, y1: vy, x2: vx, y2: vy - a });
            toAdd.push({ x1: vx, y1: vy - a, x2: vx, y2: vy - 1 });
            // SW cell's NE corner trimmed:
            toAdd.push({ x1: vx - 1, y1: vy, x2: vx - a, y2: vy });
            toAdd.push({ x1: vx - a, y1: vy, x2: vx, y2: vy + a });
            toAdd.push({ x1: vx, y1: vy + a, x2: vx, y2: vy + 1 });
          }
        }
      }
    }
  }

  if (toRemove.size === 0) return edges;
  const kept = edges.filter(
    (e) => !toRemove.has(edgeKey(e.x1, e.y1, e.x2, e.y2)),
  );
  return [...kept, ...toAdd];
}

function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  return `${x1},${y1}->${x2},${y2}`;
}

/**
 * Identify every grid corner that's a saddle for this component.
 * Returned as a map of `"x,y"` → saddle kind.
 */
function findSaddles(component: CellSet): Map<string, 'backslash' | 'slash'> {
  const saddles = new Map<string, 'backslash' | 'slash'>();
  const checked = new Set<string>();
  for (const key of component) {
    const [r, c] = parseCellKey(key);
    for (let dr = 0; dr <= 1; dr++) {
      for (let dc = 0; dc <= 1; dc++) {
        const vx = c + dc;
        const vy = r + dr;
        const vk = `${vx},${vy}`;
        if (checked.has(vk)) continue;
        checked.add(vk);
        const nw = component.has(cellKey(vy - 1, vx - 1));
        const ne = component.has(cellKey(vy - 1, vx));
        const sw = component.has(cellKey(vy, vx - 1));
        const se = component.has(cellKey(vy, vx));
        if (nw && se && !ne && !sw) saddles.set(vk, 'backslash');
        else if (ne && sw && !nw && !se) saddles.set(vk, 'slash');
      }
    }
  }
  return saddles;
}

/**
 * Build boundary edges with per-face saddle truncation, then append
 * one short chamfer diagonal per saddle corner of each filled cell.
 *
 * Each cell face is emitted as a shortened segment skipping the
 * `notch` at either end that lies on a saddle vertex; any face with
 * two saddle endpoints keeps only its middle portion. The chamfer
 * diagonals travel in the correct clockwise direction for the
 * surrounding outline:
 *
 * - `\` saddle: NW cell's SE corner chamfer runs SW; SE cell's NW
 *   corner chamfer runs NE.
 * - `/` saddle: NE cell's SW corner chamfer runs NW; SW cell's NE
 *   corner chamfer runs SE.
 */
function buildChamferedBoundary(
  component: CellSet,
  notch: number,
): DualEdge[] {
  const saddles = findSaddles(component);
  const edges: DualEdge[] = [];
  for (const key of component) {
    const [r, c] = parseCellKey(key);
    if (!component.has(cellKey(r - 1, c))) {
      emitTruncated(c, r, c + 1, r, saddles, notch, edges);
    }
    if (!component.has(cellKey(r, c + 1))) {
      emitTruncated(c + 1, r, c + 1, r + 1, saddles, notch, edges);
    }
    if (!component.has(cellKey(r + 1, c))) {
      emitTruncated(c + 1, r + 1, c, r + 1, saddles, notch, edges);
    }
    if (!component.has(cellKey(r, c - 1))) {
      emitTruncated(c, r + 1, c, r, saddles, notch, edges);
    }
  }
  for (const [vk, kind] of saddles) {
    const [vx, vy] = vk.split(',').map(Number);
    if (kind === 'backslash') {
      edges.push({ x1: vx, y1: vy - notch, x2: vx - notch, y2: vy });
      edges.push({ x1: vx, y1: vy + notch, x2: vx + notch, y2: vy });
    } else {
      edges.push({ x1: vx + notch, y1: vy, x2: vx, y2: vy - notch });
      edges.push({ x1: vx - notch, y1: vy, x2: vx, y2: vy + notch });
    }
  }
  return edges;
}

/**
 * Emit a single cell face, truncated by `notch` at whichever endpoint(s)
 * lie on a saddle. If both endpoints are saddles the middle portion is
 * emitted; if the resulting segment has zero length it's omitted.
 */
function emitTruncated(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  saddles: Map<string, 'backslash' | 'slash'>,
  notch: number,
  edges: DualEdge[],
): void {
  const startSaddle = saddles.has(`${x1},${y1}`);
  const endSaddle = saddles.has(`${x2},${y2}`);
  if (!startSaddle && !endSaddle) {
    edges.push({ x1, y1, x2, y2 });
    return;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;
  const sx = startSaddle ? x1 + ux * notch : x1;
  const sy = startSaddle ? y1 + uy * notch : y1;
  const ex = endSaddle ? x2 - ux * notch : x2;
  const ey = endSaddle ? y2 - uy * notch : y2;
  const dxs = ex - sx;
  const dys = ey - sy;
  if (dxs * dxs + dys * dys > 1e-12) {
    edges.push({ x1: sx, y1: sy, x2: ex, y2: ey });
  }
}

/**
 * Walk directed edges tail-to-head into closed loops. Every boundary
 * vertex is visited by exactly one incoming and one outgoing edge
 * (both after saddle replacement and in plain 4-connected regions),
 * so chaining from any unused edge consumes a single closed loop with
 * no ambiguity.
 */
function chainIntoLoops(edges: readonly DualEdge[]): Vertex[][] {
  const byStart = new Map<string, DualEdge[]>();
  for (const e of edges) {
    const k = `${e.x1},${e.y1}`;
    let list = byStart.get(k);
    if (!list) {
      list = [];
      byStart.set(k, list);
    }
    list.push(e);
  }
  const used = new Set<DualEdge>();
  const loops: Vertex[][] = [];
  for (const start of edges) {
    if (used.has(start)) continue;
    const pts: Vertex[] = [[start.x1, start.y1]];
    let cur: DualEdge | undefined = start;
    while (cur && !used.has(cur)) {
      used.add(cur);
      pts.push([cur.x2, cur.y2]);
      cur = byStart
        .get(`${cur.x2},${cur.y2}`)
        ?.find((e) => !used.has(e));
    }
    // Chain returns to start — drop the duplicate closing vertex.
    if (pts.length >= 2) {
      const last = pts[pts.length - 1];
      if (last[0] === pts[0][0] && last[1] === pts[0][1]) pts.pop();
    }
    if (pts.length >= 3) loops.push(pts);
  }
  return loops;
}

/**
 * Drop collinear intermediate vertices — a straight run of two or
 * more colinear edges collapses into a single segment. Leaves loops
 * with fewer than 3 remaining vertices untouched.
 */
function simplifyLoop(pts: readonly Vertex[]): Path {
  const n = pts.length;
  if (n <= 3) return pts.slice();
  const result: Vertex[] = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i - 1 + n) % n];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[(i + 1) % n];
    // Cross product zero ⇒ colinear ⇒ drop this vertex
    if ((cx - px) * (ny - cy) !== (cy - py) * (nx - cx)) {
      result.push(pts[i]);
    }
  }
  return result.length >= 3 ? result : pts.slice();
}
