import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIR } from "../src/ir/load";
import { computeLayout } from "../src/layout/layout";
import { deriveGates, derivePosterns, WALL } from "../src/render/gates";

function load(name: string) {
  const ir = parseIR(
    readFileSync(new URL(`../../examples/${name}/world.ir.yaml`, import.meta.url), "utf8"),
    "yaml",
  );
  return { ir, layout: computeLayout(ir) };
}

describe("city gates", () => {
  it("petstore gets one gate: authMiddleware customs", () => {
    const { ir, layout } = load("petstore");
    const gates = deriveGates(ir, layout);
    expect(gates.length).toBe(1);
    expect(gates[0]!.entity.id).toBe("sym:src/middleware/auth#authMiddleware");
    expect(gates[0]!.permitShape?.id).toBe("sym:src/types/Payload#Payload");
  });

  it("gate sits on the wall line, camp beyond it", () => {
    const { ir, layout } = load("petstore");
    const gate = deriveGates(ir, layout)[0]!;
    const b = layout.bounds;
    const onWall =
      Math.abs(gate.at.z - (b.z - WALL.margin)) < 1e-9 ||
      Math.abs(gate.at.z - (b.z + b.d + WALL.margin)) < 1e-9 ||
      Math.abs(gate.at.x - (b.x - WALL.margin)) < 1e-9 ||
      Math.abs(gate.at.x - (b.x + b.w + WALL.margin)) < 1e-9;
    expect(onWall).toBe(true);
    const inWall = (p: { x: number; z: number }) =>
      p.x > b.x - WALL.margin &&
      p.x < b.x + b.w + WALL.margin &&
      p.z > b.z - WALL.margin &&
      p.z < b.z + b.d + WALL.margin;
    expect(inWall(gate.inside)).toBe(true);
    expect(inWall(gate.outside)).toBe(false);
    expect(inWall(gate.camp)).toBe(false);
  });

  it("toyshop has no temporal flows, so no gates", () => {
    const { ir, layout } = load("toyshop");
    expect(deriveGates(ir, layout)).toEqual([]);
  });

  it("is deterministic", () => {
    const { ir, layout } = load("petstore");
    expect(JSON.stringify(deriveGates(ir, layout))).toBe(JSON.stringify(deriveGates(ir, layout)));
  });

  it("petstore gets one postern per permit issuer, clear of the gate", () => {
    const { ir, layout } = load("petstore");
    const gates = deriveGates(ir, layout);
    const posterns = derivePosterns(ir, layout, gates);
    expect(posterns.map((p) => p.entity.id).sort()).toEqual([
      "sym:src/routes/api/auth#loginUser",
      "sym:src/routes/api/user#registerUser",
    ]);
    // No opening overlaps another on the same wall side.
    const openings = [...gates, ...posterns].map((o) => ({
      side: o.side,
      at: o.side === "north" || o.side === "south" ? o.at.x : o.at.z,
      halfGap: o.halfGap,
    }));
    for (let i = 0; i < openings.length; i++) {
      for (let j = i + 1; j < openings.length; j++) {
        const a = openings[i]!;
        const c = openings[j]!;
        if (a.side !== c.side) continue;
        expect(Math.abs(a.at - c.at)).toBeGreaterThanOrEqual(a.halfGap + c.halfGap);
      }
    }
  });

  it("posterns are deterministic", () => {
    const { ir, layout } = load("petstore");
    const gates = deriveGates(ir, layout);
    expect(JSON.stringify(derivePosterns(ir, layout, gates))).toBe(
      JSON.stringify(derivePosterns(ir, layout, gates)),
    );
  });
});
