# Filled-outline pipeline rebuild

Progressive rebuild of the data-module outline rendering on the
`filled-outline` branch. Replaces the current one-shot implementation in
`src/svg/regions.ts` + `src/svg/treatments.ts` with two clean layers:

1. **Trace** (`src/svg/trace.ts`) — cell set → ordered clockwise paths.
2. **Render** (`src/svg/render.ts`) — paths → SVG path data with offset,
   corner treatment, and optional curved edges.

## Why this rebuild

The existing implementation tries to solve the full problem in one pass,
conflating 4-/8-connectivity, saddle bevelling, line thickness, and
rendering. It produces geometry that scans unreliably and is hard to reason
about. The rebuild decomposes the problem into primitives that can be
tested against trivial fixtures before touching QR codes at all.

## Conventions

- Coordinates are `(x, y)` where `x = col`, `y = row` and `y` grows
  downward (SVG screen convention).
- Neighbour order is **clockwise from NE** — reading order (L→R, T→B)
  means we look right first:
  - 8-connected: `NE, E, SE, S, SW, W, NW, N`
  - 4-connected: `E, S, W, N`
- Every traced path is **closed and clockwise**. The right-hand
  perpendicular of each edge points outward, so the renderer inflates the
  path into a filled outline by offsetting each edge outward by half the
  intended line thickness.
- A **degenerate line** (1-cell-wide run) is a 2-vertex closed path with
  edges `A→B` and `B→A`. Offsetting diverges them into the two long sides
  of a capsule, so line thickness drops out of the same mechanism.

## Stages

| #  | Stage                                                         | Status |
| -- | ------------------------------------------------------------- | ------ |
| 0  | Plan & checkpoint (this document)                             | ✅     |
| 1  | Types + ASCII-grid test fixture helper                        | ✅     |
| 2  | Clockwise neighbour lookup                                    | ✅     |
| 3  | Trace a straight line (H / V / D)                             | ✅     |
| 4  | Trace a triangle                                              | ✅     |
| 5  | Trace a square                                                | ✅     |
| 6  | Saddles — X pattern as single 8-vertex self-intersecting loop | ✅     |
| 7  | Hollows — rectangular O-ring with outer CW + inner CCW loops  | ✅     |
| 8  | Unified `trace()` — single algorithm, multi-component         | ⏳     |
| 9  | Renderer (offset + corner treatment + curves)                 | ⏳     |
| 10 | Wire new pipeline into `toSvgOutline`, scan tests green       | ⏳     |
| 11 | Delete `regions.ts`, `treatments.ts`, `bad2.svg`              | ⏳     |

## Data model

```ts
type Cell = readonly [row: number, col: number];
type CellKey = `${number},${number}`;
type CellSet = ReadonlySet<CellKey>;

type Vertex = readonly [x: number, y: number];
type Path = readonly Vertex[]; // closed, clockwise, >= 2 vertices

function trace(cells: CellSet, options?: { diagonals?: boolean }): readonly Path[];
```

## Confirmed decisions

- Line-of-N (N ≥ 2): 2-vertex closed loop. Edges A→B and B→A. Endpoints at
  outer face-midpoints for H/V and outer corners for D.
- X saddle (5 cells, diagonals enabled): one closed 8-vertex loop — 4 tip
  vertices + 4 centre-pinch vertices.
- Shape of `g` (enclosed counter + tail) is an open question, left for
  later — likely falls out of Stage 7 + Stage 8.

## Open questions

### Resolved — Stage 6 X fixture (Option C)

Implemented as a single self-intersecting 8-vertex closed loop:
`tip → centre → tip → centre × 4`, tips visited CW (NW, NE, SE, SW), all
four centre visits exactly coincident at `(minC + 1.5, minR + 1.5)`.
All 8 edges are 45°. Each arm's incoming and outgoing edges travel in
opposite directions, so the Stage 9 per-edge offset produces a capsule
per arm. Global signed area is zero; that's expected for a
self-intersecting loop and the renderer does not assume polygon
winding — only local per-edge winding.

This matches the user's wording "4 points at the **same** centre"
literally: one coincident point visited four times. Option A (two
separate lozenges) and Option B (16-vertex outline without
cell-collapse) were considered and rejected.

### Resolved — Stage 7 hollow winding

