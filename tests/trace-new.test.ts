import {
  trace,
  sortVertices,
  VisitedGrid,
  vertexFilter,
} from '../src/svg/trace-new';
import type { Vertex } from '../src/svg/trace-new';
import { describe, expect, it } from 'vitest';

function toUInt(array: number[][]): Uint8Array[] {
  const response: Uint8Array[] = [];
  for (const line of array) {
    response.push(Uint8Array.from(line));
  }

  return response;
}

/** Shorthand so tests read naturally: `v(2, 1)` instead of `{ x: 2, y: 1 }`. */
const v = (x: number, y: number): Vertex => ({ x, y });

describe('pin wheels', () => {
  it('finds a dot', () => {
    const testData = toUInt([
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]);

    const response = trace(testData);

    expect(response.paths.length).toBe(0);
    expect(response.dots).toEqual([v(2, 1)]);
  });
  it('finds two dots', () => {
    const testData = toUInt([
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0],
    ]);

    const response = trace(testData);

    expect(response.paths.length).toBe(0);
    expect(response.dots).toEqual([v(2, 1), v(3, 3)]);
  });
  it('finds a line', () => {
    const testData = toUInt([
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]);

    const response = trace(testData);

    expect(response.dots.length).toBe(0);
    expect(response.paths).toEqual([[v(2, 1), v(3, 2), v(2, 1)]]);
  });
  it('finds two lines', () => {
    const testData = toUInt([
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0],
    ]);

    const response = trace(testData);

    expect(response.dots.length).toBe(0);
    expect(response.paths).toEqual([
      [v(2, 1), v(3, 2), v(2, 1)],
      [v(1, 3), v(0, 4), v(1, 3)],
    ]);
  });
});

describe('sortVertices', () => {
  it('sorts by y then x', () => {
    expect(sortVertices([v(3, 2), v(1, 0), v(0, 2), v(2, 1)])).toEqual([
      v(1, 0),
      v(2, 1),
      v(0, 2),
      v(3, 2),
    ]);
  });

  it('handles same y, sorts by x', () => {
    expect(sortVertices([v(4, 1), v(0, 1), v(2, 1)])).toEqual([
      v(0, 1),
      v(2, 1),
      v(4, 1),
    ]);
  });

  it('handles same x, sorts by y', () => {
    expect(sortVertices([v(0, 3), v(0, 1), v(0, 0)])).toEqual([
      v(0, 0),
      v(0, 1),
      v(0, 3),
    ]);
  });

  it('returns empty for empty input', () => {
    expect(sortVertices([])).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const original: Vertex[] = [v(2, 1), v(0, 0)];
    sortVertices(original);
    expect(original).toEqual([v(2, 1), v(0, 0)]);
  });

  it('handles single vertex', () => {
    expect(sortVertices([v(3, 7)])).toEqual([v(3, 7)]);
  });

  it('handles negative coordinates', () => {
    expect(sortVertices([v(1, 0), v(-1, -1), v(0, -1)])).toEqual([
      v(-1, -1),
      v(0, -1),
      v(1, 0),
    ]);
  });
});

