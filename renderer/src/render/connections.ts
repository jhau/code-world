// Graph relations render as connections and never move geometry. Roads (the
// import graph) drape over the ground, store accesses and dataflow render as
// arcs — the substrate of the traced-path feature — and guards render not as
// edges at all but as sentry avatars posted at the guarded building's
// entrance (framework-mediated control flow reads as a checkpoint, not a
// call).

import * as THREE from "three";
import type { Entity, Relation, WorldIR } from "../ir/types";
import type { LayoutNode, WorldLayout } from "../layout/layout";
import { buildStreetGrid, routeStreet, type Point2 } from "../layout/streets";
import type { CityGate, Postern } from "./gates";
import { routeKeyFor, type Theme } from "./theme";

export interface Route {
  mesh: THREE.Mesh;
  relation: Relation;
  /** For flows-into: the datashape moving along this route. */
  shape?: string;
  mode?: string;
  /** Extra meshes styled with the route (guard gate markers). */
  markers: THREE.Mesh[];
}

export interface BuiltConnections {
  group: THREE.Group;
  routes: Route[];
  /** Guard doors, carts, crates etc. that respond to click-to-inspect. */
  pickables: THREE.Mesh[];
  /** Relations with endpoints or types the renderer could not place. */
  skipped: number;
  /** Advance time-based visuals (delivery carts). Call once per frame. */
  animate: (elapsedSeconds: number) => void;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The walkable ground of the city: repo slab, district slabs, and unit plots
 * (buildings excluded — roads end at a building's base, they don't climb it).
 * Roads drape over this field, stepping up and down district terraces.
 */
interface HeightField {
  rects: Array<{ x: number; z: number; w: number; d: number; top: number }>;
}

function buildHeightField(layout: WorldLayout): HeightField {
  const rects = layout.nodes
    .filter((n) => n.role === "district" || n.role === "plot")
    .map((n) => ({ ...n.rect, top: n.y + n.height }));
  return { rects };
}

function groundAt(hf: HeightField, x: number, z: number): number {
  let top = 0;
  for (const r of hf.rects) {
    if (x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d && r.top > top) {
      top = r.top;
    }
  }
  return top;
}

const ROAD_SAMPLE_STEP = 0.15;

interface RoadSample {
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** Widening factor at mitred corners so the strip keeps its width. */
  scale: number;
}

/** Sample a polyline every ROAD_SAMPLE_STEP, with mitred normals at corners. */
function sampleRoadPath(path: Point2[]): RoadSample[] {
  const dirs: Point2[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1]!.x - path[i]!.x;
    const dz = path[i + 1]!.z - path[i]!.z;
    const len = Math.hypot(dx, dz) || 1;
    dirs.push({ x: dx / len, z: dz / len });
  }
  const samples: RoadSample[] = [];
  for (let i = 0; i < path.length; i++) {
    const dIn = dirs[Math.max(0, i - 1)]!;
    const dOut = dirs[Math.min(dirs.length - 1, i)]!;
    let mx = dIn.x + dOut.x;
    let mz = dIn.z + dOut.z;
    const mLen = Math.hypot(mx, mz);
    if (mLen < 1e-6) {
      mx = dIn.x;
      mz = dIn.z;
    } else {
      mx /= mLen;
      mz /= mLen;
    }
    const dot = Math.max(-1, Math.min(1, dIn.x * dOut.x + dIn.z * dOut.z));
    const scale = Math.min(2, 1 / Math.max(0.45, Math.sqrt((1 + dot) / 2)));
    samples.push({ x: path[i]!.x, z: path[i]!.z, nx: -mz, nz: mx, scale });
    if (i < path.length - 1) {
      const seg = dirs[i]!;
      const len = Math.hypot(path[i + 1]!.x - path[i]!.x, path[i + 1]!.z - path[i]!.z);
      const steps = Math.ceil(len / ROAD_SAMPLE_STEP);
      for (let j = 1; j < steps; j++) {
        const t = (j / steps) * len;
        samples.push({
          x: path[i]!.x + seg.x * t,
          z: path[i]!.z + seg.z * t,
          nx: -seg.z,
          nz: seg.x,
          scale: 1,
        });
      }
    }
  }
  return samples;
}