Outer CW + inner CCW. Rationale: the filled material stays on the
right-hand side of every edge in both loops, so the Stage 9 renderer
(which offsets each edge outward along its *left-hand* perpendicular)
expands the outer boundary outward AND contracts the hole inward. The
evenodd alternative requires the renderer to know about loop nesting;
opposite-winding is self-contained per edge.

### Stage 8 — design sketch (not yet implemented)

The per-shape detectors in Stages 3–7 stay as the primary entry points
— they produce specific aesthetic outputs (e.g. the Stage 6 X collapses
corner cells into tips, Stage 4 L-triangles replace the inner corner
with a hypotenuse). Stage 8 is the **fallback** for anything the
detectors don't match: arbitrary connected cell sets producing their
true boundary outline.

Algorithm (march-around-the-boundary with saddle handling):

1. **Connected components** — flood-fill with `clockwiseNeighbours`
   using the diagonals flag. Each component becomes one group of
   paths (one outer + zero or more inner).
2. **Per-component outline start** — topmost-leftmost cell's NW corner.
3. **Walk CW**, emitting a vertex at each corner of the outline. Track
   visited directed edges to avoid re-traversal.
4. **Saddles** — at a diagonal-only touch point (the current tracer in
   `regions.ts` handles these with a `DIAGONAL_NOTCH` — in the rebuild
   they go all the way to the vertex, no notch). Emit a diagonal edge
   `(v−1,v)→(v,v−1)` or similar depending on the saddle direction.
5. **Holes** — after tracing the outer boundary, flood-fill remaining
   *unvisited* empty cells inside the bounding box. Each contiguous
   block of empty interior cells is traced CCW as an inner loop.
6. **Isolated single cells** — Stage 9 renders these as a distinct dot
   primitive; Stage 8 emits them in a separate list or as 4-vertex
   closed paths per the Stage 9 decision (not yet made — see below).

The old `regions.ts` has working boundary-chaining logic (directed
edges on the dual grid) that can be adapted, but several things change:

- Neighbour order must be clockwise-from-NE (the old code used
  reading-order — a change the user called out in the critique).
- Saddle bevels become full diagonals (no `DIAGONAL_NOTCH` fraction);
  the offset rendering handles line thickness uniformly.
- Winding convention is outer CW + inner CCW (old code used outer
  CW + inner CCW *already* via directed edges, so this should carry
  over cleanly).

### Parked for later

- Dot rendering (isolated 1-cell components): keep separate
  square/circle/diamond or express as a 4-vertex closed path. Decide in
  Stage 9.
- Corner treatment options beyond sharp/rounded: bevel, curved edges.
  Scope to match existing SHARP/ROUNDED initially.

## Session log

### Session 1 — 2026-04-14

- Critique accepted: old pipeline conflates concerns; rebuild from
  primitives with clockwise-NE convention.
- Layer naming settled: **trace** + **render**; drop "treatments".
- Line-of-N confirmed as 2-vertex closed loop.
- X saddle: user said 8 points in one closed loop; working through the
  geometry surfaced three interpretations — see Open Questions. Stopped
  before guessing.
- **Landed**: Stages 0–7 with 46 tests green.
  - `src/svg/trace.ts`: types, `cellKey`, `CLOCKWISE_4`/`CLOCKWISE_8`,
    `clockwiseNeighbours()`, `trace()` handling empty / straight lines /
    3-cell L triangles / solid rectangles / 3×3 X saddle / rectangular
    O-rings, plus `UnsupportedShapeError`.
  - `tests/trace.test.ts`: exhaustive per-stage coverage including CW
    winding check (Stage 4), X-arm capsule invariant (Stage 6), and
    outer-CW/inner-CCW winding assertion (Stage 7).
- User preference confirmed: keep token usage well below 100% so the
  parallel paid-work session can continue. Pace conservatively and
  offer natural break points.
- **Next session pickup**: Stage 8 — the unified tracer. See the
  design sketch section above. This is the keystone that unlocks
  Stages 9–11 (renderer, QR wiring, cleanup). The old `regions.ts`
  has reusable directed-edge-chaining logic; the critical changes are
  clockwise-from-NE neighbour order, no-notch saddle diagonals, and
  Stage 8 being a *fallback* (detectors in Stages 3–7 still run first
  to produce their specific aesthetic outputs).
