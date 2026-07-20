export type PlanForm = "building" | "district";
export type PlanPlacement = "gate";

export interface PlanSelector {
  roles: string[];
}

export interface PlanGroup {
  id: string;
  label: string;
  form: PlanForm;
  placement?: PlanPlacement;
  parent?: string;
  select: PlanSelector[];
}

export interface Plan {
  version: "0.1";
  name: string;
  groups: PlanGroup[];
}
