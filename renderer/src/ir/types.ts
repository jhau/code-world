// World IR types, mirroring spec/world-ir-v0.2.md. The renderer treats entity
// ids as opaque strings beyond the `kind:` prefix already carried in `kind`.

export const ENTITY_KINDS = [
  "repo",
  "container",
  "unit",
  "callable",
  "datashape",
  "value",
  "external",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const RELATION_TYPES = [
  "depends-on",
  "calls",
  "flows-into",
  "error-flows",
  "guards",
  "accesses",
  "extends",
  "implements",
  "references",
  "re-exports",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export type ProvenanceMethod = "parsed" | "indexed" | "inferred" | "asserted";

export interface Provenance {
  method: ProvenanceMethod;
  confidence?: number;
  context?: string;
}

/** Every magnitude stores raw (any raw_* key) plus repo-normalized `norm`. */
export interface Magnitude {
  norm?: number;
  [rawKey: string]: number | undefined;
}

export interface SourceSpan {
  file: string;
  span?: [number, number];
}

export interface Entity {
  id: string;
  kind: EntityKind;
  contains_parent?: string;
  exported?: boolean;
  roles: string[];
  anonymous?: boolean;
  shape_class?: string;
  ecosystem?: string;
  magnitudes: Record<string, Magnitude>;
  behavior?: unknown[];
  source?: SourceSpan;
  provenance?: Provenance;
  fingerprint?: string;
  /** Frontend/framework-context extras (http, mounted_at, stores_shape, …). */
  attrs: Record<string, unknown>;
}

export interface Relation {
  type: RelationType | string;
  from: string;
  to: string;
  provenance?: Provenance;
  /** Edge extras (mode, shape, via, awaited, through, medium, …). */
  attrs: Record<string, unknown>;
}

export interface WorldIR {
  meta: Record<string, unknown>;
  entities: Entity[];
  relations: Relation[];
}

export function getNorm(e: Entity, magnitude: string): number | undefined {
  return e.magnitudes[magnitude]?.norm;
}
