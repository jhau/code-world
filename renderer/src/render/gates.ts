// City gates: temporal flows are values that leave the system and re-enter
// later. The re-entry point (e.g. an auth middleware deserializing JWTs) is
// customs — it renders as a real gate in the city wall. Issued permits travel
// out through the gate to a camp beyond the wall (the client world) and come
// back through the gate to be checked. Pure geometry derivation; rendering
// lives in connections.ts / world.ts.

import type { Entity, WorldIR } from "../ir/types";
import type { WorldLayout } from "../layout/layout";
import type { Point2 } from "../layout/streets";

/** Wall geometry constants, shared by the wall builder and gate placement. */
export const WALL = { margin: 1.2, thickness: 0.3, height: 0.9 };

export type GateSide = "north" | "south" | "west" | "east";

export interface CityGate {
  /** The customs entity: receiver of temporal flows (e.g. authMiddleware). */
  entity: Entity;
  /** The datashape serialized through this gate (the permit's contract). */
  permitShape: Entity | undefined;
  side: GateSide;
  /** Center of the opening, on the wall line. */
  at: Point2;
  inside: Point2;
  outside: Point2;
  /** The client camp beyond the wall where issued permits live. */
  camp: Point2;
  /** Half-width of the wall opening along the wall direction. */
  halfGap: number;
}

/** Any hole in the wall: customs gates and unguarded posterns alike. */
export interface WallOpening {
  side: GateSide;
  at: Point2;
  halfGap: number;
}

/**
 * An unguarded exit chute near a permit issuer. Responses leave the system
 * wherever they were issued and nothing inspects them on the way out — so
 * every issuer gets its own humble postern, while re-entry funnels through
 * the one customs gate.
 */
export interface Postern extends WallOpening {
  /** The issuing entity (e.g. loginUser) whose responses exit here. */
  entity: Entity;
  inside: Point2;
  outside: Point2;
}

const HALF_GAP = 0.55;
const POSTERN_HALF_GAP = 0.28;
const IN_OUT = 0.9;
const CAMP_DIST = 3.4;

export function deriveGates(ir: WorldIR, layout: WorldLayout): CityGate[] {
  const nodeById = new Map(layout.nodes.map((n) => [n.entity.id, n]));
  const entityById = new Map(ir.entities.map((e) => [e.id, e]));

  // One gate per distinct temporal-flow receiver, first shape wins as permit.
  const targets = new Map<string, string | undefined>();
  for (const rel of ir.relations) {
    if (rel.type !== "flows-into" || rel.attrs.mode !== "temporal") continue;
    if (!nodeById.has(rel.to) || !entityById.has(rel.to)) continue;
    if (!targets.has(rel.to)) {
      targets.set(rel.to, typeof rel.attrs.shape === "string" ? rel.attrs.shape : undefined);
    }
  }

  const b = layout.bounds;
  const x0 = b.x - WALL.margin;
  const x1 = b.x + b.w + WALL.margin;
  const z0 = b.z - WALL.margin;
  const z1 = b.z + b.d + WALL.margin;
  const clampAlong = (v: number, lo: number, hi: number) =>
    Math.max(lo + 2, Math.min(hi - 2, v));

  const gates: CityGate[] = [];
  for (const [id, shapeId] of [...targets.entries()].sort((a, c) => (a[0] < c[0] ? -1 : 1))) {
    const node = nodeById.get(id)!;
    const cx = node.rect.x + node.rect.w / 2;
    const cz = node.rect.z + node.rect.d / 2;
    // Gate goes in the wall side nearest the customs building.
    const candidates: Array<{ d: number; side: GateSide }> = [
      { d: cz - z0, side: "north" },
      { d: z1 - cz, side: "south" },
      { d: cx - x0, side: "west" },
      { d: x1 - cx, side: "east" },
    ];
    candidates.sort((p, q) => p.d - q.d || (p.side < q.side ? -1 : 1));
    const side = candidates[0]!.side;
    let at: Point2;
    let normal: Point2;
    if (side === "north") {
      at = { x: clampAlong(cx, x0, x1), z: z0 };
      normal = { x: 0, z: -1 };
    } else if (side === "south") {
      at = { x: clampAlong(cx, x0, x1), z: z1 };
      normal = { x: 0, z: 1 };
    } else if (side === "west") {
      at = { x: x0, z: clampAlong(cz, z0, z1) };
      normal = { x: -1, z: 0 };
    } else {
      at = { x: x1, z: clampAlong(cz, z0, z1) };
      normal = { x: 1, z: 0 };
    }
    gates.push({
      entity: entityById.get(id)!,
      permitShape: shapeId !== undefined ? entityById.get(shapeId) : undefined,
      side,
      at,
      inside: { x: at.x - normal.x * IN_OUT, z: at.z - normal.z * IN_OUT },
      outside: { x: at.x + normal.x * IN_OUT, z: at.z + normal.z * IN_OUT },
      camp: { x: at.x + normal.x * CAMP_DIST, z: at.z + normal.z * CAMP_DIST },
      halfGap: HALF_GAP,
    });
  }
  return gates;
}

