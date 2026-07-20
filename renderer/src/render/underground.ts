import * as THREE from "three";
import type { WorldIR } from "../ir/types";
import type { LayoutNode, WorldLayout } from "../layout/layout";
import { foundationColor, type Theme } from "./theme";

export const FOUNDATION_DEPTH = -1.2;

export interface FoundationPoint {
  x: number;
  y: number;
  z: number;
}

export interface FoundationMember {
  entityId: string;
  top: FoundationPoint;
  foot: FoundationPoint;
}

export interface FoundationPipe {
  file: string;
  members: FoundationMember[];
  /** Polyline vertices, in member entity-id order. */
  run: FoundationPoint[];
}

function sourceFileFor(
  byId: ReadonlyMap<string, WorldIR["entities"][number]>,
  entityId: string,
): string | null {
  let entity = byId.get(entityId);
  const visited = new Set<string>();
  while (entity && !visited.has(entity.id)) {
    visited.add(entity.id);
    if (entity.source?.file) return entity.source.file;
    entity = entity.contains_parent === undefined ? undefined : byId.get(entity.contains_parent);
  }
  return null;
}

function isRenderedLeaf(node: LayoutNode, excludedEntityIds: ReadonlySet<string>): boolean {
  return (
    node.children.length === 0 &&
    (node.role === "building" || node.role === "room") &&
    !excludedEntityIds.has(node.entity.id)
  );
}

export function deriveFoundationPipes(
  sourceIR: WorldIR,
  layout: WorldLayout,
  excludedEntityIds: ReadonlySet<string> = new Set(),
): FoundationPipe[] {
  const membersByFile = new Map<string, FoundationMember[]>();
  const sourceEntitiesById = new Map(sourceIR.entities.map((entity) => [entity.id, entity]));
  const leaves = layout.nodes
    .filter((node) => isRenderedLeaf(node, excludedEntityIds))
    .sort((a, b) => (a.entity.id < b.entity.id ? -1 : 1));
  for (const node of leaves) {
    const file = sourceFileFor(sourceEntitiesById, node.entity.id);
    if (file === null) continue;
    // Finding 004 keeps a schematic's containment slot even when its board is
    // hosted elsewhere; foundations use that stable entity footprint rather
    // than furniture placement chosen later during mesh construction.
    const x = node.rect.x + node.rect.w / 2;
    const z = node.rect.z + node.rect.d / 2;
    const member: FoundationMember = {
      entityId: node.entity.id,
      top: { x, y: node.y, z },
      foot: { x, y: FOUNDATION_DEPTH, z },
    };
    const members = membersByFile.get(file) ?? [];
    members.push(member);
    membersByFile.set(file, members);
  }

  return [...membersByFile.entries()]
    .filter(([, members]) => members.length >= 2)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([file, members]) => ({
      file,
      members,
      run: members.map((member) => member.foot),
    }));
}

function segmentMesh(
  from: FoundationPoint,
  to: FoundationPoint,
  radius: number,
  material: THREE.Material,
): THREE.Mesh | null {
  const start = new THREE.Vector3(from.x, from.y, from.z);
  const end = new THREE.Vector3(to.x, to.y, to.z);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length === 0) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}

export function buildUnderground(pipes: FoundationPipe[], theme: Theme): THREE.Group {
  const group = new THREE.Group();
  group.name = "foundation-pipes";
  group.visible = false;
  for (const pipe of pipes) {
    const material = new THREE.MeshLambertMaterial({
      color: foundationColor(theme, pipe.file),
      transparent: true,
      opacity: theme.underground.opacity,
    });
    for (const member of pipe.members) {
      const shaft = segmentMesh(
        member.top,
        member.foot,
        theme.underground.shaftRadius,
        material,
      );
      if (shaft) {
        shaft.userData.file = pipe.file;
        shaft.userData.entityId = member.entityId;
        group.add(shaft);
      }
    }
    for (let i = 1; i < pipe.run.length; i++) {
      const segment = segmentMesh(
        pipe.run[i - 1]!,
        pipe.run[i]!,
        theme.underground.pipeRadius,
        material,
      );
      if (segment) {
        segment.userData.file = pipe.file;
        group.add(segment);
      }
    }
  }
  return group;
}
