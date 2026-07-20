// Squarified treemap (Bruls, Huizing, van Wijk). Deterministic: items are
// sorted by descending weight with id as tie-break, and all arithmetic is
// order-fixed, so identical input always yields identical rectangles.

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface TreemapItem {
  key: string;
  weight: number;
  /** Higher values are placed earlier without changing allocated area. */
  priority?: number;
}

export interface PlacedItem {
  key: string;
  rect: Rect;
}

interface Scaled {
  key: string;
  area: number;
  priority: number;
}

function worstAspect(row: Scaled[], side: number): number {
  let sum = 0;
  let min = Infinity;
  let max = 0;
  for (const r of row) {
    sum += r.area;
    if (r.area < min) min = r.area;
    if (r.area > max) max = r.area;
  }
  if (sum === 0 || min === 0) return Infinity;
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

/** Lay one row along the shorter side of the free rect; return remaining rect. */
function layoutRow(row: Scaled[], free: Rect, out: PlacedItem[]): Rect {
  let sum = 0;
  for (const r of row) sum += r.area;
  if (free.w >= free.d) {
    // Vertical strip on the left edge.
    const w = free.d > 0 ? sum / free.d : 0;
    let z = free.z;
    for (const r of row) {
      const d = w > 0 ? r.area / w : 0;
      out.push({ key: r.key, rect: { x: free.x, z, w, d } });
      z += d;
    }
    return { x: free.x + w, z: free.z, w: free.w - w, d: free.d };
  }
  // Horizontal strip on the top edge.
  const d = free.w > 0 ? sum / free.w : 0;
  let x = free.x;
  for (const r of row) {
    const w = d > 0 ? r.area / d : 0;
    out.push({ key: r.key, rect: { x, z: free.z, w, d } });
    x += w;
  }
  return { x: free.x, z: free.z + d, w: free.w, d: free.d - d };
}

export function squarify(items: TreemapItem[], rect: Rect): PlacedItem[] {
  const total = items.reduce((s, i) => s + i.weight, 0);
  const area = rect.w * rect.d;
  if (items.length === 0 || total <= 0 || area <= 0) return [];

  const scaled: Scaled[] = items
    .slice()
    .sort(
      (a, b) =>
        (b.priority ?? 0) - (a.priority ?? 0) ||
        b.weight - a.weight ||
        (a.key < b.key ? -1 : 1),
    )
    .map((i) => ({ key: i.key, area: (i.weight / total) * area, priority: i.priority ?? 0 }));

  const out: PlacedItem[] = [];
  let free: Rect = { ...rect };
  let row: Scaled[] = [];

  for (const item of scaled) {
    const side = Math.min(free.w, free.d);
    if (row.length > 0 && worstAspect([...row, item], side) > worstAspect(row, side)) {
      free = layoutRow(row, free, out);
      row = [item];
    } else {
      row.push(item);
    }
  }
  if (row.length > 0) layoutRow(row, free, out);
  return out;
}
