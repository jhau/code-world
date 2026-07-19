import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIR } from "../src/ir/load";
import { computeLayout, type WorldLayout } from "../src/layout/layout";
import { buildStreetGrid, routeStreet, type Point2 } from "../src/layout/streets";

function petstoreLayout(): WorldLayout {
  const text = readFileSync(
    new URL("../../examples/petstore/world.ir.yaml", import.meta.url),
    "utf8",
  );
  return computeLayout(parseIR(text, "yaml"));
}

function plotCenter(layout: WorldLayout, id: string): Point2 {
  const node = layout.nodes.find((n) => n.entity.id === id);
  if (!node) throw new Error(`missing node ${id}`);
  return { x: node.rect.x + node.rect.w / 2, z: node.rect.z + node.rect.d / 2 };
}

describe("street routing", () => {
  const layout = petstoreLayout();
  const grid = buildStreetGrid(layout);
  const from = plotCenter(layout, "unit:src/server.ts");
  const to = plotCenter(layout, "unit:config/database.ts");

  it("finds an axis-aligned path between two plots", () => {
    const path = routeStreet(grid, from, to);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < path!.length - 1; i++) {
      const a = path![i]!;
      const b = path![i + 1]!;
      const alongX = Math.abs(a.z - b.z) < 1e-9;
      const alongZ = Math.abs(a.x - b.x) < 1e-9;
      expect(alongX || alongZ).toBe(true);
    }
  });

  it("keeps every waypoint out of building footprints", () => {
    const path = routeStreet(grid, from, to)!;
    const buildings = layout.nodes.filter((n) => n.role === "building");
    for (const p of path) {
      for (const b of buildings) {
        const inside =
          p.x > b.rect.x &&
          p.x < b.rect.x + b.rect.w &&
          p.z > b.rect.z &&
          p.z < b.rect.z + b.rect.d;
        expect(inside).toBe(false);
      }
    }
  });

  it("is deterministic", () => {
    const a = routeStreet(buildStreetGrid(layout), from, to);
    const b = routeStreet(buildStreetGrid(layout), from, to);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("routes every depends-on pair in petstore or falls back cleanly", () => {
    // All roads in the demo IR should find a street route (no fallbacks).
    const ir = parseIR(
      readFileSync(new URL("../../examples/petstore/world.ir.yaml", import.meta.url), "utf8"),
      "yaml",
    );
    const byId = new Map(layout.nodes.map((n) => [n.entity.id, n]));
    for (const rel of ir.relations) {
      if (rel.type !== "depends-on") continue;
      if (!byId.has(rel.from) || !byId.has(rel.to)) continue;
      const path = routeStreet(grid, plotCenter(layout, rel.from), plotCenter(layout, rel.to));
      expect(path, `${rel.from} -> ${rel.to}`).not.toBeNull();
    }
  });
});
