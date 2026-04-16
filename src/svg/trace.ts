/**
 * Local `Vertex` type — object form rather than a tuple. The tuple
 * form `[x, y]` made x/y interchangeable at the type level, which
 * invited silent axis-swap bugs (e.g. `cells[v[0]][x]` instead of
 * `cells[v[1]][x]` is accepted by the type checker but indexes the
 * diagonal scanline instead of the intended row). With `{ x, y }` the
 * mistake reads obviously wrong (`cells[v.x][x]`) and TS flags it if
 * `cells` is typed as a row-indexed array.
 */
export type Vertex = { readonly x: number; readonly y: number };

const NE: Vertex = { x: 1, y: -1 };
const SE: Vertex = { x: 1, y: 1 };
const E: Vertex = { x: 1, y: 0 };
const SW: Vertex = { x: -1, y: 1 };
const S: Vertex = { x: 0, y: 1 };
const NW: Vertex = { x: -1, y: -1 };
const W: Vertex = { x: -1, y: 0 };
const N: Vertex = { x: 0, y: -1 };

const Neighbors8: Vertex[] = [NE, SE, E, SW, S, NW, W, N];

/**
 * A traced shape: its outer CW outline, any enclosed multi-cell hole
 * outlines (walked CW, rendered as cut-outs via fill-rule), and any
 * single-cell holes or 1-cell islands inside holes (rendered as dots).
 *
 * Multi-cell islands inside holes aren't supported yet — if one shows
 * up the simplest extension is to push it back to `Trace.dots` /
 * `Trace.paths` via a recursive `trace()` call on the inverted mask.
 */
export type Path = {
  vertices: Vertex[];
  holeVertices: Vertex[][];
  dots: Vertex[];
};

export type Trace = {
  dots: Vertex[];
  paths: Path[];
};

function findDirection(from: Vertex, to: Vertex): Vertex {
  return { x: to.x - from.x, y: to.y - from.y };
}

export function* vertexFilter(vertices: Iterable<Vertex>): Generator<Vertex> {
  let previousVertex: Vertex | undefined = undefined;
  let previousDirection: Vertex | undefined;
  let count = 0;

  for (const vertex of vertices) {
    count++;

    if (!previousVertex) {
      previousVertex = vertex;
      yield vertex;
      continue;
    }
    const direction = findDirection(previousVertex, vertex);
    if (!previousDirection) {
      previousDirection = direction;
      previousVertex = vertex;
      continue;
    }
    if (
      previousDirection.x !== direction.x ||
      previousDirection.y !== direction.y
    )
      yield previousVertex;
    previousDirection = direction;
    previousVertex = vertex;
  }

  if (count > 1 && previousVertex) yield previousVertex;
}

/**
 * Sort vertices by y coordinate first, then x. Used to establish
 * a scanline-friendly order for flood fill — processing top-to-
 * bottom, left-to-right.
 */
export function sortVertices(vertices: Vertex[]): Vertex[] {
  return vertices.slice().sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Tracks which cells in a grid have been visited. Rows are
 * allocated lazily so a sparse grid doesn't waste memory.
 */
export class VisitedGrid {
  private rows: Uint8Array[] = [];

  constructor(readonly size: number) {}

  /** Mark cell at (x, y) as visited. */
  visit(x: number, y: number): void {
    this.row(y)[x] = 1;
  }

  /** Check whether (x, y) has been visited. */
  visited(x: number, y: number): boolean {
    return this.row(y)[x] === 1;
  }

  /** Yield every unvisited coordinate in scanline order. */
  *unvisited(): Generator<Vertex> {
    for (let y = 0; y < this.size; y++) {
      const row = this.row(y);
      for (let x = 0; x < this.size; x++) {
        if (row[x] === 0) yield { x, y };
      }
    }
  }

  private row(y: number): Uint8Array {
    return this.rows[y] || (this.rows[y] = new Uint8Array(this.size));
  }
}

function neighborVertex(
  vertex: Vertex,
  neighbor: Vertex,
  size: number,
): Vertex | undefined {
  const combined: Vertex = {
    x: vertex.x + neighbor.x,
    y: vertex.y + neighbor.y,
  };
  return 0 <= combined.x &&
    combined.x < size &&
    0 <= combined.y &&
    combined.y < size
    ? combined
    : undefined;
}

/**
 * Depth-first walk from `cell`, following `Neighbors8` in fixed order
 * and recording a backtrack vertex each time a recursion unwinds. This
 * gives junction cells (like the centre of an X) one vertex per arm
 * visit — the "pinwheel" pattern — while straight runs produce a flat
 * sequence that `vertexFilter` later collapses to just the inflection
 * points.
 *
 * Returns `true` when this branch of the walk reached `start` via its
 * `Neighbors8` iteration — the caller then unwinds the whole recursion
 * immediately, closing the loop in `Neighbors8` (i.e. CW, diagonal-
 * preferring) order. This is the "diagonals always win" rule in
 * action: for a 3×3 `+`, from the west-arm cell the NE neighbour
 * *is* the start cell, so we close before ever considering the E
 * neighbour (which is the centre).
 *
 * `isTarget` decides whether a neighbour is a valid walk cell. For
 * the outer trace it's `cells[y][x] === 1`; for hole tracing it's
 * `mask[y][x] === 1 && cells[y][x] === 0` — same walker, flipped
 * polarity.
 */
function walk(
  cell: Vertex,
  start: Vertex,
  isTarget: (x: number, y: number) => boolean,
  visited: VisitedGrid,
  size: number,
  path: Vertex[],
): boolean {
  for (const neighbor of Neighbors8) {
    const combined = neighborVertex(cell, neighbor, size);
    if (!combined) continue;
    if (!isTarget(combined.x, combined.y)) continue;
    if (combined.x === start.x && combined.y === start.y) return true;
    if (visited.visited(combined.x, combined.y)) continue;

    visited.visit(combined.x, combined.y);
    path.push(combined);
    const closed = walk(combined, start, isTarget, visited, size, path);
    if (closed) return true; //   close path early; caller re-adds start once at top level
    path.push(cell); //   re-record on return — this is the junction's "next arm" checkpoint
  }
  return false;
}

export function trace(cells: Uint8Array[]): Trace {
  const size = cells.length;
  const grid = new VisitedGrid(size);
  const isTarget = (x: number, y: number): boolean => cells[y][x] === 1;
  const dots: Vertex[] = [];
  const paths: Path[] = [];

  for (const start of grid.unvisited()) {
    grid.visit(start.x, start.y);
    if (!isTarget(start.x, start.y)) continue;

    const rawPath: Vertex[] = [start];
    walk(start, start, isTarget, grid, size, rawPath);

    if (rawPath.length === 1) {
      dots.push(rawPath[0]);
      continue;
    }
    rawPath.push({ x: start.x, y: start.y });

    // Don't flood the entire 8-connected component — that would mark
    // every connected cell visited and prevent subsequent walks from
    // picking up the rest of the shape as separate paths. The walker
    // already marks cells it visits; unvisited cells become new walks
    // on the next scanline pass. Interior cells the walker skipped
    // (e.g. a + centre) naturally become dots or small paths.
    //
    // Hole detection is deferred — the current style renders the
    // skeleton directly and doesn't need holes punched out.

    paths.push({
      vertices: Array.from(vertexFilter(rawPath)),
      holeVertices: [],
      dots: [],
    });
  }

  return { dots, paths };
}