/** A flat ribbon along `path`, following the ground height under each sample. */
function roadMesh(
  path: Point2[],
  halfWidth: number,
  color: number,
  opacity: number,
  hf: HeightField,
  lift: number,
): THREE.Mesh {
  const samples = sampleRoadPath(path);
  const positions = new Float32Array(samples.length * 2 * 3);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const y = groundAt(hf, s.x, s.z) + lift;
    const hw = halfWidth * s.scale;
    positions.set([s.x + s.nx * hw, y, s.z + s.nz * hw], i * 6);
    positions.set([s.x - s.nx * hw, y, s.z - s.nz * hw], i * 6 + 3);
  }
  const indices: number[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    // Roads sit a hair above coplanar slab tops; bias them forward.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.baseOpacity = opacity;
  return mesh;
}

// ── Delivery logistics: accesses render as warehouse traffic, not arcs. ──
// A data store is a warehouse (crates at its dock). Every `accesses` edge is
// a street-routed ground lane with animated carts: read carts haul a crate
// FROM the warehouse to the reader, write carts haul one TO the warehouse.
// Direction of travel — not an arrowhead — is what tells you read from write.

interface CartTrack {
  points: Point2[];
  /** Cumulative length at each point; last entry is the total. */
  cum: number[];
  total: number;
}

function trackFrom(points: Point2[]): CartTrack {
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dz = points[i]!.z - points[i - 1]!.z;
    cum.push(cum[i - 1]! + Math.hypot(dx, dz));
  }
  return { points, cum, total: cum[cum.length - 1]! };
}

function trackPosAt(track: CartTrack, s: number): { x: number; z: number; angle: number } {
  const { points, cum } = track;
  let i = 1;
  while (i < cum.length - 1 && cum[i]! < s) i++;
  const segLen = cum[i]! - cum[i - 1]! || 1;
  const t = (s - cum[i - 1]!) / segLen;
  const a = points[i - 1]!;
  const b = points[i]!;
  const x = a.x + (b.x - a.x) * t;
  const z = a.z + (b.z - a.z) * t;
  return { x, z, angle: Math.atan2(b.x - a.x, b.z - a.z) };
}

interface Cart {
  group: THREE.Group;
  track: CartTrack;
  offset: number;
  lift: number;
  speed: number;
}

const CART_SPEED = 0.85;
const COURIER_SPEED = 1.2;

/** A little delivery cart: dark chassis with a colored crate of goods. */
function cartMesh(crateColor: number, theme: Theme, owner: Entity): {
  group: THREE.Group;
  meshes: THREE.Mesh[];
} {
  const makeMat = (color: number, emissiveScale: number) =>
    new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      emissive: new THREE.Color(color).multiplyScalar(emissiveScale),
    });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.055, 0.2), makeMat(theme.warehouse.cartBody, 0.1));
  body.position.y = 0.03;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), makeMat(crateColor, 0.25));
  crate.position.y = 0.11;
  const group = new THREE.Group();
  group.add(body, crate);
  for (const m of [body, crate]) {
    m.userData.baseOpacity = 1;
    m.userData.entity = owner;
  }
  return { group, meshes: [body, crate] };
}

/** A permit in transit: a floating stamped card (the serialized value). */
function permitCourier(theme: Theme, owner: Entity): { group: THREE.Group; meshes: THREE.Mesh[] } {
  const makeMat = (color: number, emissiveScale: number) =>
    new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      emissive: new THREE.Color(color).multiplyScalar(emissiveScale),
    });
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.2), makeMat(theme.permit.card, 0.4));
  const seal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.025, 8),
    makeMat(theme.permit.seal, 0.3),
  );
  seal.position.set(-0.03, 0.02, 0.05);
  const group = new THREE.Group();
  group.add(card, seal);
  for (const m of [card, seal]) {
    m.userData.baseOpacity = 1;
    m.userData.entity = owner;
  }
  return { group, meshes: [card, seal] };
}