/** One postern per distinct temporal-flow issuer, on the wall side nearest
 * its building, nudged along the wall until it clears the customs gate and
 * earlier posterns. Deterministic: issuers sorted by id, fixed nudge rule. */
export function derivePosterns(ir: WorldIR, layout: WorldLayout, gates: CityGate[]): Postern[] {
  const nodeById = new Map(layout.nodes.map((n) => [n.entity.id, n]));
  const entityById = new Map(ir.entities.map((e) => [e.id, e]));
  const issuerIds: string[] = [];
  for (const rel of ir.relations) {
    if (rel.type !== "flows-into" || rel.attrs.mode !== "temporal") continue;
    if (!nodeById.has(rel.from) || !entityById.has(rel.from)) continue;
    if (!issuerIds.includes(rel.from)) issuerIds.push(rel.from);
  }
  issuerIds.sort((a, c) => (a < c ? -1 : 1));

  const b = layout.bounds;
  const x0 = b.x - WALL.margin;
  const x1 = b.x + b.w + WALL.margin;
  const z0 = b.z - WALL.margin;
  const z1 = b.z + b.d + WALL.margin;
  const clampAlong = (v: number, lo: number, hi: number) =>
    Math.max(lo + 2, Math.min(hi - 2, v));

  const placed: Array<{ side: GateSide; at: number; halfGap: number }> = gates.map((g) => ({
    side: g.side,
    at: g.side === "north" || g.side === "south" ? g.at.x : g.at.z,
    halfGap: g.halfGap,
  }));

  const posterns: Postern[] = [];
  for (const id of issuerIds) {
    const node = nodeById.get(id)!;
    const cx = node.rect.x + node.rect.w / 2;
    const cz = node.rect.z + node.rect.d / 2;
    const candidates: Array<{ d: number; side: GateSide }> = [
      { d: cz - z0, side: "north" },
      { d: z1 - cz, side: "south" },
      { d: cx - x0, side: "west" },
      { d: x1 - cx, side: "east" },
    ];
    candidates.sort((p, q) => p.d - q.d || (p.side < q.side ? -1 : 1));
    const side = candidates[0]!.side;
    const alongX = side === "north" || side === "south";
    const lo = alongX ? x0 : z0;
    const hi = alongX ? x1 : z1;
    let coord = clampAlong(alongX ? cx : cz, lo, hi);
    for (let iter = 0; iter < 8; iter++) {
      const conflict = placed.find(
        (p) =>
          p.side === side &&
          Math.abs(p.at - coord) < p.halfGap + POSTERN_HALF_GAP + 0.25,
      );
      if (!conflict) break;
      const dir = coord >= conflict.at ? 1 : -1;
      coord = clampAlong(
        conflict.at + dir * (conflict.halfGap + POSTERN_HALF_GAP + 0.3),
        lo,
        hi,
      );
    }
    placed.push({ side, at: coord, halfGap: POSTERN_HALF_GAP });

    let at: Point2;
    let normal: Point2;
    if (side === "north") {
      at = { x: coord, z: z0 };
      normal = { x: 0, z: -1 };
    } else if (side === "south") {
      at = { x: coord, z: z1 };
      normal = { x: 0, z: 1 };
    } else if (side === "west") {
      at = { x: x0, z: coord };
      normal = { x: -1, z: 0 };
    } else {
      at = { x: x1, z: coord };
      normal = { x: 1, z: 0 };
    }
    posterns.push({
      entity: entityById.get(id)!,
      side,
      at,
      inside: { x: at.x - normal.x * IN_OUT, z: at.z - normal.z * IN_OUT },
      outside: { x: at.x + normal.x * IN_OUT, z: at.z + normal.z * IN_OUT },
      halfGap: POSTERN_HALF_GAP,
    });
  }
  return posterns;
}
