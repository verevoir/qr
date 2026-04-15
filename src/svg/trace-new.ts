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

type Path = Vertex[];
type Trace = {
  dots: Vertex[];
  paths: Path[];
};

function findDirection(from: Vertex, to: Vertex): Vertex {
  return { x: to.x - from.x, y: to.y - from.y };
}

export function* vertexFilter(
  vertices: Iterable<Vertex>,
): Generator<Vertex> {
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
 * Mark every cell of the component reachable from any `path` vertex as
 * visited, via 4-connected BFS through filled cells. This guarantees
 * interior cells the walker skipped over (e.g. the centre of a 5×5 +
 * if the walker were to stop short of it) are marked, so they won't be
 * picked up as separate dots on the next scanline iteration.
 *
 * Correctness: every cell in the connected component is reachable from
 * any other cell in it by a 4-connected path through filled cells (by
 * definition of "4-connected component"). Path vertices are cells in
 * the component, so seeding BFS with them reaches every component cell.
 *
 * Hole detection is deferred — the caller's plan is to flood-fill the
 * background from outside the bounding box in a second pass; anything
 * unreachable there is enclosed and recurses into the same tracer.
 */
function floodFill(path: Path, cells: Uint8Array[], grid: VisitedGrid): void {
  const size = grid.size;
  const queue: Vertex[] = path.slice();
  while (queue.length > 0) {
    const { x, y } = queue.pop() as Vertex;
    const axisNeighbours: Vertex[] = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ];
    for (const next of axisNeighbours) {
      if (next.x < 0 || next.x >= size || next.y < 0 || next.y >= size)
        continue;
      if (cells[next.y][next.x] !== 1) continue;
      if (grid.visited(next.x, next.y)) continue;
      grid.visit(next.x, next.y);
      queue.push(next);
    }
  }
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
 */
function walk(
  cell: Vertex,
  start: Vertex,
  cells: Uint8Array[],
  grid: VisitedGrid,
  size: number,
  path: Vertex[],
): boolean {
  for (const neighbor of Neighbors8) {
    const combined = neighborVertex(cell, neighbor, size);
    if (!combined) continue;
    if (cells[combined.y][combined.x] !== 1) continue;
    if (combined.x === start.x && combined.y === start.y) return true;
    if (grid.visited(combined.x, combined.y)) continue;

    grid.visit(combined.x, combined.y);
    path.push(combined);
    const closed = walk(combined, start, cells, grid, size, path);
    if (closed) return true; //   close path early; caller re-adds start once at top level
    path.push(cell); //   re-record on return — this is the junction's "next arm" checkpoint
  }
  return false;
}

export function trace(cells: Uint8Array[]): Trace {
  const size = cells.length;
  const grid = new VisitedGrid(size);
  const result: Trace = {
    dots: [],
    paths: [],
  };

  for (const start of grid.unvisited()) {
    grid.visit(start.x, start.y);
    if (cells[start.y][start.x] === 0) continue;

    const path: Vertex[] = [start];
    walk(start, start, cells, grid, size, path);

    if (path.length === 1) {
      result.dots.push(path[0]);
    } else {
      path.push({ x: start.x, y: start.y }); // close the loop
      floodFill(path, cells, grid);
      result.paths.push(path);
    }
  }
  return {
    dots: result.dots,
    paths: result.paths.map((p) => Array.from(vertexFilter(p))),
  };
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
 *
 * Exposes:
 * - `visit(x, y)` — mark a cell as visited
 * - `visited(x, y)` — check if a cell has been visited
 * - `unvisited()` — generator yielding all unvisited `{x, y}`
 *   coordinates in scanline order (top-to-bottom, left-to-right)
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
