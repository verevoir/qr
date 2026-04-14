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
| 8  | Unified `trace()` — fallback with saddle-diagonal handling    | ✅     |
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

### Stage 8 — implemented

Built as `unifiedTrace(cells, diagonals)` in `src/svg/trace.ts`. Runs
only when none of the Stage 3–7 detectors match. Pipeline:

1. **Components** — `findComponents` flood-fills with
   `clockwiseNeighbours` respecting the `diagonals` flag, so
   diagonally-touching cells merge when enabled.
2. **Boundary edges** — `buildBoundaryEdges` emits one directed edge
   per 4-connected-exposed cell face with the filled cell on the
   right of travel, giving outer CW + inner CCW winding automatically.
3. **Saddle diagonals** — `applySaddleDiagonals` replaces the four
   axis-aligned edges converging on each diagonal-touch corner with
   two 45° diagonals that go all the way to the corner (no notch).
   Dedup via a Set-keyed edge map, so saddles that share a cell face
   (e.g. centre of an X pattern) remove it exactly once.
4. **Chain** — `chainIntoLoops` walks directed edges tail-to-head into
   closed loops. Every boundary vertex has degree 2 after saddle
   replacement, so chaining is unambiguous.
5. **Simplify** — `simplifyLoop` drops collinear intermediate
   vertices via a cross-product-zero check.

Isolated single cells trace as a 4-vertex closed square (naturally
produced by `buildBoundaryEdges` on a 1-cell component). Stage 9 may
choose to render them as a distinct dot primitive instead — the path
representation doesn't preclude that, it just uses the uniform path
shape at the trace layer.

Old `regions.ts` pipeline is not yet deleted — lives until Stage 11.

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
- **Landed**: Stages 0–7 (46 tests) committed as `52c5eb4`; Stage 8
  added on top (51 tests total).
  - `src/svg/trace.ts`: Stage 8 `unifiedTrace` with connected
    components, directed boundary edges (cell-on-right convention),
    no-notch saddle diagonals, edge chaining, and collinear-vertex
    simplification. Removed `UnsupportedShapeError` (no longer thrown
    — every valid cell set now produces paths).
  - `tests/trace.test.ts`: converted former negative "throws" tests
    into positive "Stage 8 yields N paths" assertions, added a
    Stage 8 describe block covering multi-component input, plus-shape,
    T-shape, multi-hole, non-rectangular hole, and bent-with-saddle
    cases.
- User preference confirmed: keep token usage well below 100% so the
  parallel paid-work session can continue. Pace conservatively and
  offer natural break points.
- **Next session pickup**: Stage 9 — the renderer. Per-edge offset
  outward (along left-hand perpendicular of travel direction), corner
  treatments (sharp / rounded). Expected signature:
  `render(paths, { offset, corners, ... }): string` returning an SVG
  `<path d="...">` fragment. Special-case for 2-vertex degenerate
  paths (lines as capsules) and self-intersecting paths (X from
  Stage 6 — per-edge offset handles these naturally because each
  edge's offset is local). Dot rendering decision to be made here
  too.
