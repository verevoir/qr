# ADR 001: Connected-Component Walking for Scribble Renderers

## Status

Accepted

## Context

The QR package needed two new SVG styles (`scribble` and `scribble-alt`) that render QR data modules as continuous hand-drawn-looking curves rather than discrete geometric shapes. The existing renderers (square, dots, horizontal, vertical, diagonal, grid) all treat modules individually or as axis-aligned runs. A scribble style needs to trace connected regions as single continuous paths.

Three approaches were considered:

1. **Per-module rendering with post-hoc smoothing** — render each dark module individually, then use SVG filters or path merging to create a continuous appearance. Simple to implement but produces visual artifacts at junctions and poor SVG output (overlapping paths, large file size).

2. **Flood-fill outline tracing** — the approach used by the `grid` renderer. Find connected components via flood fill, trace the boundary, emit a single filled `<path>`. Works well for filled shapes but doesn't produce the linear, hand-drawn aesthetic wanted for scribble.

3. **Connected-component walking with direction priority tables** — find components via 8-connected BFS, then walk a greedy path through each component using configurable direction priorities. Simplify the path (merge co-linear points), then smooth turns with quadratic Bezier curves.

## Decision

The scribble renderers use **8-connected BFS** to find components, then a **two-state greedy walker** with configurable direction priority tables to trace each component as a single path.

The walker maintains a boolean state (A/B) that alternates based on the direction taken. Each state has its own priority table — an ordered list of direction vectors. The walker picks the first available unvisited neighbour in priority order. A `classify` function determines whether the direction taken switches state, keeps state, or is neutral.

Two configurations share the same algorithm:

- **`scribble`** — State A prefers `\` diagonals, State B prefers `/` diagonals. This creates a diagonal zigzag pattern. Bezier radius 0.5 produces smooth, flowing curves.
- **`scribble-alt`** — State A prefers rightward, State B prefers leftward. This creates a horizontal zigzag. Bezier radius 0.15 produces more angular turns.

After walking, paths are simplified (consecutive co-linear points merged) and smoothed with quadratic Bezier curves at turns. The radius is clamped to half the shortest adjacent segment to prevent overshooting.

## Consequences

- **Two distinct styles from one algorithm.** The configuration-driven approach means adding new scribble variants requires only a new `WalkConfig` object, not a new renderer.
- **8-connected BFS produces natural diagonal flows.** 4-connected would miss diagonal adjacency and fragment components that are visually connected.
- **Greedy walking is O(n) per component.** No backtracking or global optimisation. This is fast and deterministic but doesn't guarantee the longest possible path through a component — some modules may be unreachable from the start point and require a second pass. In practice, the visual effect is good enough.
- **Fixed features are masked.** Finder and alignment patterns are excluded from component detection and rendered separately by the corner renderer. This preserves the reader-critical structural patterns.
- **Path simplification reduces SVG size.** Merging co-linear points before Bezier smoothing keeps the output compact.
- **Bezier radius as a style parameter.** The difference between flowing curves (scribble) and angular turns (scribble-alt) is entirely controlled by the radius value, not the algorithm.
