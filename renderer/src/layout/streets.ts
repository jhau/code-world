// Street routing: axis-aligned road paths through the gaps between
// buildings. The city ground is rasterized into a walkable grid (buildings
// and external markers are obstacles, inflated so a road ribbon never
// overlaps a wall), and roads are found with A* restricted to 4-directional
// movement plus a turn penalty — long straight runs through open streets.
// Everything here is deterministic: fixed iteration orders, deterministic
// heap tie-breaks, no randomness. Same layout → same streets.

import type { WorldLayout } from "./layout";

export interface Point2 {
  x: number;
  z: number;
}

export interface StreetGrid {
  cell: number;
  x0: number;
  z0: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

const CELL = 0.2;
/** Obstacle inflation: road half-width plus clearance off building walls. */
const OBSTACLE_MARGIN = 0.24;
const STEP_COST = 10;
const TURN_COST = 40;

export function buildStreetGrid(
  layout: WorldLayout,
  suppressed: ReadonlySet<string> = new Set(),
): StreetGrid {
  let minX = layout.bounds.x;
  let minZ = layout.bounds.z;
  let maxX = layout.bounds.x + layout.bounds.w;
  let maxZ = layout.bounds.z + layout.bounds.d;
  for (const p of layout.externals) {
    minX = Math.min(minX, p.x - 2);
    maxX = Math.max(maxX, p.x + 2);
    minZ = Math.min(minZ, p.z - 2);
    maxZ = Math.max(maxZ, p.z + 2);
  }
  const x0 = minX - 1;
  const z0 = minZ - 1;
  const cols = Math.ceil((maxX + 1 - x0) / CELL);
  const rows = Math.ceil((maxZ + 1 - z0) / CELL);
  const blocked = new Uint8Array(cols * rows);

  const block = (rx: number, rz: number, rw: number, rd: number) => {
    const c0 = Math.max(0, Math.floor((rx - OBSTACLE_MARGIN - x0) / CELL));
    const c1 = Math.min(cols - 1, Math.floor((rx + rw + OBSTACLE_MARGIN - x0) / CELL));
    const r0 = Math.max(0, Math.floor((rz - OBSTACLE_MARGIN - z0) / CELL));
    const r1 = Math.min(rows - 1, Math.floor((rz + rd + OBSTACLE_MARGIN - z0) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) blocked[r * cols + c] = 1;
    }
  };

  // Buildings block streets (rooms share their class building's footprint).
  // Suppressed entities render no building, so their ground stays walkable.
  for (const n of layout.nodes) {
    if (n.role === "building" && !suppressed.has(n.entity.id)) {
      block(n.rect.x, n.rect.z, n.rect.w, n.rect.d);
    }
  }
  for (const p of layout.externals) {
    block(p.x - p.size / 2, p.z - p.size / 2, p.size, p.size);
  }
  return { cell: CELL, x0, z0, cols, rows, blocked };
}

function nearestWalkable(grid: StreetGrid, col: number, row: number): number | null {
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
  col = clamp(col, grid.cols - 1);
  row = clamp(row, grid.rows - 1);
  if (!grid.blocked[row * grid.cols + col]) return row * grid.cols + col;
  for (let radius = 1; radius <= 60; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) continue;
        if (!grid.blocked[r * grid.cols + c]) return r * grid.cols + c;
      }
    }
  }
  return null;
}

interface HeapItem {
  f: number;
  g: number;
  state: number;
}

/** Binary min-heap with fully deterministic ordering (f, then g, then state). */
class MinHeap {
  private a: HeapItem[] = [];

  get size(): number {
    return this.a.length;
  }

  private less(i: number, j: number): boolean {
    const x = this.a[i]!;
    const y = this.a[j]!;
    return x.f !== y.f ? x.f < y.f : x.g !== y.g ? x.g < y.g : x.state < y.state;
  }

