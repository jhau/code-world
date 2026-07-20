import * as THREE from "three";
import type { LayoutNode, WorldLayout } from "../layout/layout";
import type { Entity } from "../ir/types";
import { WALL, type CityGate, type Postern, type WallOpening } from "./gates";
import { deriveSchematics } from "./schematics";
import { colorFor, externalColor, type Theme } from "./theme";

export interface Pickable {
  mesh: THREE.Mesh;
  entity: Entity;
}

export interface BuiltWorld {
  group: THREE.Group;
  pickables: THREE.Mesh[];
  setXray(enabled: boolean): void;
}

function boxMesh(
  w: number,
  h: number,
  d: number,
  color: number,
  flat = false,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color });
  if (flat) mat.emissive = new THREE.Color(color).multiplyScalar(0.15);
  return new THREE.Mesh(geo, mat);
}

function addNode(
  node: LayoutNode,
  theme: Theme,
  group: THREE.Group,
  pickables: THREE.Mesh[],
  suppressed: ReadonlySet<string>,
  xraySurfaces: THREE.Mesh[],
): void {
  // Entities represented elsewhere (e.g. customs → city gate) keep their
  // layout slot but render no building; their plot stays as open ground.
  if (suppressed.has(node.entity.id)) return;
  const { rect, y, height } = node;
  const isSlab = node.role === "district" || node.role === "plot";
  const color = colorFor(theme, node.entity.kind, node.entity.roles);
  const mesh = boxMesh(rect.w, height, rect.d, color, isSlab);
  mesh.position.set(rect.x + rect.w / 2, y + height / 2, rect.z + rect.d / 2);
  mesh.userData.entity = node.entity;
  mesh.userData.node = node;
  group.add(mesh);
  pickables.push(mesh);
  if (isSlab) xraySurfaces.push(mesh);
  for (const child of node.children) {
    addNode(child, theme, group, pickables, suppressed, xraySurfaces);
  }
}

/** The city wall, opened where customs gates and exit posterns stand. */
function addWall(
  layout: WorldLayout,
  theme: Theme,
  openings: WallOpening[],
  group: THREE.Group,
): void {
  const { bounds } = layout;
  const t = WALL.thickness;
  const h = WALL.height;
  const x0 = bounds.x - WALL.margin;
  const x1 = bounds.x + bounds.w + WALL.margin;
  const z0 = bounds.z - WALL.margin;
  const z1 = bounds.z + bounds.d + WALL.margin;
  const mat = new THREE.MeshLambertMaterial({ color: theme.wall });
  const sides: Array<{ side: string; axis: "x" | "z"; from: number; to: number; fixed: number }> = [
    { side: "north", axis: "x", from: x0 - t / 2, to: x1 + t / 2, fixed: z0 },
    { side: "south", axis: "x", from: x0 - t / 2, to: x1 + t / 2, fixed: z1 },
    { side: "west", axis: "z", from: z0 - t / 2, to: z1 + t / 2, fixed: x0 },
    { side: "east", axis: "z", from: z0 - t / 2, to: z1 + t / 2, fixed: x1 },
  ];
  for (const s of sides) {
    const cuts = openings
      .filter((g) => g.side === s.side)
      .map((g) => ({ at: s.axis === "x" ? g.at.x : g.at.z, halfGap: g.halfGap }))
      .sort((a, c) => a.at - c.at);
    const spans: Array<[number, number]> = [];
    let cursor = s.from;
    for (const cut of cuts) {
      spans.push([cursor, cut.at - cut.halfGap]);
      cursor = cut.at + cut.halfGap;
    }
    spans.push([cursor, s.to]);
    for (const [a, c] of spans) {
      const len = c - a;
      if (len < 0.05) continue;
      const geo =
        s.axis === "x" ? new THREE.BoxGeometry(len, h, t) : new THREE.BoxGeometry(t, h, len);
      const seg = new THREE.Mesh(geo, mat);
      const mid = (a + c) / 2;
      seg.position.set(s.axis === "x" ? mid : s.fixed, h / 2, s.axis === "x" ? s.fixed : mid);
      group.add(seg);
    }
  }
}

function addExternals(layout: WorldLayout, theme: Theme, group: THREE.Group, pickables: THREE.Mesh[]): void {
  for (const p of layout.externals) {
    const mesh = boxMesh(p.size, p.height, p.size, externalColor(theme, p.entity.ecosystem));
    mesh.position.set(p.x, p.height / 2, p.z);
    mesh.userData.entity = p.entity;
    group.add(mesh);
    pickables.push(mesh);
  }
}

export function buildWorld(
  layout: WorldLayout,
  theme: Theme,
  gates: CityGate[],
  posterns: Postern[],
): BuiltWorld {
  const group = new THREE.Group();
  const pickables: THREE.Mesh[] = [];
  const xraySurfaces: THREE.Mesh[] = [];

  const groundSize = Math.max(layout.bounds.w, layout.bounds.d) * 6 + 80;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshLambertMaterial({ color: theme.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);
  xraySurfaces.push(ground);

  const suppressed = new Set(gates.map((g) => g.entity.id));
  for (const schematic of deriveSchematics(layout, suppressed)) {
    suppressed.add(schematic.shape.entity.id);
  }
  addNode(layout.root, theme, group, pickables, suppressed, xraySurfaces);
  addWall(layout, theme, [...gates, ...posterns], group);
  addExternals(layout, theme, group, pickables);

  const hemi = new THREE.HemisphereLight(0xbdc7dd, 0x1a1d26, 0.9);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
  sun.position.set(30, 50, 20);
  group.add(sun);

  const setXray = (enabled: boolean): void => {
    for (const mesh of xraySurfaces) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      material.transparent = enabled;
      material.opacity = enabled ? theme.underground.surfaceOpacity : 1;
      material.depthWrite = !enabled;
      material.needsUpdate = true;
    }
  };

  return { group, pickables, setXray };
}
