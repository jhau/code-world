import type { Entity, WorldIR } from "../ir/types";
import type { Plan, PlanGroup } from "./types";

const ELIGIBLE_KINDS = new Set<Entity["kind"]>(["callable", "datashape", "value"]);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`plan invariant: ${message}`);
}

function matchesGroup(entity: Entity, group: PlanGroup): boolean {
  return group.select.some((selector) =>
    selector.roles.some((role) => entity.roles.includes(role)),
  );
}

export function applyPlan(ir: WorldIR, plan: Plan): WorldIR {
  const roots = ir.entities.filter((entity) => entity.kind === "repo");
  invariant(roots.length === 1, `expected exactly one repo root, found ${roots.length}`);
  const root = roots[0]!;
  const inputById = new Map(ir.entities.map((entity) => [entity.id, entity]));
  invariant(inputById.size === ir.entities.length, "input entity ids must be unique");

  const groupIds = new Set<string>();
  for (const group of plan.groups) {
    invariant(!groupIds.has(group.id), `duplicate group id "${group.id}"`);
    invariant(!inputById.has(group.id), `group id collides with entity "${group.id}"`);
    groupIds.add(group.id);
    const parent = inputById.get(group.parent ?? root.id);
    invariant(parent !== undefined, `${group.id} has unknown parent "${group.parent}"`);
    invariant(
      parent.kind === "repo" || parent.kind === "container" || parent.kind === "unit",
      `${group.id} parent "${parent.id}" cannot contain a v0 plan group`,
    );
  }

  const membersByGroup = new Map(plan.groups.map((group) => [group.id, [] as string[]]));
  const entities = ir.entities.map((entity) => {
    const group = ELIGIBLE_KINDS.has(entity.kind)
      ? plan.groups.find((candidate) => matchesGroup(entity, candidate))
      : undefined;
    if (!group) return { ...entity, attrs: { ...entity.attrs } };
    membersByGroup.get(group.id)!.push(entity.id);
    return { ...entity, contains_parent: group.id, attrs: { ...entity.attrs } };
  });

  const retainedGroups = plan.groups.filter((group) => membersByGroup.get(group.id)!.length > 0);
  for (const group of retainedGroups) {
    entities.push({
      id: group.id,
      kind: "container",
      contains_parent: group.parent ?? root.id,
      roles: [],
      magnitudes: {},
      provenance: { method: "asserted" },
      attrs: {
        plan_form: group.form,
        plan_label: group.label,
        ...(group.placement === undefined ? {} : { plan_placement: group.placement }),
      },
    });
  }

  const outputIds = entities.map((entity) => entity.id);
  invariant(new Set(outputIds).size === outputIds.length, "output entity ids must be unique");
  for (const entity of ir.entities) {
    invariant(
      outputIds.filter((id) => id === entity.id).length === 1,
      `input entity "${entity.id}" must appear exactly once`,
    );
  }
  const createdIds = outputIds.filter((id) => !inputById.has(id));
  invariant(
    createdIds.length === retainedGroups.length &&
      createdIds.every((id) => retainedGroups.some((group) => group.id === id)),
    "only retained group containers may be created",
  );
  const result: WorldIR = { meta: ir.meta, entities, relations: ir.relations };
  invariant(result.relations === ir.relations, "relations must not be modified");
  for (const group of plan.groups) {
    if (membersByGroup.get(group.id)!.length === 0) {
      invariant(!outputIds.includes(group.id), `empty group "${group.id}" must be dropped`);
    }
  }
  return result;
}