describe('VisitedGrid', () => {
  it('starts with all cells unvisited', () => {
    const grid = new VisitedGrid(3);
    expect(grid.visited(0, 0)).toBe(false);
    expect(grid.visited(2, 2)).toBe(false);
  });

  it('marks a cell as visited', () => {
    const grid = new VisitedGrid(3);
    grid.visit(1, 1);
    expect(grid.visited(1, 1)).toBe(true);
    expect(grid.visited(0, 0)).toBe(false);
  });

  it('yields all coordinates when nothing visited', () => {
    const grid = new VisitedGrid(3);
    const coords = [...grid.unvisited()];
    expect(coords).toEqual([
      v(0, 0),
      v(1, 0),
      v(2, 0),
      v(0, 1),
      v(1, 1),
      v(2, 1),
      v(0, 2),
      v(1, 2),
      v(2, 2),
    ]);
  });

  it('skips visited cells in unvisited generator', () => {
    const grid = new VisitedGrid(3);
    grid.visit(1, 0);
    grid.visit(0, 1);
    grid.visit(2, 2);
    const coords = [...grid.unvisited()];
    expect(coords).toEqual([
      v(0, 0),
      v(2, 0),
      v(1, 1),
      v(2, 1),
      v(0, 2),
      v(1, 2),
    ]);
  });

  it('yields nothing when all cells visited', () => {
    const grid = new VisitedGrid(2);
    grid.visit(0, 0);
    grid.visit(1, 0);
    grid.visit(0, 1);
    grid.visit(1, 1);
    expect([...grid.unvisited()]).toEqual([]);
  });

  it('handles a 1x1 grid', () => {
    const grid = new VisitedGrid(1);
    expect([...grid.unvisited()]).toEqual([v(0, 0)]);
    grid.visit(0, 0);
    expect([...grid.unvisited()]).toEqual([]);
    expect(grid.visited(0, 0)).toBe(true);
  });

  it('yields in scanline order (top-to-bottom, left-to-right)', () => {
    const grid = new VisitedGrid(4);
    grid.visit(0, 0);
    grid.visit(3, 3);
    const coords = [...grid.unvisited()];
    // First unvisited should be (1,0), last should be (2,3)
    expect(coords[0]).toEqual(v(1, 0));
    expect(coords[coords.length - 1]).toEqual(v(2, 3));
  });
});

describe('+ pattern', () => {
  it('traces a 3x3 plus', () => {
    const testData = toUInt([
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ]);

    const response = trace(testData);

    expect(response.dots.length).toBe(0);
    expect(response.paths).toEqual([
      [v(1, 0), v(2, 1), v(1, 2), v(0, 1), v(1, 0)],
    ]);
  });

  it('traces a 5x5 plus', () => {
    const testData = toUInt([
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ]);

    const response = trace(testData);

    expect(response.dots.length).toBe(0);
    expect(response.paths).toEqual([
      [
        v(2, 0),
        v(2, 1),
        v(3, 2),
        v(4, 2),
        v(3, 2),
        v(2, 3),
        v(2, 4),
        v(2, 3),
        v(1, 2),
        v(2, 2),
        v(0, 2),
        v(1, 2),
        v(2, 3),
        v(3, 2),
        v(2, 1),
        v(2, 0),
      ],
    ]);
  });
});

describe('I pattern', () => {
  it('traces a 3x3 I', () => {
    const testData = toUInt([
      [1, 1, 1],
      [0, 1, 0],
      [1, 1, 1],
    ]);

    const response = trace(testData);

    expect(response.dots.length).toBe(0);
    expect(response.paths).toEqual([[v(0, 0), v(1, 1), v(2, 0), v(0, 0)]]);
  });

  it('traces a 5x5 I', () => {
    const testData = toUInt([
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 1, 1],
    ]);

    const response = trace(testData);

    expect(response.dots.length).toBe(0);
    expect(response.paths).toEqual([
      [
        v(0, 0),
        v(1, 0),
        v(2, 1),
        v(3, 0),
        v(4, 0),
        v(2, 0),
        v(3, 0),
        v(2, 1),
        v(2, 3),
        v(3, 4),
        v(4, 4),
        v(0, 4),
        v(3, 4),
        v(2, 3),
        v(2, 1),
        v(1, 0),
        v(0, 0),
      ],
    ]);
  });
});

