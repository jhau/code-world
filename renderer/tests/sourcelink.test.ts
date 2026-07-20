import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIR } from "../src/ir/load";
import { resolveSourceLink } from "../src/ir/sourcelink";

function loadExample(name: string) {
  const text = readFileSync(
    new URL(`../../examples/${name}/world.ir.yaml`, import.meta.url),
    "utf8",
  );
  return parseIR(text, "yaml");
}

describe("resolveSourceLink", () => {
  it("resolves a petstore unit to its repository file", () => {
    const ir = loadExample("petstore");

    expect(resolveSourceLink(ir, "unit:src/server.ts")).toBe(
      "https://github.com/manish87sharma/PetStore/blob/master/src/server.ts",
    );
  });

  it("uses the nearest sourced ancestor without inheriting its line span", () => {
    const ir = loadExample("petstore");

    expect(resolveSourceLink(ir, "sym:src/routes/api/auth#loginUser")).toBe(
      "https://github.com/manish87sharma/PetStore/blob/master/src/routes/api/auth.ts",
    );
  });

  it("adds a line fragment for an entity's own source span", () => {
    const ir = loadExample("toyshop");

    expect(
      resolveSourceLink(ir, "sym:src/index#requestHandler", {
        repo: "https://github.com/example/toyshop",
      }),
    ).toBe("https://github.com/example/toyshop/blob/main/src/index.ts#L8-L24");
  });

  it("returns null when neither metadata nor overrides provide a repository", () => {
    expect(resolveSourceLink(loadExample("toyshop"), "sym:src/index#requestHandler")).toBeNull();
  });

  it("never links external entities or the repository root", () => {
    const ir = loadExample("petstore");
    for (const entityId of ["repo:petstore", "external:express"]) {
      const entity = ir.entities.find((candidate) => candidate.id === entityId);
      if (!entity) throw new Error(`missing fixture entity ${entityId}`);
      entity.source = { file: "not-linkable.ts", span: [1, 2] };

      expect(resolveSourceLink(ir, entityId)).toBeNull();
    }
  });
});
