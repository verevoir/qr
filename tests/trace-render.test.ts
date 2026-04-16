/**
 * Trace-to-render integration tests. Verify that traced shapes produce
 * the expected number of offset vertices and correct SVG structure
 * when run through the offset renderer.
 */
import { trace } from '../src/svg/trace';
import { offsetSubpath } from '../src/svg/outline';
import { describe, it, expect } from 'vitest';

const toUInt = (a: number[][]) => a.map((r) => Uint8Array.from(r));

/** Count M (moveto) commands in an SVG path string. */
function countSubpaths(d: string): number {
  return (d.match(/M/g) ?? []).length;
}

/** Count L (lineto) commands + 1 M = total vertices in a single subpath. */
function countVertices(d: string): number {
  return (d.match(/[ML]/g) ?? []).length;
}

/** Parse SVG path string into coordinate pairs. */
function parsePoints(d: string): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const re = /([ML])(-?\d+\.?\d*),(-?\d+\.?\d*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    points.push({ x: Number(m[2]), y: Number(m[3]) });
  }
  return points;
}

describe('offsetSubpath — 3x3 X', () => {
  // 3x3 X walker: 8 unique vertices (pinwheel, 4 centre visits).
  // After miter offset: 4 tips (180° → 2 flat-cap points) +
  // 4 centres (90° miter → 1 point) = 12 vertices, 1 subpath.
  const x3 = toUInt([
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1],
  ]);

  it('produces 12 offset vertices in 1 subpath', () => {
    const traced = trace(x3);
    expect(traced.paths).toHaveLength(1);
    const d = offsetSubpath(traced.paths[0].vertices, 0.5, 0, 0);
    expect(countSubpaths(d)).toBe(1);
    expect(countVertices(d)).toBe(12);
  });

  it('ends with Z (closed)', () => {
    const traced = trace(x3);
    const d = offsetSubpath(traced.paths[0].vertices, 0.5, 0, 0);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('translate shifts all coordinates', () => {
    const traced = trace(x3);
    const d0 = offsetSubpath(traced.paths[0].vertices, 0.5, 0, 0);
    const d1 = offsetSubpath(traced.paths[0].vertices, 0.5, 1, 1);
    const pts0 = parsePoints(d0);
    const pts1 = parsePoints(d1);
    expect(pts1.length).toBe(pts0.length);
    for (let i = 0; i < pts0.length; i++) {
      expect(pts1[i].x).toBeCloseTo(pts0[i].x + 1, 3);
      expect(pts1[i].y).toBeCloseTo(pts0[i].y + 1, 3);
    }
  });
});

describe('offsetSubpath — degenerate line', () => {
  // 2-cell diagonal line: walker output is (A, B, A) — 2 unique
  // vertices after stripping closing duplicate. Both are 180°
  // reversals → 2 flat-cap points each = 4 vertices, 1 subpath.
  const line = toUInt([
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);

  it('produces 4 offset vertices (capsule)', () => {
    const traced = trace(line);
    expect(traced.paths).toHaveLength(1);
    const d = offsetSubpath(traced.paths[0].vertices, 0.5, 0, 0);
    expect(countSubpaths(d)).toBe(1);
    expect(countVertices(d)).toBe(4);
  });
});

describe('offsetSubpath — simple square', () => {
  const block = toUInt([
    [1, 1],
    [1, 1],
  ]);

  it('offset outline is a single closed polygon', () => {
    const traced = trace(block);
    expect(traced.paths.length).toBeGreaterThanOrEqual(1);
    const d = offsetSubpath(traced.paths[0].vertices, 0.5, 0, 0);
    expect(d.endsWith('Z')).toBe(true);
    expect(countSubpaths(d)).toBe(1);
  });
});

describe('offsetSubpath — 3x3 ring', () => {
  const ring = toUInt([
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ]);

  it('outer path produces offset vertices; missed corner becomes a dot', () => {
    const traced = trace(ring);
    expect(traced.paths).toHaveLength(1);
    const path = traced.paths[0];
    const dOuter = offsetSubpath(path.vertices, 0.5, 0, 0);
    expect(countVertices(dOuter)).toBeGreaterThan(0);
    // No holes — hole detection is deferred; missed corner is a top-level dot
    expect(path.holeVertices).toEqual([]);
    expect(path.dots).toEqual([]);
    expect(traced.dots.length).toBeGreaterThanOrEqual(1);
  });
});

describe('offsetSubpath — 5x5 ring', () => {
  const ring = toUInt([
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ]);

  it('outer path produces offset vertices', () => {
    const traced = trace(ring);
    expect(traced.paths).toHaveLength(1);
    const dOuter = offsetSubpath(traced.paths[0].vertices, 0.5, 0, 0);
    expect(countVertices(dOuter)).toBeGreaterThan(0);
  });
});
