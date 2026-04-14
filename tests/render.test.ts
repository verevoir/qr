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

  it('clockwise unit square offset by 0.5 expands outward uniformly', () => {
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

  it('offset of zero leaves vertex positions untouched', () => {
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
    // Line from (0, 0.5) to (3, 0.5). Both endpoints are 180°
    // reversals, so each emits two flat-cap vertices. Resulting
    // rectangle covers (0..3, 0..1) — one full module tall at offset
    // 0.5 on each side.
    const line: Path = [
      [0, 0.5],
      [3, 0.5],
    ];
    expect(render([line], { offset: 0.5 })).toBe(
      'M0,1L0,0L3,0L3,1Z',
    );
  });

  it('degenerate diagonal line becomes a rotated-rectangle capsule', () => {
    // `\` diagonal from (0, 0) to (2, 2). Offset perpendicular to
    // travel direction is ±(1, -1)/√2. Flat caps at each end.
    const line: Path = [
      [0, 0],
      [2, 2],
    ];
    const d = render([line], { offset: Math.SQRT1_2 });
    // Expected corners (CCW): (-0.5, 0.5), (0.5, -0.5), (2.5, 1.5), (1.5, 2.5)
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
    // centre coincident visits at (1.5, 1.5). Each tip is a 180°
    // reversal (flat cap → 2 vertices); each centre visit is a
    // left-turn corner (1 miter vertex). 12 output vertices total.
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
    const d = render([x], { offset: 0.25 });
    // Count subpath commands: should be 1 M + 11 L + 1 Z
    expect((d.match(/M/g) ?? []).length).toBe(1);
    expect((d.match(/L/g) ?? []).length).toBe(11);
    expect(d.endsWith('Z')).toBe(true);
    // Two of the centre miter points — at tipIdx 1 and 5 (NW-to-NE
    // and SE-to-SW transitions) — lie above and below centre along
    // the y-axis. Verify presence in the emitted string.
    // Shift magnitude: offset * √2 ≈ 0.3536 for the 90° corner
    expect(d).toContain('1.5,1.1464'); //   north of centre
    expect(d).toContain('1.5,1.8536'); //   south of centre
  });
});