/** Gate towers and lintel straddling the wall opening; customs on duty. */
function gateStructure(gate: CityGate, theme: Theme): THREE.Mesh[] {
  const alongX = gate.side === "north" || gate.side === "south";
  const towerOff = gate.halfGap + 0.22;
  const makeMat = (color: number) =>
    new THREE.MeshLambertMaterial({ color, transparent: true });
  const meshes: THREE.Mesh[] = [];
  for (const off of [-towerOff, towerOff]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.35, 0.36), makeMat(theme.gate.tower));
    tower.position.set(
      gate.at.x + (alongX ? off : 0),
      1.35 / 2,
      gate.at.z + (alongX ? 0 : off),
    );
    meshes.push(tower);
  }
  const span = 2 * towerOff + 0.36;
  const lintel = new THREE.Mesh(
    alongX ? new THREE.BoxGeometry(span, 0.18, 0.3) : new THREE.BoxGeometry(0.3, 0.18, span),
    makeMat(theme.gate.lintel),
  );
  lintel.position.set(gate.at.x, 1.35 + 0.09, gate.at.z);
  meshes.push(lintel);
  for (const m of meshes) {
    m.userData.baseOpacity = 1;
    m.userData.entity = gate.entity;
  }
  return meshes;
}

/** An unguarded exit chute: two low jambs and a plain cap — no towers, no
 * brass, no lock. Responses leave the city here without inspection. */
function posternStructure(postern: Postern, theme: Theme): THREE.Mesh[] {
  const alongX = postern.side === "north" || postern.side === "south";
  const jambOff = postern.halfGap + 0.09;
  const makeMat = () =>
    new THREE.MeshLambertMaterial({ color: theme.postern.frame, transparent: true });
  const meshes: THREE.Mesh[] = [];
  for (const off of [-jambOff, jambOff]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), makeMat());
    jamb.position.set(
      postern.at.x + (alongX ? off : 0),
      0.55 / 2,
      postern.at.z + (alongX ? 0 : off),
    );
    meshes.push(jamb);
  }
  const span = 2 * jambOff + 0.18;
  const cap = new THREE.Mesh(
    alongX ? new THREE.BoxGeometry(span, 0.12, 0.22) : new THREE.BoxGeometry(0.22, 0.12, span),
    makeMat(),
  );
  cap.position.set(postern.at.x, 0.55 + 0.06, postern.at.z);
  meshes.push(cap);
  for (const m of meshes) {
    m.userData.baseOpacity = 1;
    m.userData.entity = postern.entity;
  }
  return meshes;
}

/** The client camp beyond the wall: a tent and a small stack of permits. */
function campStructure(gate: CityGate, theme: Theme): THREE.Mesh[] {
  const owner = gate.permitShape ?? gate.entity;
  const makeMat = (color: number, emissiveScale = 0.12) =>
    new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      emissive: new THREE.Color(color).multiplyScalar(emissiveScale),
    });
  const tent = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.75, 6), makeMat(theme.permit.tent));
  tent.position.set(gate.camp.x, 0.375, gate.camp.z);
  tent.rotation.y = 0.4;
  const meshes: THREE.Mesh[] = [tent];
  for (let i = 0; i < 2; i++) {
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.025, 0.22),
      makeMat(theme.permit.card, 0.3),
    );
    card.position.set(gate.camp.x + 0.62, 0.03 + i * 0.03, gate.camp.z + 0.3 - i * 0.06);
    card.rotation.y = 0.3 + i * 0.5;
    meshes.push(card);
  }
  for (const m of meshes) {
    m.userData.baseOpacity = 1;
    m.userData.entity = owner;
  }
  return meshes;
}