describe('H pattern', () => {
  it('traces a 3x3 H', () => {
    const testData = toUInt([
      [1, 0, 1],
      [1, 1, 1],
      [1, 0, 1],
    ]);

    const response = trace(testData);

    expect(response.dots.length).toBe(0);
    expect(response.paths).toEqual([
      [v(0, 0), v(1, 1), v(2, 0), v(2, 2), v(2, 0), v(0, 2), v(0, 0)],
    ]);
  });

  it('traces a 5x5 H', () => {
    const testData = toUInt([
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 0, 0, 1],
    ]);

    const response = trace(testData);

    expect(response.dots.length).toBe(0);
    expect(response.paths).toEqual([
      [
        v(0, 0),
        v(0, 1),
        v(1, 2),
        v(3, 2),
        v(4, 1),
        v(4, 4),
        v(4, 0),
        v(4, 1),
        v(3, 2),
        v(1, 2),
        v(0, 3),
        v(0, 4),
        v(0, 2),
        v(0, 3),
        v(1, 2),
        v(0, 1),
        v(0, 0),
      ],
    ]);
  });
});

describe('x pattern', () => {
  it('traces a 3x3 x', () => {
    const testData = toUInt([
      [1, 0, 1],
      [0, 1, 0],
      [1, 0, 1],
    ]);

    const response = trace(testData);

    expect(response.dots.length).toBe(0);
    expect(response.paths).toEqual([
      [
        v(0, 0),
        v(1, 1),
        v(2, 0),
        v(1, 1),
        v(2, 2),
        v(1, 1),
        v(0, 2),
        v(1, 1),
        v(0, 0),
      ],
    ]);
  });

  it('traces a 5x5 x', () => {
    const testData = toUInt([
      [1, 0, 0, 0, 1],
      [0, 1, 0, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 1, 0, 1, 0],
      [1, 0, 0, 0, 1],
    ]);

    const response = trace(testData);

    expect(response.dots.length).toBe(0);
    expect(response.paths).toEqual([
      [
        v(0, 0),
        v(2, 2),
        v(4, 0),
        v(2, 2),
        v(4, 4),
        v(2, 2),
        v(0, 4),
        v(2, 2),
        v(0, 0),
      ],
    ]);
  });

  it('traces a complex shape', () => {
    const testData = toUInt([
      [1, 0, 0, 0, 1],
      [1, 0, 1, 0, 1],
      [1, 1, 1, 1, 1],
      [1, 0, 1, 0, 1],
      [1, 0, 0, 0, 1],
    ]);

    const response = trace(testData);

    expect(response.dots.length).toBe(0);
    expect(response.paths).toEqual([
      [
        v(0, 0),
        v(0, 1),
        v(1, 2),
        v(2, 1),
        v(3, 2),
        v(4, 1),
        v(4, 4),
        v(4, 0),
        v(4, 1),
        v(2, 3),
        v(2, 2),
        v(2, 3),
        v(3, 2),
        v(2, 1),
        v(0, 3),
        v(0, 4),
        v(0, 2),
        v(0, 3),
        v(1, 2),
        v(0, 1),
        v(0, 0),
      ],
    ]);
  });
});

describe('vertexFilter', () => {
  it('completes with no verticies', () => {
    expect(Array.from(vertexFilter([]))).toEqual([]);
  });

  it('one vertex returns as is', () => {
    expect(Array.from(vertexFilter([v(1, 1)]))).toEqual([v(1, 1)]);
  });

  it('two verticies returns as is', () => {
    expect(Array.from(vertexFilter([v(1, 1), v(2, 2)]))).toEqual([
      v(1, 1),
      v(2, 2),
    ]);
  });

  it('three verticies in a line returns only the ends', () => {
    expect(Array.from(vertexFilter([v(1, 1), v(2, 2), v(3, 3)]))).toEqual([
      v(1, 1),
      v(3, 3),
    ]);
  });

  it('a zig-zag returns inflection points', () => {
    expect(
      Array.from(
        vertexFilter([
          v(1, 1),
          v(2, 2),
          v(1, 3),
          v(2, 4),
          v(3, 5),
          v(4, 6),
          v(3, 7),
        ]),
      ),
    ).toEqual([v(1, 1), v(2, 2), v(1, 3), v(4, 6), v(3, 7)]);
  });
});
