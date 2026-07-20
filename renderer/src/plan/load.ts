import { parse as parseYaml } from "yaml";
import type { Plan, PlanForm, PlanGroup, PlanPlacement, PlanSelector } from "./types";

export class PlanParseError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PlanParseError(`${path} must be a non-empty string`);
  }
  return value;
}

function parseSelector(value: unknown, path: string): PlanSelector {
  if (!isRecord(value)) throw new PlanParseError(`${path} must be a mapping`);
  if (!Array.isArray(value.roles) || value.roles.length === 0) {
    throw new PlanParseError(`${path}.roles must be a non-empty list`);
  }
  const roles = value.roles.map((role, index) => requiredString(role, `${path}.roles[${index}]`));
  return { roles };
}

function parseGroup(value: unknown, index: number): PlanGroup {
  const path = `groups[${index}]`;
  if (!isRecord(value)) throw new PlanParseError(`${path} must be a mapping`);
  const form = requiredString(value.form, `${path}.form`);
  if (form !== "building" && form !== "district") {
    throw new PlanParseError(`${path}.form must be "building" or "district"`);
  }
  let placement: PlanPlacement | undefined;
  if (value.placement !== undefined) {
    const parsed = requiredString(value.placement, `${path}.placement`);
    if (parsed !== "gate") throw new PlanParseError(`${path}.placement must be "gate"`);
    placement = parsed;
  }
  if (!Array.isArray(value.select) || value.select.length === 0) {
    throw new PlanParseError(`${path}.select must be a non-empty list`);
  }
  return {
    id: requiredString(value.id, `${path}.id`),
    label: requiredString(value.label, `${path}.label`),
    form: form as PlanForm,
    ...(placement === undefined ? {} : { placement }),
    ...(value.parent === undefined
      ? {}
      : { parent: requiredString(value.parent, `${path}.parent`) }),
    select: value.select.map((selector, selectorIndex) =>
      parseSelector(selector, `${path}.select[${selectorIndex}]`),
    ),
  };
}

export function parsePlan(text: string): Plan {
  let document: unknown;
  try {
    document = parseYaml(text);
  } catch (error) {
    throw new PlanParseError(`invalid YAML (${String(error)})`);
  }
  if (!isRecord(document)) throw new PlanParseError("plan document is not a mapping");
  if (String(document.version) !== "0.1") {
    throw new PlanParseError(`unsupported plan version "${String(document.version)}"`);
  }
  if (!Array.isArray(document.groups)) {
    throw new PlanParseError("groups must be a list");
  }
  const groups = document.groups.map(parseGroup);
  const ids = new Set<string>();
  for (const group of groups) {
    if (ids.has(group.id)) throw new PlanParseError(`duplicate group id "${group.id}"`);
    ids.add(group.id);
  }
  return {
    version: "0.1",
    name: requiredString(document.name, "name"),
    groups,
  };
}

export function planPathForIR(path: string): string | null {
  const match = /^(.*)\.ir\.(?:yaml|yml)([?#].*)?$/.exec(path);
  return match ? `${match[1]}.plan.yaml${match[2] ?? ""}` : null;
}
