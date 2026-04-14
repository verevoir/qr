# v2 styles — design brief

Companion to `.meta/filled-outline.md`. That document describes the
trace + render rebuild; this one records the broader design goals
the rebuild was actually in service of — and the style-space it
opens up.

This is **not a shipping spec**. It's a map of the possibility space
so we don't lose the vision when it's time to cut a shortlist for
the public API.

## Design goals

- **Fabrication-first.** Every style produces closed filled paths
  suitable for cutting, milling, laser engraving, and vinyl
  application. No style-level reliance on `stroke-width`, no
  reliance on fill-rule tricks the consumer must interpret. The
  current v1 metro is the counter-example — pretty on screen but
  unfabricable because it's a polyline with a rendered stroke.
- **Layered output.** Dark elements, light elements, and finder
  patterns are emitted as separate SVG groups so designers can
  colour / gradient / mask each layer independently, and vinyl
  cutters can treat each as its own cut. Three groups:
  `<g id="finder">`, `<g id="dark">`, `<g id="light">`.
- **Trace + render decomposition.** A style is a combination of
  _which cells go in_ and _which render options apply_, not an
  ad-hoc renderer. Shared mechanics (offsetting, corner treatment,
  capsule caps) live once in `render`.
- **Curated public surface.** The possibility space below is wide;
  the shipped style list will be a shortlist of greatest hits.
  Every style should earn its place by being visually distinct,
  fabrication-safe, and answering a real designer need. Too many
  adjacent variants is a usability failure.

## How layering falls out of the trace

`traceUniform` already emits outer boundaries (CW, positive area)
and hole boundaries (CCW, negative area) in one list. Splitting by
signed area at output time gives the dark and light layers for
free. Extending to a `toSvgLayered()` returning `{ finder, dark,
light }` strings (or an object with groups) is a small wrapper.

Finder patterns stay on their own layer because they're rendered
by `renderCorners` separately — they need to be identifiable
three-square patterns and shouldn't mix with the data-module
treatment anyway.

## Trace modes in play

Only `traceUniform` ships today. The others are sketches:

- **uniform** — one cell-border outline per connected component.
  Basis for: outline, outline-round, outline-diagonal.
- **per-cell** — every dark cell emitted as its own 4-vertex path,
  connected components ignored. Basis for: square, dots, and any
  "each module is a shape" style.
- **runs** — contiguous horizontal / vertical / diagonal runs of
  cells emitted as 2-vertex degenerate lines (Stage 3 geometry).
  Basis for: metro, horizontal, vertical, diagonal, lines,
  circuit-board.
- **medial** — a continuous path threaded through each component's
  interior. Basis for: scribble variants.
- **spiral** — successive inward polygon-offsets of a component's
  outline, chained into one continuous path. Basis for: spiral /
  concentric fills.

Each trace mode is `CellSet + options → Path[]`. The render layer
doesn't care which mode produced its input.

## Style-space sketch

Broader than any shortlist. Grouped by trace mode.

### Per-cell (shape-per-module)

Each dark cell becomes a filled primitive. `render`'s rounded
corners + shrink-inward offset do most of the work.

- **square** — current v1 style, now as render config: 4-vertex
  path per cell, sharp corners, `offset: 0`.
- **dots** — 4-vertex path per cell, rounded corners with radius
  ≈ 0.5 of half-cell, `offset` slightly negative for visible gaps.
- **diamonds** — per-cell 4-vertex path rotated 45°, sharp corners.
- **stars / flowers** — exotic per-cell primitives if render grows
  a "replace each unit path with a template" hook. Not a priority.

Light-cell variants (trace the _empty_ cells) produce the negative
of any of the above. Useful for layered designs where the light
layer is its own colour.

### Runs (line-based)

Fabrication-ready by construction once routed through trace +
render. Every run becomes a capsule via Stage 3 geometry.

- **metro** — H runs, V runs, diagonal runs layered with a
  priority. Thickness via `offset`. Fills cells completely at
  `offset: 0.5`. This is the fabrication-safe successor to the
  v1 metro.
- **circuit-board** — metro variant with thin lines (`offset`
  small), 45° diagonal connectors around finder edges. Thin-line
  look already exists in v1 but isn't cuttable; trace + render
  fixes that.
- **horizontal / vertical / diagonal** — single-axis-only runs.
  Quick stylised looks.
- **lines** — all-axis, diagonals-first tubemap style (current v1
  behaviour, re-expressed on trace + render).

### Medial (scribble variants)

Start from a continuous medial path through each component, then
bias the rendered stroke.

- **scribble-horizontal** — periodic perpendicular offset along
  the medial, biased toward horizontal travel. Back-and-forth
  within each shape.
- **scribble-vertical / scribble-diagonal** — same but biased
  toward V / D axes.
- **scribble-uniform** — global bias axis, so every stroke leans
  the same direction regardless of the underlying medial shape.
  (The "up lines irrespective of direction" variant.)
- **scribble-organic** — current v1 drunken-spider look, kept as
  a baseline for users who like it.

Parameterisation: bias amplitude, wavelength, smoothing radius,
turn radius. Same render machinery for all four.

### Spiral

Successive inward offsets of each component's outline,
concatenated with short radial connectors into one continuous
spiral path.

- **spiral** — constant step, renders as a clockwise or counter-
  clockwise spiral from the outside in. Terminates when the offset
  polygon collapses.
- **concentric-rings** — same idea but don't connect the rings —
  render each as its own closed path. Non-continuous but visually
  similar and a useful variant for layered fills.

### Outline (already shipped)

- **outline** — SHARP treatment, filled cells.
- **outline-round** — ROUNDED treatment.
- **outline-diagonal** — SHARP_DIAGONAL with 0.125-module saddle
  chamfer.
- **outline-round-diagonal** — ROUNDED_DIAGONAL with saddle
  chamfer.

## Public shortlist (to be curated)

Deliberately empty. When the library packages as v2, pick from the
above. Guiding question for each candidate: _what designer problem
does this style solve that none of the others do?_ If two
candidates answer the same question, ship one.

Rough priors, not decisions:

- Keep outline, outline-round, outline-diagonal. They're core and
  already shipped.
- Keep metro, move it to trace + render for fabrication.
- Keep one or two scribble variants. The current v1 scribble is
  the baseline; whichever biased variant reads best replaces or
  supplements it.
- Per-cell family likely collapses to square + dots + maybe
  diamonds. Too many small-shape variants just look like each
  other at scanning distance.
- Spiral / concentric is a possible headline style if the
  aesthetic holds up at real QR density — worth a prototype before
  promoting it to the shortlist.

## Not shipping (design dead-ends)

- Styles whose output isn't fabricable — stroke-width reliance,
  fill-rule gymnastics, self-intersections that CAM tools misread.
- Styles that just re-skin an existing one without solving a new
  problem (the curation principle).
- Decorative elements that compromise scannability past the
  error-correction threshold at any URL length used by Slinqi.

## Related documents

- `.meta/filled-outline.md` — the trace + render rebuild that
  makes all of the above possible.
- `CLAUDE.md` — the QR package's project-level conventions.
- Control plane `docs/architecture/L3-qr.md` — L3 diagram of the
  QR engine; update when the style list is curated.