/** Crates stacked at a warehouse dock: two on the ground, one on top. */
function dockCrates(store: LayoutNode, side: DoorSide, theme: Theme, entity: Entity): THREE.Mesh[] {
  const { rect } = store;
  const alongZ = side.axis === "z";
  const wall = alongZ
    ? side.dir === 1
      ? rect.z + rect.d
      : rect.z
    : side.dir === 1
      ? rect.x + rect.w
      : rect.x;
  const out = wall + side.dir * 0.24;
  const cx = rect.x + rect.w / 2;
  const cz = rect.z + rect.d / 2;
  const S = 0.18;
  const spots: Array<[number, number, number]> = [
    [-0.12, S / 2, 0],
    [0.12, S / 2, 0],
    [0, S + S / 2 - 0.02, 0],
  ];
  const mat = () =>
    new THREE.MeshLambertMaterial({ color: theme.warehouse.crate, transparent: true });
  return spots.map(([along, y]) => {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), mat());
    crate.position.set(
      alongZ ? cx + along : out,
      store.y + y,
      alongZ ? out : cz + along,
    );
    crate.rotation.y = 0.15 * (along === 0 ? 1 : -1); // casually stacked, not minted
    crate.userData.baseOpacity = 1;
    crate.userData.entity = entity;
    return crate;
  });
}

function buildAnchors(layout: WorldLayout): Map<string, THREE.Vector3> {
  const anchors = new Map<string, THREE.Vector3>();
  for (const n of layout.nodes) {
    anchors.set(
      n.entity.id,
      new THREE.Vector3(n.rect.x + n.rect.w / 2, n.y + n.height + 0.02, n.rect.z + n.rect.d / 2),
    );
  }
  for (const p of layout.externals) {
    anchors.set(p.entity.id, new THREE.Vector3(p.x, p.height + 0.02, p.z));
  }
  return anchors;
}

function arcMesh(
  from: THREE.Vector3,
  to: THREE.Vector3,
  apex: number,
  radius: number,
  color: number,
  opacity: number,
): THREE.Mesh {
  const mid = from
    .clone()
    .add(to)
    .multiplyScalar(0.5)
    .addScaledVector(UP, apex + Math.max(from.y, to.y) * 0.15);
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const geo = new THREE.TubeGeometry(curve, 24, radius, 6, false);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.baseOpacity = opacity;
  return mesh;
}

/**
 * Guarded entrances render as a locked door: a door panel flush on one wall
 * of the guarded building, with one padlock per guard hanging on it. The
 * door goes on the first side (+z, -z, +x, -x) whose street is not blocked
 * by a neighboring building — deterministic fixed order.
 */
interface DoorSide {
  axis: "x" | "z";
  dir: 1 | -1;
}

function chooseDoorSide(target: LayoutNode, obstacles: LayoutNode[]): DoorSide {
  const { rect } = target;
  const cx = rect.x + rect.w / 2;
  const cz = rect.z + rect.d / 2;
  const probes: Array<{ side: DoorSide; x: number; z: number }> = [
    { side: { axis: "z", dir: 1 }, x: cx, z: rect.z + rect.d + 0.35 },
    { side: { axis: "z", dir: -1 }, x: cx, z: rect.z - 0.35 },
    { side: { axis: "x", dir: 1 }, x: rect.x + rect.w + 0.35, z: cz },
    { side: { axis: "x", dir: -1 }, x: rect.x - 0.35, z: cz },
  ];
  const blocked = (x: number, z: number) =>
    obstacles.some(
      (o) =>
        o !== target &&
        x >= o.rect.x &&
        x <= o.rect.x + o.rect.w &&
        z >= o.rect.z &&
        z <= o.rect.z + o.rect.d,
    );
  return (probes.find((p) => !blocked(p.x, p.z)) ?? probes[0]!).side;
}

