// Deterministic layout from the containment tree — the ONLY input to spatial
// position, per the spec. Graph relations never move geometry.
//
// Model: repo/containers → districts (thin stacked slabs), units → plots,
// callables/datashapes/values → buildings (height from magnitudes), methods
// inside a class → rooms stacked on the class building. Externals sit on a
// ring beyond the city wall, grouped by ecosystem.

import { getNorm, type Entity, type WorldIR } from "../ir/types";
import { squarify, type Rect } from "./treemap";

export type NodeRole = "district" | "plot" | "building" | "room";

export interface LayoutNode {
  entity: Entity;
  role: NodeRole;
  rect: Rect;
  /** World y of the node's base. */
  y: number;
  /** Extent above the base (slab thickness or building height). */
  height: number;
  depth: number;
  children: LayoutNode[];
}

export interface ExternalPlacement {
  entity: Entity;
  x: number;
  z: number;
  size: number;
  height: number;
}

export interface WorldLayout {
  root: LayoutNode;
  /** Flat list of every in-city node, root included. */
  nodes: LayoutNode[];
  externals: ExternalPlacement[];
  /** City bounds (the repo rect); the wall follows this. */
  bounds: Rect;
}

// World-unit constants. Tuning these changes scale, not determinism.
const LEAF_AREA = 4;
const EMPTY_PLOT_AREA = LEAF_AREA;
/** Fraction of a parent's footprint its children may occupy. */
const FILL: Record<string, number> = {
  repo: 0.55,
  container: 0.55,
  unit: 0.5,
  datashape: 0.45,
};
const SLAB = { repo: 0.1, container: 0.1, unit: 0.16 } as const;

function buildingNorm(e: Entity): number {
  return Math.max(getNorm(e, "size") ?? 0, getNorm(e, "complexity") ?? 0);
}

function leafWeight(e: Entity): number {
  return 1 + buildingNorm(e) + 0.5 * (getNorm(e, "fan_in") ?? 0);
}

function buildingHeight(e: Entity): number {
  return 0.8 + 4.5 * buildingNorm(e);
}

function roleOf(e: Entity): NodeRole {
  if (e.kind === "repo" || e.kind === "container") return "district";
  if (e.kind === "unit") return "plot";
  return "building";
}

interface TreeNode {
  entity: Entity;
  children: TreeNode[];
  area: number;
}

function computeArea(node: TreeNode): number {
  const kind = node.entity.kind;
  if (node.children.length === 0) {
    node.area =
      kind === "repo" || kind === "container" || kind === "unit"
        ? EMPTY_PLOT_AREA
        : leafWeight(node.entity) * LEAF_AREA;
    return node.area;
  }
  let childSum = 0;
  for (const c of node.children) childSum += computeArea(c);
  node.area = childSum / (FILL[kind] ?? 0.5);
  return node.area;
}

/** Centered sub-rect whose area is `fill` of the parent's, same aspect. */
function innerRect(rect: Rect, fill: number): Rect {
  const s = Math.sqrt(fill);
  const w = rect.w * s;
  const d = rect.d * s;
  return { x: rect.x + (rect.w - w) / 2, z: rect.z + (rect.d - d) / 2, w, d };
}

/**
 * Squarify tiles the parent completely, so a tiny sibling of a huge one gets
 * a long sliver cell. A city needs no perfect tiling: give small siblings a
 * minimum cell weight so their cell is wide enough to be usable…
 */
const MIN_CELL_FRACTION = 0.18;
function cellWeight(area: number, maxSiblingArea: number): number {
  return Math.max(area, maxSiblingArea * MIN_CELL_FRACTION);
}

/**
 * …then shrink the node inside its (possibly oversized) cell back to its true
 * content area with a capped aspect ratio, centered. Leftover cell ground is
 * simply open plaza. Containment is preserved: fitted rect ⊆ cell.
 */
const MAX_ASPECT = 2.5;
function fitToCell(cell: Rect, contentArea: number): Rect {
  const target = Math.sqrt(Math.max(contentArea, 1e-9));
  let w = Math.min(cell.w, target * MAX_ASPECT);
  let d = Math.min(cell.d, target * MAX_ASPECT);
  // Trim surplus area by pulling the longer side toward the exact content
  // area (never below the shorter side).
  if (w * d > contentArea) {
    if (w >= d) w = Math.min(w, Math.max(d, contentArea / d));
    else d = Math.min(d, Math.max(w, contentArea / w));
  }
  return { x: cell.x + (cell.w - w) / 2, z: cell.z + (cell.d - d) / 2, w, d };
}

