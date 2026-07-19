import { parse as parseYaml } from "yaml";
import type { Entity, Provenance, Relation, WorldIR } from "./types";

const ENTITY_KEYS = new Set([
  "id",
  "kind",
  "contains_parent",
  "exported",
  "roles",
  "anonymous",
  "shape_class",
  "ecosystem",
  "magnitudes",
  "behavior",
  "source",
  "provenance",
  "fingerprint",
]);

const RELATION_KEYS = new Set(["type", "from", "to", "provenance"]);

export class IRParseError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Provenance appears both as a bare method string and as an object. */
function normalizeProvenance(v: unknown): Provenance | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string") return { method: v as Provenance["method"] };
  if (isRecord(v)) {
    return {
      method: String(v.method) as Provenance["method"],
      ...(typeof v.confidence === "number" ? { confidence: v.confidence } : {}),
      ...(typeof v.context === "string" ? { context: v.context } : {}),
    };
  }
  return undefined;
}

function normalizeEntity(raw: Record<string, unknown>): Entity {
  const attrs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!ENTITY_KEYS.has(k)) attrs[k] = v;
  }
  const entity: Entity = {
    id: String(raw.id ?? ""),
    kind: String(raw.kind ?? "") as Entity["kind"],
    roles: Array.isArray(raw.roles) ? raw.roles.map(String) : [],
    magnitudes: isRecord(raw.magnitudes)
      ? (raw.magnitudes as Entity["magnitudes"])
      : {},
    attrs,
  };
  if (typeof raw.contains_parent === "string") entity.contains_parent = raw.contains_parent;
  if (typeof raw.exported === "boolean") entity.exported = raw.exported;
  if (typeof raw.anonymous === "boolean") entity.anonymous = raw.anonymous;
  if (typeof raw.shape_class === "string") entity.shape_class = raw.shape_class;
  if (typeof raw.ecosystem === "string") entity.ecosystem = raw.ecosystem;
  if (Array.isArray(raw.behavior)) entity.behavior = raw.behavior;
  if (isRecord(raw.source) && typeof raw.source.file === "string") {
    entity.source = { file: raw.source.file };
    if (Array.isArray(raw.source.span)) {
      const [start, end] = raw.source.span as unknown[];
      if (typeof start === "number" && typeof end === "number") {
        entity.source.span = [start, end];
      }
    }
  }
  if (typeof raw.fingerprint === "string") entity.fingerprint = raw.fingerprint;
  const prov = normalizeProvenance(raw.provenance);
  if (prov) entity.provenance = prov;
  return entity;
}

function normalizeRelation(raw: Record<string, unknown>): Relation {
  const attrs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!RELATION_KEYS.has(k)) attrs[k] = v;
  }
  const relation: Relation = {
    type: String(raw.type ?? ""),
    from: String(raw.from ?? ""),
    to: String(raw.to ?? ""),
    attrs,
  };
  const prov = normalizeProvenance(raw.provenance);
  if (prov) relation.provenance = prov;
  return relation;
}

function fromDocument(doc: unknown): WorldIR {
  if (!isRecord(doc)) throw new IRParseError("IR document is not a mapping");
  const entitiesRaw = doc.entities;
  if (!Array.isArray(entitiesRaw) || entitiesRaw.length === 0) {
    throw new IRParseError("IR has no entities");
  }
  return {
    meta: isRecord(doc.meta) ? doc.meta : {},
    entities: entitiesRaw.filter(isRecord).map(normalizeEntity),
    relations: Array.isArray(doc.relations)
      ? doc.relations.filter(isRecord).map(normalizeRelation)
      : [],
  };
}

/** JSONL: one entity or relation per line; a line with `meta` sets meta. */
function fromJsonl(text: string): WorldIR {
  const ir: WorldIR = { meta: {}, entities: [], relations: [] };
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "" || line.startsWith("#")) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      throw new IRParseError(`line ${i + 1}: invalid JSON (${String(e)})`);
    }
    if (!isRecord(obj)) throw new IRParseError(`line ${i + 1}: not an object`);
    if (isRecord(obj.meta)) Object.assign(ir.meta, obj.meta);
    else if ("kind" in obj) ir.entities.push(normalizeEntity(obj));
    else if ("type" in obj) ir.relations.push(normalizeRelation(obj));
    else throw new IRParseError(`line ${i + 1}: neither entity, relation, nor meta`);
  }
  if (ir.entities.length === 0) throw new IRParseError("IR has no entities");
  return ir;
}

export type IRFormat = "yaml" | "jsonl";

export function detectFormat(pathOrName: string): IRFormat {
  return pathOrName.endsWith(".jsonl") ? "jsonl" : "yaml";
}

export function parseIR(text: string, format: IRFormat): WorldIR {
  return format === "jsonl" ? fromJsonl(text) : fromDocument(parseYaml(text));
}