const DOOR = { w: 0.34, h: 0.5, t: 0.06 };
const LOCK = { w: 0.11, h: 0.1, t: 0.05, r: 0.045, tube: 0.013, step: 0.17 };

/** Door panel + one padlock (body and shackle) per guard, front to the
 * street. Locks carry their guard entity so clicking a lock inspects the
 * middleware; meshes are returned per guard for route bookkeeping. */
function guardDoorAssembly(
  target: LayoutNode,
  guards: Entity[],
  side: DoorSide,
  theme: Theme,
): { door: THREE.Mesh; locksPerGuard: THREE.Mesh[][] } {
  const { rect } = target;
  const cx = rect.x + rect.w / 2;
  const cz = rect.z + rect.d / 2;
  const alongZ = side.axis === "z";
  // Wall plane coordinate and outward normal.
  const wall = alongZ
    ? side.dir === 1
      ? rect.z + rect.d
      : rect.z
    : side.dir === 1
      ? rect.x + rect.w
      : rect.x;
  const doorH = Math.min(DOOR.h, target.height * 0.75);
  const makeMat = (color: number, emissiveScale: number) =>
    new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      emissive: new THREE.Color(color).multiplyScalar(emissiveScale),
    });

  const doorGeo = alongZ
    ? new THREE.BoxGeometry(DOOR.w, doorH, DOOR.t)
    : new THREE.BoxGeometry(DOOR.t, doorH, DOOR.w);
  const door = new THREE.Mesh(doorGeo, makeMat(theme.guardDoor.panel, 0.1));
  const doorCenterOut = wall + side.dir * (DOOR.t / 2 - 0.01);
  door.position.set(
    alongZ ? cx : doorCenterOut,
    target.y + doorH / 2,
    alongZ ? doorCenterOut : cz,
  );

  const locksPerGuard: THREE.Mesh[][] = guards.map((guard, i) => {
    const lockOut = wall + side.dir * (DOOR.t + LOCK.t / 2);
    const lockY = Math.max(target.y + doorH * 0.62 - i * LOCK.step, target.y + 0.09);
    const bodyGeo = alongZ
      ? new THREE.BoxGeometry(LOCK.w, LOCK.h, LOCK.t)
      : new THREE.BoxGeometry(LOCK.t, LOCK.h, LOCK.w);
    const body = new THREE.Mesh(bodyGeo, makeMat(theme.guardDoor.lock, 0.25));
    body.position.set(alongZ ? cx : lockOut, lockY, alongZ ? lockOut : cz);
    const shackle = new THREE.Mesh(
      new THREE.TorusGeometry(LOCK.r, LOCK.tube, 8, 16, Math.PI),
      makeMat(theme.guardDoor.lock, 0.25),
    );
    shackle.position.set(alongZ ? cx : lockOut, lockY + LOCK.h / 2, alongZ ? lockOut : cz);
    if (!alongZ) shackle.rotation.y = Math.PI / 2;
    for (const m of [body, shackle]) {
      m.userData.baseOpacity = 1;
      m.userData.entity = guard;
    }
    return [body, shackle];
  });

  door.userData.baseOpacity = 1;
  door.userData.entity = guards[0];
  return { door, locksPerGuard };
}

