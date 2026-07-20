# Finding 006 — Master plans govern composition; the filesystem moves underground

Context: design discussion on Renderer M1. The petstore world places
`sym:src/routes/api/user#router` beside `#registerUser` because both live in
`unit:src/routes/api/user.ts`. File proximity is an accident of the compilation
unit, not a semantic statement; the world inherited a filesystem limitation it
does not have. This finding records the redesign agreed to resolve that, and
amends the spec's layout rule.

## Decisions

### 1. Containment composition is governed by a master plan

The IR remains pure facts and nobody edits it. A **master plan** is a new
first-class input artifact: a deterministic data file of grouping rules that
shapes the containment tree *above the entity level* before layout runs.
Layout is a pure function of **(IR, plan)** — the plan is part of the input,
so determinism and layout stability are preserved per plan.

A plan may:

- declare logical containers (e.g. `logical:api-gateway`) with a structural
  hint (`form: building` → members render as departments/rooms of one
  building; `form: district` → members render as buildings on a shared
  district) and an optional placement prior (e.g. `placement: gate`);
- re-parent entities into those containers via ordered selectors over IR
  facts (roles first; path patterns and tags later). First match wins;
  unmatched entities keep their IR containment parent.

A plan may **not**: create or suppress entities (every IR entity renders
exactly once), touch relations, or set coordinates. This is the same safety
rail the spec already imposes on themes, and it is what keeps "geometry
cannot lie" intact: two architects' plans produce structurally different
cities, but the cast and the script — entities, calls, flows, guards — are
identical, and a traced path lights up the same edges in both.

Framework contexts stop being containment authorities and instead **ship
default master plans** (the express context's default plan groups
`http-router`/`http-entry` entities into a gateway). Creators override by
editing the plan. Plans are versioned files intended to live in-repo
(`.world/plan.yaml` eventually; for now `examples/<world>/world.plan.yaml`
beside the IR), so the official world evolves through code review while
personal plans can exist alongside. Switching plans resets spatial memory by
design — the stability contract is per (IR history, plan).

Group form is stated explicitly in the plan, never derived from magnitude
thresholds: auto-switching a gateway from building to district when route
count crosses a line would reorganize the district and break spatial memory.
Rezoning is a deliberate human act.

### 2. Entities re-parent individually; the file is not a geometry rule

`unit = file = plot` stops being a layout invariant. A route handler moves to
the gateway while its file-mate helpers stay in their module district,
connected by `calls` roads. `source.file` remains the authoritative pointer
back to the code (info panel, GitHub links — finding 005).

### 3. The filesystem renders as the underground stratum

The file truth is not deleted; it is relocated to where it belongs in the
city metaphor: the substrate. The street grid is the lived semantics of the
city; the underground — pipes, vaults, eventually a metro — is the physical
storage layer that editors and git actually operate on.

v0 (**foundation pipes**): derived entirely from `source.file`, no IR change.
An x-ray toggle makes the ground translucent; entities sharing a source file
get foundation shafts descending to a shared horizontal pipe run beneath the
city, one run per file, deterministic routing and ordering. Answers "what
else lives in this file?" at a glance.

Deferred ambitions, in order: file vaults (units as underground chambers,
directories as tunnel networks — the existing filesystem treemap rendered at
y < 0), then the metro (files as stations, directories as lines — navigable
legacy navigation for IDE-native spatial memory). Git events are file-grained
and therefore substrate events: construction/churn animation propagating up
from the underground is a natural extension.

## Spec impact (v0.3 amendments)

1. Layout consumes the containment tree **as composed by the master plan**,
   and may use entity kinds and roles as placement priors. The load-bearing
   half of the old rule is retained verbatim: **graph relations never
   influence position.**
2. The master plan joins language/framework/theme contexts as an input
   surface. Framework contexts contribute *default* plans.
3. `unit` is no longer privileged as a geometry rule; it remains an IR kind
   and gains a rendering home in the underground stratum.

## Rationale

- The spec already says framework contexts are "where most meaning comes
  from"; roles like `http-entry` were computed and then spatially ignored.
- Stability, the product contract, favors semantics: file renames/moves/splits
  are constant refactors that change nothing about behavior yet would relocate
  buildings; a handler's role and route are far more durable than its path.
  When a semantic placement does move, the move is meaningful.
- Vertical strata give each layer of truth a home: dataflow routes above,
  static structure at street level, physical storage below. (Whether the
  *sky* is the right home for dataflow is doubted — see open questions.)

## Open questions

- Sky-dataflow doubt (raised by the creator, deliberately deferred): elevated
  lit routes for `flows-into` may not be the right binding once the strata
  exist. Revisit when the underground renders.
- Plan schema growth: selector vocabulary (path globs, tags, magnitudes?),
  nested logical containers, multiple plans per repo and how the renderer
  chooses.
- Per-plan spatial memory: how the differ and annotation anchors behave when
  the active plan changes.
- Whether default plans shipped by framework contexts are merged or replaced
  when a creator plan exists (v0: creator plan replaces).