function place(
  node: TreeNode,
  rect: Rect,
  baseY: number,
  depth: number,
  nodes: LayoutNode[],
): LayoutNode {
  const e = node.entity;
  const role = roleOf(e);
  const height =
    role === "district"
      ? e.kind === "repo"
        ? SLAB.repo
        : SLAB.container
      : role === "plot"
        ? SLAB.unit
        : buildingHeight(e);

  const laid: LayoutNode = { entity: e, role, rect, y: baseY, height, depth, children: [] };
  nodes.push(laid);

  if (node.children.length > 0) {
    const fill = FILL[e.kind] ?? 0.5;
    const inner = innerRect(rect, fill);
    const maxChildArea = Math.max(...node.children.map((c) => c.area));
    const placed = squarify(
      node.children.map((c) => ({ key: c.entity.id, weight: cellWeight(c.area, maxChildArea) })),
      inner,
    );
    const byKey = new Map(node.children.map((c) => [c.entity.id, c]));
    // Children stack on the parent's top: plots on district slabs, buildings
    // on plot slabs, and class methods on the class building's roof as rooms.
    const childBase = baseY + height;
    for (const p of placed) {
      const child = byKey.get(p.key);
      if (!child) continue;
      const childNode = place(child, fitToCell(p.rect, child.area), childBase, depth + 1, nodes);
      if (role === "building") {
        childNode.role = "room";
        childNode.height = 0.3 + 1.5 * buildingNorm(childNode.entity);
      }
      laid.children.push(childNode);
    }
  }
  return laid;
}

function placeExternals(externals: Entity[], bounds: Rect): ExternalPlacement[] {
  if (externals.length === 0) return [];
  const sorted = externals
    .slice()
    .sort(
      (a, b) =>
        (a.ecosystem ?? "").localeCompare(b.ecosystem ?? "") ||
        (a.id < b.id ? -1 : 1),
    );
  const cx = bounds.x + bounds.w / 2;
  const cz = bounds.z + bounds.d / 2;
  const radius = Math.hypot(bounds.w, bounds.d) / 2 + 6;
  // One slot per external plus a gap slot at each ecosystem boundary.
  let slots = sorted.length;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.ecosystem !== sorted[i - 1]!.ecosystem) slots += 2;
  }
  const step = (2 * Math.PI) / slots;
  const placements: ExternalPlacement[] = [];
  let slot = 0;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!;
    if (i > 0 && e.ecosystem !== sorted[i - 1]!.ecosystem) slot += 2;
    const angle = slot * step;
    placements.push({
      entity: e,
      x: cx + radius * Math.cos(angle),
      z: cz + radius * Math.sin(angle),
      size: 1.6,
      height: 0.35 + 1.2 * (getNorm(e, "fan_in") ?? 0),
    });
    slot += 1;
  }
  return placements;
}

export function computeLayout(ir: WorldIR): WorldLayout {
  const treeNodes = new Map<string, TreeNode>();
  for (const e of ir.entities) {
    if (e.kind === "external") continue;
    treeNodes.set(e.id, { entity: e, children: [], area: 0 });
  }
  let root: TreeNode | undefined;
  for (const node of treeNodes.values()) {
    const parentId = node.entity.contains_parent;
    if (parentId === undefined) {
      if (node.entity.kind === "repo") root = node;
      continue;
    }
    treeNodes.get(parentId)?.children.push(node);
  }
  if (!root) throw new Error("layout: no repo root entity");
  // Deterministic child order before any area math (squarify re-sorts by
  // weight, but ties fall back to id, so input order must also be stable).
  for (const node of treeNodes.values()) {
    node.children.sort((a, b) => (a.entity.id < b.entity.id ? -1 : 1));
  }

  computeArea(root);
  const side = Math.sqrt(root.area);
  const bounds: Rect = { x: -side / 2, z: -side / 2, w: side, d: side };
  const nodes: LayoutNode[] = [];
  const laidRoot = place(root, bounds, 0, 0, nodes);

  const externals = placeExternals(
    ir.entities.filter((e) => e.kind === "external"),
    bounds,
  );
  return { root: laidRoot, nodes, externals, bounds };
}