export function buildConnections(
  ir: WorldIR,
  layout: WorldLayout,
  theme: Theme,
  gates: CityGate[],
  posterns: Postern[],
): BuiltConnections {
  const suppressed = new Set(gates.map((g) => g.entity.id));
  const anchors = buildAnchors(layout);
  // Gate entities have no in-city building; their edges anchor at the gate.
  for (const gate of gates) {
    anchors.set(gate.entity.id, new THREE.Vector3(gate.at.x, 1.05, gate.at.z));
  }
  const heightField = buildHeightField(layout);
  const streetGrid = buildStreetGrid(layout, suppressed);
  const nodeById = new Map(layout.nodes.map((n) => [n.entity.id, n]));
  const entityById = new Map(ir.entities.map((e) => [e.id, e]));
  const group = new THREE.Group();
  const routes: Route[] = [];
  const pickables: THREE.Mesh[] = [];
  const carts: Cart[] = [];
  let skipped = 0;
  let roadCount = 0;
  let laneCount = 0;

  // Guards: sentries at the guarded entrance instead of edges.
  const guardsByTarget = new Map<string, Relation[]>();
  for (const rel of ir.relations) {
    if (rel.type !== "guards") continue;
    if (!nodeById.has(rel.to) || !entityById.has(rel.from)) {
      skipped += 1;
      continue;
    }
    const list = guardsByTarget.get(rel.to) ?? [];
    list.push(rel);
    guardsByTarget.set(rel.to, list);
  }
  const obstacles = layout.nodes.filter(
    (n) => (n.role === "building" || n.role === "room") && !suppressed.has(n.entity.id),
  );
  for (const [targetId, rels] of guardsByTarget) {
    rels.sort((a, b) => (a.from < b.from ? -1 : 1));
    const target = nodeById.get(targetId)!;
    const side = chooseDoorSide(target, obstacles);
    const guards = rels.map((rel) => entityById.get(rel.from)!);
    const { door, locksPerGuard } = guardDoorAssembly(target, guards, side, theme);
    group.add(door);
    pickables.push(door);
    rels.forEach((rel, i) => {
      const [body, shackle] = locksPerGuard[i]!;
      for (const m of [body!, shackle!]) {
        group.add(m);
        pickables.push(m);
      }
      // The door dims with the first lock's route during traces.
      routes.push({ mesh: body!, relation: rel, markers: i === 0 ? [shackle!, door] : [shackle!] });
    });
  }

  // Warehouses: every data store gets crates at its dock, accessed or not.
  for (const node of layout.nodes) {
    const e = node.entity;
    if (e.kind !== "value" || !e.roles.includes("data-store")) continue;
    const side = chooseDoorSide(node, obstacles);
    for (const crate of dockCrates(node, side, theme, e)) {
      group.add(crate);
      pickables.push(crate);
    }
  }

  // Accesses: delivery lanes with carts. Read hauls goods from the
  // warehouse to the reader; write hauls goods to the warehouse.
  for (const rel of ir.relations) {
    if (rel.type !== "accesses") continue;
    const mode = typeof rel.attrs.mode === "string" ? rel.attrs.mode : "read";
    const style = theme.routes[routeKeyFor(rel.type, mode)!];
    const handler = anchors.get(rel.from);
    const store = anchors.get(rel.to);
    const handlerEntity = entityById.get(rel.from);
    if (!style || !handler || !store || !handlerEntity) {
      skipped += 1;
      continue;
    }
    const start: Point2 =
      mode === "write" ? { x: handler.x, z: handler.z } : { x: store.x, z: store.z };
    const end: Point2 =
      mode === "write" ? { x: store.x, z: store.z } : { x: handler.x, z: handler.z };
    const path = routeStreet(streetGrid, start, end) ?? [start, end];
    const lift = 0.06 + (laneCount++ % 4) * 0.004;
    const lane = roadMesh(path, style.radius, style.color, style.opacity, heightField, lift);
    group.add(lane);
    const route: Route = { mesh: lane, relation: rel, mode, markers: [] };
    const track = trackFrom(path);
    if (track.total > 0.6) {
      const cartCount = Math.max(1, Math.min(3, Math.floor(track.total / 5)));
      for (let i = 0; i < cartCount; i++) {
        const { group: cartGroup, meshes } = cartMesh(style.color, theme, handlerEntity);
        group.add(cartGroup);
        carts.push({
          group: cartGroup,
          track,
          offset: (track.total / cartCount) * i,
          lift: lift + 0.005,
          speed: CART_SPEED,
        });
        route.markers.push(...meshes);
        pickables.push(...meshes);
      }
    }
    routes.push(route);
  }

  // Temporal flows: permit circuits through the city gate. The issuer sends
  // a stamped permit out through the gate to the client camp; couriers bring
  // it back through the gate to customs for the check.
  const gateByTarget = new Map(gates.map((g) => [g.entity.id, g]));
  const posternByIssuer = new Map(posterns.map((p) => [p.entity.id, p]));
  for (const gate of gates) {
    for (const m of [...gateStructure(gate, theme), ...campStructure(gate, theme)]) {
      group.add(m);
      pickables.push(m);
    }
  }
  for (const postern of posterns) {
    for (const m of posternStructure(postern, theme)) {
      group.add(m);
      pickables.push(m);
    }
  }
  for (const rel of ir.relations) {
    if (rel.type !== "flows-into" || rel.attrs.mode !== "temporal") continue;
    const gate = gateByTarget.get(rel.to);
    const issuer = anchors.get(rel.from);
    const style = theme.routes["flows-temporal"];
    if (!gate || !issuer || !style) {
      skipped += 1;
      continue;
    }
    // Out through the issuer's own unguarded postern (exits are unchecked);
    // back in only through customs.
    const exit = posternByIssuer.get(rel.from) ?? gate;
    const issuerP: Point2 = { x: issuer.x, z: issuer.z };
    const cityOut = routeStreet(streetGrid, issuerP, exit.inside) ?? [issuerP, exit.inside];
    const outsideLeg =
      routeStreet(streetGrid, exit.outside, gate.camp) ?? [exit.outside, gate.camp];
    const outbound: Point2[] = [...cityOut, exit.at, ...outsideLeg];
    // Customs IS the gate: the returning permit's journey ends at the check.
    const inbound: Point2[] = [gate.camp, gate.outside, gate.at, gate.inside];
    const outLane = roadMesh(outbound, style.radius, style.color, style.opacity, heightField, 0.07);
    const inLane = roadMesh(inbound, style.radius, style.color, style.opacity, heightField, 0.074);
    group.add(outLane, inLane);
    const route: Route = { mesh: outLane, relation: rel, mode: "temporal", markers: [inLane] };
    if (typeof rel.attrs.shape === "string") route.shape = rel.attrs.shape;
    const circuit = trackFrom([...outbound, ...inbound.slice(1)]);
    const owner = gate.permitShape ?? entityById.get(rel.from)!;
    for (let i = 0; i < 2; i++) {
      const { group: courierGroup, meshes } = permitCourier(theme, owner);
      group.add(courierGroup);
      carts.push({
        group: courierGroup,
        track: circuit,
        offset: (circuit.total / 2) * i,
        lift: 0.34,
        speed: COURIER_SPEED,
      });
      route.markers.push(...meshes);
      pickables.push(...meshes);
    }
    routes.push(route);
  }

  for (const rel of ir.relations) {
    if (rel.type === "guards" || rel.type === "accesses") continue; // handled above
    const mode = typeof rel.attrs.mode === "string" ? rel.attrs.mode : undefined;
    if (rel.type === "flows-into" && mode === "temporal") continue; // handled above
    const key = routeKeyFor(rel.type, mode);
    const from = anchors.get(rel.from);
    const to = anchors.get(rel.to);
    const style = key ? theme.routes[key] : undefined;
    if (!style || !from || !to) {
      skipped += 1;
      continue;
    }
    let mesh: THREE.Mesh;
    if (style.form === "road") {
      // Street-routed: axis-aligned path through the gaps between buildings,
      // falling back to a straight ribbon if no route exists.
      const a: Point2 = { x: from.x, z: from.z };
      const b: Point2 = { x: to.x, z: to.z };
      const path = routeStreet(streetGrid, a, b) ?? [a, b];
      // Deterministic stagger so overlapping roads don't z-fight.
      const lift = 0.02 + (roadCount++ % 7) * 0.005;
      mesh = roadMesh(path, style.radius, style.color, style.opacity, heightField, lift);
    } else {
      mesh = arcMesh(from, to, style.apex, style.radius, style.color, style.opacity);
    }
    const route: Route = { mesh, relation: rel, markers: [] };
    if (typeof rel.attrs.shape === "string") route.shape = rel.attrs.shape;
    if (mode !== undefined) route.mode = mode;
    group.add(mesh);
    routes.push(route);
  }

  const animate = (elapsedSeconds: number): void => {
    for (const cart of carts) {
      const s = (cart.offset + elapsedSeconds * cart.speed) % cart.track.total;
      const p = trackPosAt(cart.track, s);
      cart.group.position.set(p.x, groundAt(heightField, p.x, p.z) + cart.lift, p.z);
      cart.group.rotation.y = p.angle;
    }
  };

  return { group, routes, pickables, skipped, animate };
}

