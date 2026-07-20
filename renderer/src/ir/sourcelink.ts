import type { WorldIR } from "./types";

export interface SourceLinkOverrides {
  repo?: string;
  ref?: string;
}

export function resolveSourceLink(
  ir: WorldIR,
  entityId: string,
  overrides: SourceLinkOverrides = {},
): string | null {
  const repo = overrides.repo ?? (typeof ir.meta.repo_url === "string" ? ir.meta.repo_url : undefined);
  const entity = ir.entities.find((candidate) => candidate.id === entityId);
  if (!repo || !entity || entity.kind === "external" || entity.kind === "repo") return null;

  const entitiesById = new Map(ir.entities.map((candidate) => [candidate.id, candidate]));
  let source = entity.source;
  let ancestorId = entity.contains_parent;
  const visited = new Set<string>();
  while (!source && ancestorId && !visited.has(ancestorId)) {
    visited.add(ancestorId);
    const ancestor = entitiesById.get(ancestorId);
    source = ancestor?.source;
    ancestorId = ancestor?.contains_parent;
  }
  if (!source?.file) return null;

  const base = repo.replace(/\/$/, "").replace(/\.git$/, "");
  const ref = overrides.ref ?? (typeof ir.meta.ref === "string" ? ir.meta.ref : "main");
  const span = entity.source?.span;
  const fragment = span ? `#L${span[0]}-L${span[1]}` : "";
  return `${base}/blob/${ref}/${source.file}${fragment}`;
}