  private swap(i: number, j: number): void {
    const t = this.a[i]!;
    this.a[i] = this.a[j]!;
    this.a[j] = t;
  }

  push(item: HeapItem): void {
    this.a.push(item);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): HeapItem | undefined {
    const n = this.a.length;
    if (n === 0) return undefined;
    const top = this.a[0]!;
    const last = this.a.pop()!;
    if (n > 1) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.a.length && this.less(l, m)) m = l;
        if (r < this.a.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

// Direction order is part of determinism: +x, -x, +z, -z.
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Axis-aligned street path between two world points. Returns corner points
 * (world coordinates, collinear cells collapsed), or null when no route
 * exists. Endpoints snap to the nearest walkable cell, which lands the road
 * beside the building it serves — its doorstep, not under it.
 */
export function routeStreet(grid: StreetGrid, from: Point2, to: Point2): Point2[] | null {
  const toCol = (x: number) => Math.floor((x - grid.x0) / grid.cell);
  const toRow = (z: number) => Math.floor((z - grid.z0) / grid.cell);
  const startCell = nearestWalkable(grid, toCol(from.x), toRow(from.z));
  const goalCell = nearestWalkable(grid, toCol(to.x), toRow(to.z));
  if (startCell === null || goalCell === null) return null;
  if (startCell === goalCell) return null;

  const goalCol = goalCell % grid.cols;
  const goalRow = Math.floor(goalCell / grid.cols);
  const h = (cell: number) =>
    STEP_COST *
    (Math.abs((cell % grid.cols) - goalCol) + Math.abs(Math.floor(cell / grid.cols) - goalRow));

  const nStates = grid.cols * grid.rows * 4;
  const best = new Float64Array(nStates).fill(Infinity);
  const parent = new Int32Array(nStates).fill(-1);
  const heap = new MinHeap();
  for (let d = 0; d < 4; d++) {
    const s = startCell * 4 + d;
    best[s] = 0;
    heap.push({ f: h(startCell), g: 0, state: s });
  }

  let goalState = -1;
  while (heap.size > 0) {
    const cur = heap.pop()!;
    const { state, g } = cur;
    if (g > best[state]!) continue; // stale entry
    const cell = state >> 2;
    if (cell === goalCell) {
      goalState = state;
      break;
    }
    const dir = state & 3;
    const col = cell % grid.cols;
    const row = Math.floor(cell / grid.cols);
    for (let d = 0; d < 4; d++) {
      const nc = col + DIRS[d]![0];
      const nr = row + DIRS[d]![1];
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      const nCell = nr * grid.cols + nc;
      if (grid.blocked[nCell]) continue;
      const ng = g + STEP_COST + (d === dir ? 0 : TURN_COST);
      const nState = nCell * 4 + d;
      if (ng < best[nState]!) {
        best[nState] = ng;
        parent[nState] = state;
        heap.push({ f: ng + h(nCell), g: ng, state: nState });
      }
    }
  }
  if (goalState === -1) return null;

  // Reconstruct cells, then keep only corners (direction changes).
  const cells: number[] = [];
  for (let s = goalState; s !== -1; s = parent[s]!) {
    const cell = s >> 2;
    if (cells.length === 0 || cells[cells.length - 1] !== cell) cells.push(cell);
  }
  cells.reverse();
  const toWorld = (cell: number): Point2 => ({
    x: grid.x0 + ((cell % grid.cols) + 0.5) * grid.cell,
    z: grid.z0 + (Math.floor(cell / grid.cols) + 0.5) * grid.cell,
  });
  const points: Point2[] = [toWorld(cells[0]!)];
  for (let i = 1; i < cells.length - 1; i++) {
    const a = cells[i - 1]!;
    const b = cells[i]!;
    const c = cells[i + 1]!;
    const straight = c - b === b - a; // same stride → collinear
    if (!straight) points.push(toWorld(b));
  }
  points.push(toWorld(cells[cells.length - 1]!));
  return points;
}