function setRoute(route: Route, visible: boolean, opacity: number): void {
  for (const m of [route.mesh, ...route.markers]) {
    m.visible = visible;
    (m.material as THREE.MeshBasicMaterial).opacity = opacity;
  }
}

export interface ViewState {
  /** Datashape whose cargo routes are lit (traced-path). */
  tracedShape: string | null;
  /** Building the viewer has "entered": its flow manifest is revealed. */
  focusedEntity: string | null;
}

/** Ordinary/context/capability flows are local deliveries — hidden until you
 * enter a building. Temporal permit circuits stay visible: they're the city's
 * connection to the outside world. */
function isLocalDelivery(r: Route): boolean {
  return r.relation.type === "flows-into" && r.mode !== "temporal";
}

export function flowsTouching(built: BuiltConnections, entityId: string): Route[] {
  return built.routes.filter(
    (r) =>
      r.relation.type === "flows-into" &&
      (r.relation.from === entityId || r.relation.to === entityId),
  );
}

/**
 * Apply the current view: traced-path (light a shape's cargo routes, dim the
 * rest) and/or building focus (reveal that building's otherwise-hidden flow
 * routes). Returns the lit trace routes for the HUD.
 */
export function applyView(
  built: BuiltConnections,
  view: ViewState,
  meshById: Map<string, THREE.Mesh>,
): Route[] {
  // Reset building glow from any previous view.
  for (const mesh of meshById.values()) {
    const mat = mesh.material as THREE.MeshLambertMaterial;
    if (mat.emissive) mat.emissive.setHex(0x000000);
  }
  const lit: Route[] = [];
  for (const r of built.routes) {
    const base = r.mesh.userData.baseOpacity as number;
    let visible = !isLocalDelivery(r);
    if (
      view.focusedEntity !== null &&
      r.relation.type === "flows-into" &&
      (r.relation.from === view.focusedEntity || r.relation.to === view.focusedEntity)
    ) {
      visible = true;
    }
    let opacity = base;
    if (view.tracedShape !== null) {
      const isCargo =
        r.relation.type === "flows-into" &&
        r.shape === view.tracedShape &&
        r.mode !== "capability";
      if (isCargo) {
        visible = true;
        opacity = 1;
        lit.push(r);
      } else {
        opacity = base * 0.08;
      }
    }
    setRoute(r, visible, opacity);
  }
  const glowIds = new Set<string>();
  if (view.tracedShape !== null) {
    glowIds.add(view.tracedShape);
    for (const r of lit) {
      glowIds.add(r.relation.from);
      glowIds.add(r.relation.to);
    }
  } else if (view.focusedEntity !== null) {
    glowIds.add(view.focusedEntity);
  }
  for (const id of glowIds) {
    const mesh = meshById.get(id);
    if (!mesh) continue;
    const mat = mesh.material as THREE.MeshLambertMaterial;
    if (mat.emissive) mat.emissive.copy(mat.color).multiplyScalar(0.55);
  }
  return lit;
}
