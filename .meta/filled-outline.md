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
| 9  | Renderer (per-edge offset + sharp / rounded corners)          | ✅     |
| 10 | Wire new pipeline into `toSvgOutline`, scan tests green       | ✅     |
| 11 | Delete `regions.ts`, `treatments.ts`, `bad2.svg`              | ✅     |

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
- **Landed all 12 stages in one session — rebuild complete.**
  - Stages 0–7 committed as `52c5eb4` (46 tests).
  - Stage 8 committed as `8938611` (+5 tests, 51 total).
  - Stages 9–11 landed together: Stage 9 added `src/svg/render.ts`
    (per-edge offset, sharp/rounded corners, flat-capped 180°
    reversals); Stage 10 swapped the `toSvgOutline` pipeline to
    `traceUniform + render` with a 0.125-module saddle chamfer for
    QR scannability; Stage 11 deleted `regions.ts`, `treatments.ts`,
    and `bad2.svg`.
  - Final tally: **177 tests across 6 files, all green** (trace 63,
    render 11, scan 63, plus encode / png / svg suites).
- Two semantic points worth remembering:
  - `render`'s `offset` parameter is signed. Positive expands
    outward (grows outer boundaries, shrinks holes); negative
    shrinks inward. `toSvgOutline` maps `treatment.inset → -offset`.
  - The Stage 6 X pinwheel, the Stage 4 triangle, and similar
    creative shape outputs are only produced when the user calls
    `trace()` directly. The QR renderer uses `traceUniform()`,
    which skips the creative detectors and emits faithful
    cell-border outlines so scanners see cells exactly.
- `saddleNotch` option on `TraceOptions`: `0` (default) keeps the
  original no-notch semantics for custom shape callers; `0.125` is
  what QR rendering passes to preserve empty cells at saddles.

### Session 2 — 2026-04-14 (evening)

Revisited the pipeline after the user observed that in their local
slinqi build, the diagonal outline variants looked visually identical
to the non-diagonal ones. Several architectural shifts followed.

**Key change — per-component trace.** The Session 1 decision to
route QR rendering through `traceUniform` (Stage 8 only, bypassing
the creative Stage 3–7 detectors) was wrong for the user's intent.
It preserved cells-exactly but produced the same stepped outlines
for both diagonal and non-diagonal modes. Replaced with
`traceComponents`: splits the cell set into connected components
(4-connected by default, 8-connected when `diagonals` is on) and
runs the full `trace()` pipeline on each — so 3-cell L components
render as 3-vertex triangles, 5-cell X components as 8-vertex
pinwheels, straight runs as 2-vertex capsule lines, and larger
irregular components fall through to `unifiedTrace` for a faithful
cell-border outline.

**Render-layer split: `offset` vs `lineThickness`.** A single signed
offset couldn't serve both geometries — regions at `0.5` would be
oversized, lines at `0` would be invisible. Split into two options:
- `offset` — signed perpendicular distance for region paths. `0`
  renders cells exactly.
- `lineThickness` — full width of line-like paths. Applied to
  2-vertex degenerate capsules and multi-vertex paths with 180°
  reversals (the X pinwheel's arm tips). Auto-detected via
  `isLineLike` which scans the path for anti-parallel adjacent
  edges.

**`saddleNotch: 0.125` plumbed through `traceComponents`.** The
immediate scan-failure cause after the per-component switch was that
`saddleNotch` wasn't propagating — larger components fell through
to the full-diagonal (notch 0) fallback, which has an adjacent-
saddle edge overlap bug on dense QR patterns. Fixed by passing
`saddleNotch: 0.125` explicitly through `traceComponents` in
`toSvgOutline`. Chamfered saddles for fallback geometry; clean
creative outputs for small components.

**Colour plumbing via `SvgOptions.color`.** Added `color: { dark?,
light?, background? }` to `SvgOptions` and `OutlineOptions`. Kept
renderers colour-unaware — they continue to emit `fill="#000"` /
`fill="#fff"` as defaults. Colour is applied once at the wrapping
boundary in `shared.ts::applyColours`, via exact-token string
substitution. Optional full-size background `<rect>` added when
`background` is set. Considered `currentColor` + CSS custom
properties for browser themability, but resvg doesn't propagate
the `color` attribute through `currentColor` — broke the scan
suite. String substitution trades inline CSS theming for
self-contained SVG that renders consistently in any renderer.

**Saddle invariant tests.** Tests now assert that Stage 4 triangles
and the X pinwheel render with 0 and 4 saddles respectively, and
that larger shapes (4-cell T, 7-cell I-beam, 4-row and 5-row
pyramids, solid rectangles) have no saddles. `findSaddles` exposed
as a public export for the assertions.

**node-qrcode parity suite.** Installed `qrcode` as a devDep and
wrote a parallel-test harness: 26 tests covering API signature
parity (`toString` returns `Promise<string>` or accepts callback,
`create` returns matrix-like object), matrix-dimension parity across
URLs and error levels, decodability parity via rasterise+jsqr, and
option-translation parity (`color.dark/light`, `errorCorrectionLevel`).
Doubles as a regression guard against future node-qrcode updates.

**Publish-ready structure.** Six dual-format (ESM + CJS) entry points:
- `@verevoir/qr` — universal core.
- `@verevoir/qr/node` — `toFile`, `toBuffer`.
- `@verevoir/qr/web` — `svgToPng`, `downloadPng`, DOM helpers.
- `@verevoir/qr/qrcode` — universal node-qrcode shim.
- `@verevoir/qr/qrcode/node` — shim + Node bits.
- `@verevoir/qr/qrcode/web` — shim + canvas bits.

**Final tally: 219 tests across 7 files, all green.**
- trace 63 (including 10 saddle invariant tests)
- render 11
- scan 63
- qrcode-parity 26
- svg 36
- encode / png suites unchanged

