/**
 * Tests for `src/svg/render.ts` — the Stage 2 renderer that inflates
 * traced paths into an SVG `d` string via per-edge offset.
 *
 * Fixtures cover the three geometric cases the renderer handles
 * (ordinary convex corner, 180° reversal → flat cap, concave corner)
 * end-to-end from hand-constructed paths rather than going through
 * `trace()` — we want to pin down the render layer's behaviour
 * independently of the trace layer.
 */
import { describe, it, expect } from 'vitest';
import { render } from '../src/svg/render.js';
import type { Path } from '../src/svg/trace.js';

describe('render', () => {
  it('empty paths array produces an empty string', () => {
    expect(render([])).toBe('');
  });

  it('path with fewer than two vertices produces nothing', () => {
    expect(render([[[0, 0]] as unknown as Path])).toBe('');
  });

  it('clockwise unit square at offset 0.5 expands outward uniformly', () => {
    // Unit square at (1..2, 1..2) CW. Each 90° corner expands to
    // `offset * √2` along the outward bisector = 0.5 units on each axis.
    const square: Path = [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
    ];
    expect(render([square], { offset: 0.5 })).toBe(
      'M0.5,0.5L2.5,0.5L2.5,2.5L0.5,2.5Z',
    );
  });

  it('offset of zero leaves region vertex positions untouched', () => {
    const square: Path = [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
    ];
    expect(render([square], { offset: 0 })).toBe(
      'M1,1L2,1L2,2L1,2Z',
    );
  });

  it('degenerate 2-vertex horizontal line becomes a flat-capped capsule', () => {
    // Line from (0, 0.5) to (3, 0.5). 2-vertex path is line-like,
    // so it uses `lineThickness / 2` as its offset regardless of
    // the `offset` option. Default lineThickness = 1.0 → half-width
    // 0.5, capsule covers y ∈ [0, 1].
    const line: Path = [
      [0, 0.5],
      [3, 0.5],
    ];
    expect(render([line])).toBe('M0,1L0,0L3,0L3,1Z');
  });

  it('thinner lineThickness shrinks capsules without touching regions', () => {
    const line: Path = [
      [0, 0.5],
      [3, 0.5],
    ];
    // lineThickness 0.4 → half-width 0.2, capsule covers y ∈ [0.3, 0.7]
    expect(render([line], { lineThickness: 0.4 })).toBe(
      'M0,0.7L0,0.3L3,0.3L3,0.7Z',
    );
  });

  it('degenerate diagonal line becomes a rotated-rectangle capsule', () => {
    // `\` diagonal from (0, 0) to (2, 2). With lineThickness = √2
    // the perpendicular offset is ±(1, -1)/√2 × √2/2 = ±0.5 each axis.
    const line: Path = [
      [0, 0],
      [2, 2],
    ];
    const d = render([line], { lineThickness: Math.SQRT2 });
    expect(d).toBe('M-0.5,0.5L0.5,-0.5L2.5,1.5L1.5,2.5Z');
  });

  it('translate shifts every output coordinate', () => {
    const square: Path = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(
      render([square], { offset: 0, translate: [1, 1] }),
    ).toBe('M1,1L2,1L2,2L1,2Z');
  });

  it('multiple paths concatenate as multiple subpaths', () => {
    const a: Path = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const b: Path = [
      [2, 2],
      [3, 2],
      [3, 3],
      [2, 3],
    ];
    expect(render([a, b], { offset: 0 })).toBe(
      'M0,0L1,0L1,1L0,1ZM2,2L3,2L3,3L2,3Z',
    );
  });

  it('concave L corner fills inward toward the notch', () => {
    // 3-cell L outline (no diagonal collapse): the inner corner at
    // (1, 1) is concave. Offset miter lands INSIDE the notch at
    // (1.5, 1.5), correctly thickening the filled area.
    const L: Path = [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1], //     concave vertex
      [1, 2],
      [0, 2],
    ];
    expect(render([L], { offset: 0.5 })).toBe(
      'M-0.5,-0.5L2.5,-0.5L2.5,1.5L1.5,1.5L1.5,2.5L-0.5,2.5Z',
    );
  });

  it('outer CW + inner CCW: hole shrinks by offset on every side', () => {
    // 3×3 O-ring: outer CW, inner CCW around the 1×1 hole at (1,1)..(2,2).
    // At offset 0.25 the hole shrinks from 1×1 to 0.5×0.5.
    const outer: Path = [
      [0, 0],
      [3, 0],
      [3, 3],
      [0, 3],
    ];
    const inner: Path = [
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 1],
    ];
    const d = render([outer, inner], { offset: 0.25 });
    expect(d).toBe(
      'M-0.25,-0.25L3.25,-0.25L3.25,3.25L-0.25,3.25Z' +
        'M1.25,1.25L1.25,1.75L1.75,1.75L1.75,1.25Z',
    );
  });

  it('X-saddle pinwheel: 4 flat-capped tips + 4 centre miter points', () => {
    // The Stage 6 X at the origin: tips at the 4 outer corners,
    // centre coincident visits at (1.5, 1.5). The path contains
    // 180° reversals (tips), so it's line-like and uses
    // `lineThickness / 2` rather than `offset`. Each tip is a flat
    // cap (2 vertices); each centre visit is a miter (1 vertex).
    // 12 output vertices total.
    const x: Path = [
      [0, 0],
      [1.5, 1.5],
      [3, 0],
      [1.5, 1.5],
      [3, 3],
      [1.5, 1.5],
      [0, 3],
      [1.5, 1.5],
    ];
    const d = render([x], { lineThickness: 0.5 });
    // 1 M + 11 L + 1 Z
    expect((d.match(/M/g) ?? []).length).toBe(1);
    expect((d.match(/L/g) ?? []).length).toBe(11);
    expect(d.endsWith('Z')).toBe(true);
    // At lineThickness 0.5, half-width = 0.25, corner offset along
    // 90° bisector = 0.25 * √2 ≈ 0.3536. So the centre miter points
    // sit at (1.5, 1.1464) north of centre and (1.5, 1.8536) south.
    expect(d).toContain('1.5,1.1464'); //   north of centre
    expect(d).toContain('1.5,1.8536'); //   south of centre
  });
});
