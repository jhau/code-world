import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIR } from "../src/ir/load";
import type { Entity, WorldIR } from "../src/ir/types";
import { computeLayout } from "../src/layout/layout";
import { applyPlan } from "../src/plan/apply";
import { parsePlan, PlanParseError } from "../src/plan/load";
import type { Plan } from "../src/plan/types";
import { buildConnections } from "../src/render/connections";
import { deriveGates, derivePosterns } from "../src/render/gates";
import { defaultTheme, routeKeyFor } from "../src/render/theme";

function entity(
  id: string,
  kind: Entity["kind"],
  contains_parent?: string,
  roles: string[] = [],
): Entity {
  return {
    id,
    kind,
    ...(contains_parent === undefined ? {} : { contains_parent }),
    roles,
    magnitudes: {},
    attrs: {},
  };
}

function fixture(): WorldIR {
  return {
    meta: { repo: "test" },
    entities: [
      entity("repo:test", "repo"),
      entity("unit:routes.ts", "unit", "repo:test"),
      entity("sym:router", "value", "unit:routes.ts", ["http-router"]),
      entity("sym:handler", "callable", "unit:routes.ts", ["http-entry"]),
      entity("sym:helper", "callable", "unit:routes.ts", ["helper"]),
      entity("external:lib", "external"),
    ],
    relations: [
      { type: "calls", from: "sym:handler", to: "sym:helper", attrs: {} },
    ],
  };
}

const plan: Plan = {
  version: "0.1",
  name: "test",
  groups: [
    {
      id: "logical:routers",
      label: "Routers",
      form: "building",
      placement: "gate",
      select: [{ roles: ["http-router"] }],
    },
    {
      id: "logical:gateway",
      label: "Gateway",
      form: "building",
      select: [{ roles: ["http-router"] }, { roles: ["http-entry"] }],
    },
    {
      id: "logical:empty",
      label: "Empty",
      form: "district",
      select: [{ roles: ["does-not-exist"] }],
    },
  ],
};

describe("master plan parsing", () => {
  it("parses and validates the v0 schema", () => {
    expect(
      parsePlan(`
version: 0.1
name: default
groups:
  - id: logical:api-gateway
    label: API Gateway
    form: building
    placement: gate
    parent: repo:petstore
    select:
      - roles: [http-router]
      - roles: [http-entry]
`),
    ).toEqual({
      version: "0.1",
      name: "default",
      groups: [
        {
          id: "logical:api-gateway",
          label: "API Gateway",
          form: "building",
          placement: "gate",
          parent: "repo:petstore",
          select: [{ roles: ["http-router"] }, { roles: ["http-entry"] }],
        },
      ],
    });
  });

  it("rejects unsupported forms and empty selectors", () => {
    expect(() =>
      parsePlan("version: 0.1\nname: bad\ngroups: [{ id: logical:x, label: X, form: tower, select: [] }]")
    ).toThrow(PlanParseError);
  });
});

describe("applyPlan", () => {
  it("preserves every input entity exactly once and creates only non-empty groups", () => {
    const ir = fixture();
    const result = applyPlan(ir, plan);
    const inputIds = ir.entities.map((candidate) => candidate.id);
    const outputInputIds = result.entities
      .filter((candidate) => inputIds.includes(candidate.id))
      .map((candidate) => candidate.id);

    expect(outputInputIds.sort()).toEqual(inputIds.sort());
    expect(new Set(outputInputIds).size).toBe(ir.entities.length);
    expect(result.entities.map((candidate) => candidate.id)).toContain("logical:routers");
    expect(result.entities.map((candidate) => candidate.id)).toContain("logical:gateway");
    expect(result.entities.map((candidate) => candidate.id)).not.toContain("logical:empty");
    expect(result.entities.length).toBe(ir.entities.length + 2);
  });

  it("leaves relations untouched and unmatched entities in place", () => {
    const ir = fixture();
    const result = applyPlan(ir, plan);

    expect(result.relations).toBe(ir.relations);
    expect(result.relations).toEqual(ir.relations);
    expect(result.entities.find((candidate) => candidate.id === "sym:helper")?.contains_parent)
      .toBe("unit:routes.ts");
    expect(result.entities.find((candidate) => candidate.id === "external:lib"))
      .toEqual(ir.entities.find((candidate) => candidate.id === "external:lib"));
  });

  it("uses ordered groups with first match wins", () => {
    const result = applyPlan(fixture(), plan);

    expect(result.entities.find((candidate) => candidate.id === "sym:router")?.contains_parent)
      .toBe("logical:routers");
    expect(result.entities.find((candidate) => candidate.id === "sym:handler")?.contains_parent)
      .toBe("logical:gateway");
  });

  it("is deterministic across repeated applications to the same input", () => {
    const ir = fixture();
    expect(applyPlan(ir, plan)).toEqual(applyPlan(ir, plan));
  });

  it("lays out a form:building group as a building with room children", () => {
    const ir = fixture();
    ir.entities.find((candidate) => candidate.id === "sym:handler")!.magnitudes = {
      size: { raw: 20, norm: 0.75 },
    };
    const layout = computeLayout(applyPlan(ir, plan));
    const gateway = layout.nodes.find((node) => node.entity.id === "logical:gateway");

    expect(gateway?.role).toBe("building");
    expect(gateway?.children.map((child) => child.role)).toEqual(["room"]);
    expect(gateway?.height).toBeCloseTo(0.8 + 4.5 * 0.75);
  });
});

describe("petstore master plan", () => {
  it("creates one ten-department gateway and keeps moved relation endpoints attached", () => {
    const sourceIR = parseIR(
      readFileSync(new URL("../../examples/petstore/world.ir.yaml", import.meta.url), "utf8"),
      "yaml",
    );
    const petstorePlan = parsePlan(
      readFileSync(new URL("../../examples/petstore/world.plan.yaml", import.meta.url), "utf8"),
    );
    const ir = applyPlan(sourceIR, petstorePlan);
    const layout = computeLayout(ir);
    const gateway = layout.nodes.find((node) => node.entity.id === "logical:api-gateway")!;

    expect(gateway.role).toBe("building");
    expect(gateway.children).toHaveLength(10);
    expect(gateway.children.every((child) => child.role === "room")).toBe(true);

    const gates = deriveGates(ir, layout);
    const posterns = derivePosterns(ir, layout, gates);
    const connections = buildConnections(ir, layout, defaultTheme, gates, posterns);
    const renderedRelations = new Set(connections.routes.map((route) => route.relation));
    const movedIds = new Set(gateway.children.map((child) => child.entity.id));
    const expected = ir.relations.filter((relation) => {
      const mode = typeof relation.attrs.mode === "string" ? relation.attrs.mode : undefined;
      return (
        (movedIds.has(relation.from) || movedIds.has(relation.to)) &&
        routeKeyFor(relation.type, mode) !== null
      );
    });
    for (const relation of expected) expect(renderedRelations.has(relation)).toBe(true);
  });
});
