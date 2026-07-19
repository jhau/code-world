import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIR } from "../src/ir/load";
import { validateIR } from "../src/ir/validate";
import { computeLayout, type LayoutNode } from "../src/layout/layout";

function loadExample(name: string) {
  const text = readFileSync(
    new URL(`../../examples/${name}/world.ir.yaml`, import.meta.url),
    "utf8",
  );
  return parseIR(text, "yaml");
}

const EPS = 1e-6;

function checkContainment(node: LayoutNode): void {
  for (const child of node.children) {
    expect(child.rect.x).toBeGreaterThanOrEqual(node.rect.x - EPS);
    expect(child.rect.z).toBeGreaterThanOrEqual(node.rect.z - EPS);
    expect(child.rect.x + child.rect.w).toBeLessThanOrEqual(node.rect.x + node.rect.w + EPS);
    expect(child.rect.z + child.rect.d).toBeLessThanOrEqual(node.rect.z + node.rect.d + EPS);
    checkContainment(child);
  }
}

describe.each(["petstore", "toyshop"])("%s IR", (name) => {
  it("parses and validates with no errors", () => {
    const ir = loadExample(name);
    expect(ir.entities.length).toBeGreaterThan(0);
    expect(ir.relations.length).toBeGreaterThan(0);
    const { errors } = validateIR(ir);
    expect(errors).toEqual([]);
  });

  it("lays out every non-external entity inside its parent rect", () => {
    const ir = loadExample(name);
    const layout = computeLayout(ir);
    const inCity = ir.entities.filter((e) => e.kind !== "external").length;
    expect(layout.nodes.length).toBe(inCity);
    checkContainment(layout.root);
  });

  it("is deterministic: same IR, same world", () => {
    const a = computeLayout(loadExample(name));
    const b = computeLayout(loadExample(name));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("petstore specifics", () => {
  it("normalizes string and object provenance forms", () => {
    const ir = loadExample("petstore");
    const unit = ir.entities.find((e) => e.id === "unit:src/server.ts");
    expect(unit?.provenance).toEqual({ method: "inferred" });
    const shape = ir.entities.find((e) => e.id === "sym:src/models/User#IUser");
    expect(shape?.provenance).toEqual({ method: "inferred", confidence: 0.85 });
  });

  it("keeps framework extras in attrs", () => {
    const ir = loadExample("petstore");
    const login = ir.entities.find((e) => e.id === "sym:src/routes/api/auth#loginUser");
    expect(login?.roles).toContain("http-entry");
    expect(login?.attrs.http).toEqual({ method: "POST", path: "/api/auth" });
  });

  it("places externals outside the city bounds", () => {
    const layout = computeLayout(loadExample("petstore"));
    expect(layout.externals.length).toBe(12);
    for (const p of layout.externals) {
      const inside =
        p.x > layout.bounds.x &&
        p.x < layout.bounds.x + layout.bounds.w &&
        p.z > layout.bounds.z &&
        p.z < layout.bounds.z + layout.bounds.d;
      expect(inside).toBe(false);
    }
  });
});

describe("jsonl format", () => {
  it("parses one entity/relation per line", () => {
    const jsonl = [
      '{"meta": {"repo": "mini"}}',
      '{"id": "repo:mini", "kind": "repo"}',
      '{"id": "unit:a.ts", "kind": "unit", "contains_parent": "repo:mini", "provenance": "parsed"}',
      '{"id": "unit:b.ts", "kind": "unit", "contains_parent": "repo:mini"}',
      '{"type": "depends-on", "from": "unit:a.ts", "to": "unit:b.ts"}',
    ].join("\n");
    const ir = parseIR(jsonl, "jsonl");
    expect(ir.meta.repo).toBe("mini");
    expect(ir.entities.length).toBe(3);
    expect(ir.relations.length).toBe(1);
    expect(validateIR(ir).errors).toEqual([]);
    expect(computeLayout(ir).nodes.length).toBe(3);
  });
});
