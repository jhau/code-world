import { ENTITY_KINDS, RELATION_TYPES, type WorldIR } from "./types";

export interface ValidationResult {
  /** Fatal problems: the world cannot be laid out. */
  errors: string[];
  /** Non-fatal problems: the world renders, degraded. */
  warnings: string[];
}

const KIND_SET = new Set<string>(ENTITY_KINDS);
const RELATION_SET = new Set<string>(RELATION_TYPES);

export function validateIR(ir: WorldIR): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map<string, (typeof ir.entities)[number]>();

  for (const e of ir.entities) {
    if (!e.id) errors.push(`entity with missing id (kind=${e.kind || "?"})`);
    else if (byId.has(e.id)) errors.push(`duplicate entity id: ${e.id}`);
    else byId.set(e.id, e);
    if (!KIND_SET.has(e.kind)) errors.push(`${e.id}: unknown kind "${e.kind}"`);
  }

  const roots = ir.entities.filter((e) => e.kind === "repo");
  if (roots.length !== 1) {
    errors.push(`expected exactly one repo entity, found ${roots.length}`);
  }

  for (const e of ir.entities) {
    if (e.kind === "repo" || e.kind === "external") {
      if (e.contains_parent !== undefined) {
        warnings.push(`${e.id}: ${e.kind} entities must not have contains_parent`);
      }
      continue;
    }
    if (e.contains_parent === undefined) {
      errors.push(`${e.id}: missing contains_parent`);
    } else if (!byId.has(e.contains_parent)) {
      errors.push(`${e.id}: unknown contains_parent "${e.contains_parent}"`);
    }
  }

  // Containment must be a strict tree: walk to root from each entity.
  for (const e of ir.entities) {
    const seen = new Set<string>([e.id]);
    let cur = e.contains_parent;
    while (cur !== undefined) {
      if (seen.has(cur)) {
        errors.push(`containment cycle through ${cur}`);
        break;
      }
      seen.add(cur);
      cur = byId.get(cur)?.contains_parent;
    }
  }

  for (const r of ir.relations) {
    const label = `relation ${r.type} ${r.from} -> ${r.to}`;
    if (!RELATION_SET.has(r.type)) warnings.push(`${label}: unknown type`);
    if (!byId.has(r.from)) warnings.push(`${label}: unknown "from" entity`);
    if (!byId.has(r.to)) warnings.push(`${label}: unknown "to" entity`);
  }

  return { errors, warnings };
}
