// The ONE default theme for M1: a single binding table from IR semantics
// (kinds, roles, ecosystems) to appearance. Themes never see layout and can
// neither introduce nor suppress entities — keep every binding in this module
// so themes can later be extracted to data files.

export interface RouteStyle {
  /** "arc": elevated tube. "road": flat ribbon draped over the city ground.
   * "lane": street-routed delivery lane with animated carts (accesses). */
  form: "arc" | "road" | "lane";
  color: number;
  /** Arc apex height above the taller endpoint (unused for roads). */
  apex: number;
  /** Tube radius for arcs; ribbon half-width for roads. */
  radius: number;
  opacity: number;
  /** Human label for the HUD legend. */
  label: string;
}

export interface Theme {
  background: number;
  fog: { color: number; near: number; far: number };
  ground: number;
  wall: number;
  kind: Record<string, number>;
  /** Role accents override kind color; first matching role wins. */
  roles: Record<string, number>;
  ecosystems: Record<string, number>;
  ecosystemDefault: number;
  selection: number;
  /** Connection styles keyed by relation type (with mode variants). */
  routes: Record<string, RouteStyle>;
  /** Guarded entrances render as a locked door on the building wall. */
  guardDoor: { panel: number; lock: number };
  /** Data stores are warehouses: crates at the dock, carts on the lanes. */
  warehouse: { crate: number; cartBody: number };
  /** Temporal customs: gate towers in the wall, permits, the client camp. */
  gate: { tower: number; lintel: number };
  permit: { card: number; seal: number; tent: number };
  /** Unguarded exit chutes where issued permits leave the city. */
  postern: { frame: number };
  /** Fixed furniture around role-colored document sheets. */
  schematic: { frame: number; pedestal: number };
  /** Filesystem foundation pipes shown only in x-ray mode. */
  underground: {
    shaftRadius: number;
    pipeRadius: number;
    opacity: number;
    surfaceOpacity: number;
    palette: number[];
  };
}

export const defaultTheme: Theme = {
  background: 0x0b0e14,
  fog: { color: 0x0b0e14, near: 40, far: 160 },
  ground: 0x0e1118,
  wall: 0x3a4257,
  kind: {
    repo: 0x161b26,
    container: 0x1f2634,
    unit: 0x2b3348,
    callable: 0x8593ad,
    datashape: 0x9b8cc4,
    value: 0x74b394,
    external: 0x5c554a,
  },
  roles: {
    "app-entry": 0xe8d56a,
    "http-entry": 0xe0a94f,
    "http-guard": 0xd45f5f,
    "http-router": 0xc98a54,
    "cli-entry": 0xe8d56a,
    "data-store": 0x4fc2b8,
    "error-type": 0xd45f5f,
    "serialized-contract": 0xc47fd4,
    "request-context": 0x9fb4d6,
  },
  ecosystems: {
    npm: 0x8a5a45,
    "node-stdlib": 0x6d7a52,
    "ecma-stdlib": 0x6d7a52,
    "runtime-config": 0xb0a04a,
  },
  ecosystemDefault: 0x5c554a,
  selection: 0xffffff,
  routes: {
    "depends-on": { form: "road", color: 0x4d5975, apex: 0, radius: 0.18, opacity: 0.9, label: "depends-on (road)" },
    calls: { form: "arc", color: 0xaab6cc, apex: 1.0, radius: 0.045, opacity: 0.75, label: "calls" },
    guards: { form: "arc", color: 0xd9b44a, apex: 1.4, radius: 0.06, opacity: 0.9, label: "guards (locked door)" },
    "accesses-read": { form: "lane", color: 0x4fc2b8, apex: 0, radius: 0.07, opacity: 0.8, label: "read: cart from warehouse" },
    "accesses-write": { form: "lane", color: 0xe0a94f, apex: 0, radius: 0.07, opacity: 0.8, label: "write: cart to warehouse" },
    "flows-into": { form: "arc", color: 0xc47fd4, apex: 2.2, radius: 0.08, opacity: 0.85, label: "flows-into" },
    "flows-temporal": { form: "lane", color: 0x5fd4e8, apex: 0, radius: 0.055, opacity: 0.45, label: "permit: JWT circuit via gate" },
    "flows-context": { form: "arc", color: 0x9fb4d6, apex: 1.8, radius: 0.07, opacity: 0.8, label: "flow: context" },
    "flows-capability": { form: "arc", color: 0x6b7690, apex: 1.6, radius: 0.05, opacity: 0.25, label: "flow: capability" },
    "error-flows": { form: "arc", color: 0xa83232, apex: 1.2, radius: 0.05, opacity: 0.8, label: "error-flows" },
  },
  guardDoor: { panel: 0x2b2118, lock: 0xd9b44a },
  warehouse: { crate: 0x9c7a4e, cartBody: 0x3a4152 },
  gate: { tower: 0x525d73, lintel: 0xd9b44a },
  permit: { card: 0x5fd4e8, seal: 0xd9b44a, tent: 0x566070 },
  postern: { frame: 0x475064 },
  schematic: { frame: 0x46566f, pedestal: 0x4b4138 },
  underground: {
    shaftRadius: 0.025,
    pipeRadius: 0.045,
    opacity: 0.9,
    surfaceOpacity: 0.2,
    palette: [0x5fd4e8, 0xc47fd4, 0xe0a94f, 0x4fc2b8, 0x9fb4d6, 0xd45f5f],
  },
};

/** Style key for a relation, or null when the relation is not drawn (M1
 * skips references/extends/implements/re-exports). */
export function routeKeyFor(type: string, mode: string | undefined): string | null {
  switch (type) {
    case "depends-on":
    case "calls":
    case "guards":
    case "error-flows":
      return type;
    case "accesses":
      return mode === "write" ? "accesses-write" : "accesses-read";
    case "flows-into":
      if (mode === "temporal") return "flows-temporal";
      if (mode === "context") return "flows-context";
      if (mode === "capability") return "flows-capability";
      return "flows-into";
    default:
      return null;
  }
}

export function colorFor(theme: Theme, kind: string, roles: string[]): number {
  for (const role of roles) {
    const c = theme.roles[role];
    if (c !== undefined) return c;
  }
  return theme.kind[kind] ?? 0x888888;
}

export function externalColor(theme: Theme, ecosystem: string | undefined): number {
  return (ecosystem && theme.ecosystems[ecosystem]) || theme.ecosystemDefault;
}

export function foundationColor(theme: Theme, file: string): number {
  let hash = 2166136261;
  for (let i = 0; i < file.length; i++) {
    hash ^= file.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return theme.underground.palette[(hash >>> 0) % theme.underground.palette.length]!;
}
