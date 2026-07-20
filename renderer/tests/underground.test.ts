import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { parseIR } from "../src/ir/load";
import type { Entity, WorldIR } from "../src/ir/types";
import { computeLayout } from "../src/layout/layout";
import { applyPlan } from "../src/plan/apply";
import { parsePlan } from "../src/plan/load";
import { defaultTheme, foundationColor } from "../src/render/theme";
import {
  buildUnderground,
  deriveFoundationPipes,
  FOUNDATION_DEPTH,
} from "../src/render/underground";
import { buildWorld } from "../src/render/world";

function entity(id: string, kind: Entity["kind"], contains_parent?: string): Entity {
  return {
    id,
    kind,
    ...(contains_parent === undefined ? {} : { contains_parent }),
    roles: [],
    magnitudes: {},
    attrs: {},
  };
}

function fixture(): WorldIR {
  const repo = entity("repo:test", "repo");
  const unitA = entity("unit:a.ts", "unit", repo.id);
  unitA.source = { file: "src/a.ts" };
  const unitB = entity("unit:b.ts", "unit", repo.id);
  unitB.source = { file: "src/b.ts" };
  return {
    meta: {},
    entities: [
      repo,
      unitA,
      entity("sym:z", "callable", unitA.id),
      entity("sym:a", "value", unitA.id),
      unitB,
      entity("sym:single", "callable", unitB.id),
    ],
    relations: [],
  };
}

describe("foundation pipe derivation", () => {
  it("groups rendered leaves by inherited source file and drops singleton files", () => {
    const ir = fixture();
    const pipes = deriveFoundationPipes(ir, computeLayout(ir));

    expect(pipes.map((pipe) => pipe.file)).toEqual(["src/a.ts"]);
    expect(pipes[0]?.members.map((member) => member.entityId)).toEqual(["sym:a", "sym:z"]);
  });

  it("creates shafts to a fixed depth and a run through sorted member feet", () => {
    const ir = fixture();
    const layout = computeLayout(ir);
    const pipe = deriveFoundationPipes(ir, layout)[0]!;

    expect(pipe.members.every((member) => member.foot.y === FOUNDATION_DEPTH))
      .toBe(true);
    expect(pipe.run).toEqual(pipe.members.map((member) => member.foot));
    for (const member of pipe.members) {
      const node = layout.nodes.find((candidate) => candidate.entity.id === member.entityId)!;
      expect(member.top).toEqual({
        x: node.rect.x + node.rect.w / 2,
        y: node.y,
        z: node.rect.z + node.rect.d / 2,
      });
    }
  });

  it("is deterministic, including geometry and file color", () => {
    const ir = fixture();
    const layout = computeLayout(ir);
    expect(deriveFoundationPipes(ir, layout)).toEqual(
      deriveFoundationPipes(ir, layout),
    );
    expect(foundationColor(defaultTheme, "src/a.ts")).toBe(
      foundationColor(defaultTheme, "src/a.ts"),
    );
    expect(defaultTheme.underground.palette).toContain(
      foundationColor(defaultTheme, "src/a.ts"),
    );
  });

  it("starts hidden and restores opaque slabs after x-ray is disabled", () => {
    const ir = fixture();
    const layout = computeLayout(ir);
    const pipes = deriveFoundationPipes(ir, layout);
    const underground = buildUnderground(pipes, defaultTheme);
    const world = buildWorld(layout, defaultTheme, [], []);
    const ground = world.group.children[0] as THREE.Mesh;
    const district = world.pickables.find(
      (mesh) => mesh.userData.node?.role === "district",
    )!;

    expect(underground.visible).toBe(false);
    for (const mesh of [ground, district]) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
    }

    world.setXray(true);
    for (const mesh of [ground, district]) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(defaultTheme.underground.surfaceOpacity);
    }

    world.setXray(false);
    for (const mesh of [ground, district]) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
    }
  });

  it("keeps petstore file-mates linked after the master plan moves gateway entities", () => {
    const sourceIR = parseIR(
      readFileSync(new URL("../../examples/petstore/world.ir.yaml", import.meta.url), "utf8"),
      "yaml",
    );
    const plan = parsePlan(
      readFileSync(new URL("../../examples/petstore/world.plan.yaml", import.meta.url), "utf8"),
    );
    const layout = computeLayout(applyPlan(sourceIR, plan));
    const pipes = deriveFoundationPipes(sourceIR, layout);

    expect(
      pipes.find((pipe) => pipe.file === "src/models/User.ts")?.members.map((member) =>
        member.entityId,
      ),
    ).toEqual(["sym:src/models/User#IUser", "sym:src/models/User#User"]);
    expect(
      pipes.find((pipe) => pipe.file === "src/routes/api/user.ts")?.members.map((member) =>
        member.entityId,
      ),
    ).toEqual([
      "sym:src/routes/api/user#registerUser",
      "sym:src/routes/api/user#router",
    ]);
  });
});
