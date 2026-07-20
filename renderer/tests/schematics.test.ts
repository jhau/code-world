import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { parseIR } from "../src/ir/load";
import { computeLayout } from "../src/layout/layout";
import { buildConnections } from "../src/render/connections";
import { deriveGates, derivePosterns } from "../src/render/gates";
import { defaultTheme } from "../src/render/theme";
import { buildWorld } from "../src/render/world";

function load(name: "petstore" | "toyshop") {
  const ir = parseIR(
    readFileSync(new URL(`../../examples/${name}/world.ir.yaml`, import.meta.url), "utf8"),
    "yaml",
  );
  const layout = computeLayout(ir);
  const gates = deriveGates(ir, layout);
  const posterns = derivePosterns(ir, layout, gates);
  return { ir, layout, gates, posterns };
}

function entityId(mesh: THREE.Mesh): string | undefined {
  return mesh.userData.entity?.id as string | undefined;
}

function schematicsFor(meshes: THREE.Mesh[], entity: string): THREE.Mesh[] {
  return meshes.filter(
    (mesh) => entityId(mesh) === entity && typeof mesh.userData.schematic === "string",
  );
}

function expectPickableSchematic(meshes: THREE.Mesh[], entity: string): void {
  expect(meshes.length).toBeGreaterThan(0);
  for (const mesh of meshes) {
    expect(entityId(mesh)).toBe(entity);
    expect(mesh.userData.baseOpacity).toBe(1);
    expect((mesh.material as THREE.Material).transparent).toBe(true);
  }
}

describe("datashape schematics", () => {
  it("suppresses only non-class leaf datashape buildings", () => {
    const { layout, gates, posterns } = load("toyshop");
    const world = buildWorld(layout, defaultTheme, gates, posterns);
    const rendered = new Set(world.pickables.map(entityId));

    expect(rendered.has("sym:src/types#Order")).toBe(false);
    expect(rendered.has("sym:src/types#OrderItem")).toBe(false);
    expect(rendered.has("sym:src/types#ValidationError")).toBe(true);
    expect(rendered.has("sym:src/db#OrderStore")).toBe(true);
    expect(rendered.has("sym:src/db#OrderStore.save")).toBe(true);
  });

  it("renders a hosted shape as a pickable blueprint clear of dock crates", () => {
    const { ir, layout, gates, posterns } = load("petstore");
    const built = buildConnections(ir, layout, defaultTheme, gates, posterns);
    built.group.updateMatrixWorld(true);

    const shapeId = "sym:src/models/User#IUser";
    const hostId = "sym:src/models/User#User";
    const board = schematicsFor(built.pickables, shapeId);
    expectPickableSchematic(board, shapeId);
    expect(new Set(board.map((mesh) => mesh.userData.schematic))).toEqual(new Set(["hosted"]));

    const crates = built.pickables.filter(
      (mesh) => entityId(mesh) === hostId && mesh.userData.schematic === undefined,
    );
    expect(crates.length).toBeGreaterThan(0);
    for (const boardMesh of board) {
      const boardBox = new THREE.Box3().setFromObject(boardMesh);
      for (const crate of crates) {
        expect(boardBox.intersectsBox(new THREE.Box3().setFromObject(crate))).toBe(false);
      }
    }

    const host = layout.nodes.find((node) => node.entity.id === hostId)!;
    const ownSlot = layout.nodes.find((node) => node.entity.id === shapeId)!;
    const boardCenter = new THREE.Box3()
      .setFromObject(board.find((mesh) => mesh.name.endsWith(":sheet"))!)
      .getCenter(new THREE.Vector3());
    const distanceTo = (node: typeof host) =>
      Math.hypot(
        boardCenter.x - (node.rect.x + node.rect.w / 2),
        boardCenter.z - (node.rect.z + node.rect.d / 2),
      );
    expect(distanceTo(host)).toBeLessThan(distanceTo(ownSlot));
  });

  it("renders a standalone shape as a low pickable lectern in its reserved slot", () => {
    const { ir, layout, gates, posterns } = load("toyshop");
    const built = buildConnections(ir, layout, defaultTheme, gates, posterns);
    built.group.updateMatrixWorld(true);

    const shapeId = "sym:src/types#Order";
    const node = layout.nodes.find((candidate) => candidate.entity.id === shapeId)!;
    const lectern = schematicsFor(built.pickables, shapeId);
    expectPickableSchematic(lectern, shapeId);
    expect(new Set(lectern.map((mesh) => mesh.userData.schematic))).toEqual(
      new Set(["standalone"]),
    );

    const bounds = lectern.reduce(
      (box, mesh) => box.union(new THREE.Box3().setFromObject(mesh)),
      new THREE.Box3(),
    );
    const center = bounds.getCenter(new THREE.Vector3());
    expect(center.x).toBeCloseTo(node.rect.x + node.rect.w / 2, 8);
    expect(center.z).toBeCloseTo(node.rect.z + node.rect.d / 2, 8);
    expect(bounds.min.y).toBeGreaterThanOrEqual(node.y - 1e-8);
    expect(bounds.max.y).toBeLessThanOrEqual(node.y + 0.7);
  });
});
