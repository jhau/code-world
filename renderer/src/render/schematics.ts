import * as THREE from "three";
import type { LayoutNode, WorldLayout } from "../layout/layout";
import { availableDoorSides, chooseDoorSide, firstDifferentSide, type DoorSide } from "./placement";
import { colorFor, type Theme } from "./theme";

export type SchematicPlacement =
  | { kind: "hosted"; shape: LayoutNode; host: LayoutNode }
  | { kind: "standalone"; shape: LayoutNode };

/** Non-class leaf shapes exchange their building for a document schematic. */
export function deriveSchematics(
  layout: WorldLayout,
  alreadySuppressed: ReadonlySet<string> = new Set(),
): SchematicPlacement[] {
  const hostsByShape = new Map<string, LayoutNode>();
  const hosts = layout.nodes
    .filter(
      (node) =>
        node.entity.kind === "value" &&
        node.role === "building" &&
        !alreadySuppressed.has(node.entity.id) &&
        typeof node.entity.attrs.stores_shape === "string",
    )
    .sort((a, b) => (a.entity.id < b.entity.id ? -1 : 1));
  for (const host of hosts) {
    const shapeId = host.entity.attrs.stores_shape as string;
    if (!hostsByShape.has(shapeId)) hostsByShape.set(shapeId, host);
  }

  return layout.nodes
    .filter(
      (node) =>
        node.entity.kind === "datashape" &&
        node.entity.shape_class !== "class" &&
        node.children.length === 0,
    )
    .sort((a, b) => (a.entity.id < b.entity.id ? -1 : 1))
    .map((shape): SchematicPlacement => {
      const host = hostsByShape.get(shape.entity.id);
      return host ? { kind: "hosted", shape, host } : { kind: "standalone", shape };
    });
}

function material(color: number, emissiveScale = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    transparent: true,
    emissive: new THREE.Color(color).multiplyScalar(emissiveScale),
  });
}

function mark(mesh: THREE.Mesh, placement: SchematicPlacement, part: string): THREE.Mesh {
  mesh.name = `schematic:${placement.kind}:${part}`;
  mesh.userData.entity = placement.shape.entity;
  mesh.userData.baseOpacity = 1;
  mesh.userData.schematic = placement.kind;
  return mesh;
}

function wallPosition(
  host: LayoutNode,
  side: DoorSide,
  alongOffset: number,
): { x: number; z: number; yaw: number } {
  const { rect } = host;
  if (side.axis === "z") {
    return {
      x: rect.x + rect.w / 2 + alongOffset,
      z: (side.dir === 1 ? rect.z + rect.d : rect.z) + side.dir * 0.07,
      yaw: side.dir === 1 ? 0 : Math.PI,
    };
  }
  return {
    x: (side.dir === 1 ? rect.x + rect.w : rect.x) + side.dir * 0.07,
    z: rect.z + rect.d / 2 + alongOffset,
    yaw: side.dir === 1 ? Math.PI / 2 : -Math.PI / 2,
  };
}

function hostedBlueprint(
  placement: Extract<SchematicPlacement, { kind: "hosted" }>,
  theme: Theme,
  obstacles: LayoutNode[],
): { group: THREE.Group; meshes: THREE.Mesh[] } {
  const dockSide = chooseDoorSide(placement.host, obstacles);
  const boardSide = firstDifferentSide(availableDoorSides(placement.host, obstacles), dockSide);
  // If every other centered approach is blocked, share the dock wall but stay
  // well clear of its center-stacked crates.
  const side = boardSide ?? dockSide;
  const alongOffset = boardSide ? 0 : 0.6;
  const at = wallPosition(placement.host, side, alongOffset);
  const width = 0.48;
  const height = 0.58;
  const thickness = 0.025;
  const frame = 0.04;
  const frameDepth = 0.045;
  const tilt = 0.12;
  const sheetColor = colorFor(theme, placement.shape.entity.kind, placement.shape.entity.roles);
  const group = new THREE.Group();
  const sheet = mark(
    new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), material(sheetColor, 0.16)),
    placement,
    "sheet",
  );
  sheet.position.y = height / 2 + frame;
  const bottom = mark(
    new THREE.Mesh(
      new THREE.BoxGeometry(width + frame * 2, frame, frameDepth),
      material(theme.schematic.frame),
    ),
    placement,
    "frame-bottom",
  );
  bottom.position.y = frame / 2;
  const top = mark(bottom.clone(), placement, "frame-top");
  top.position.y = height + frame * 1.5;
  const left = mark(
    new THREE.Mesh(
      new THREE.BoxGeometry(frame, height + frame, frameDepth),
      material(theme.schematic.frame),
    ),
    placement,
    "frame-left",
  );
  left.position.set(-(width + frame) / 2, height / 2 + frame, 0);
  const right = mark(left.clone(), placement, "frame-right");
  right.position.x *= -1;
  const meshes = [sheet, bottom, top, left, right];
  group.add(...meshes);
  group.rotation.set(-tilt, at.yaw, 0, "XYZ");
  group.position.set(
    at.x,
    placement.host.y + (frameDepth / 2) * Math.sin(tilt),
    at.z,
  );
  return { group, meshes };
}

function standaloneLectern(
  placement: Extract<SchematicPlacement, { kind: "standalone" }>,
  theme: Theme,
): { group: THREE.Group; meshes: THREE.Mesh[] } {
  const group = new THREE.Group();
  const fixed = () => material(theme.schematic.pedestal);
  const base = mark(
    new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.25), fixed()),
    placement,
    "base",
  );
  base.position.y = 0.035;
  const pedestal = mark(
    new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), fixed()),
    placement,
    "pedestal",
  );
  pedestal.position.y = 0.22;
  const sheetColor = colorFor(theme, placement.shape.entity.kind, placement.shape.entity.roles);
  const sheet = mark(
    new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.36), material(sheetColor, 0.16)),
    placement,
    "sheet",
  );
  sheet.position.y = 0.49;
  sheet.rotation.x = -0.55;
  const meshes = [base, pedestal, sheet];
  group.add(...meshes);
  group.position.set(
    placement.shape.rect.x + placement.shape.rect.w / 2,
    placement.shape.y,
    placement.shape.rect.z + placement.shape.rect.d / 2,
  );
  return { group, meshes };
}

export function buildSchematicMeshes(
  placements: SchematicPlacement[],
  theme: Theme,
  obstacles: LayoutNode[],
): { group: THREE.Group; pickables: THREE.Mesh[] } {
  const group = new THREE.Group();
  const pickables: THREE.Mesh[] = [];
  for (const placement of placements) {
    const built =
      placement.kind === "hosted"
        ? hostedBlueprint(placement, theme, obstacles)
        : standaloneLectern(placement, theme);
    group.add(built.group);
    pickables.push(...built.meshes);
  }
  return { group, pickables };
}
