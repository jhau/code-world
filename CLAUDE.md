# codebase-world

A system that compiles codebases into stable, explorable 3D worlds that serve as
living documentation — built for the agent era, where most code is written by
agents and every developer is permanently "new" to most of the codebase.

## Vision (agreed in design discussions — do not silently deviate)

- **Compiler architecture**: language/framework frontends → universal World IR →
  deterministic incremental layout → theme-bound rendering. The IR is the spec
  center: `spec/world-ir-v0.2.md`. Read it before touching anything.
- **Geometry cannot lie**: layout derives ONLY from the containment tree.
  Graph relations (calls, flows, guards, accesses) render as connections and
  never influence position. Layout is stable across commits (spatial memory is
  a product feature).
- **Three layers, three owners**: compiled geometry (deterministic), agent
  narrative (cited, revalidated per commit), human knowledge (anchored to
  entity ids, signed, agent-audited). Provenance is visible everywhere.
- **Three plugin surfaces**: language contexts, framework contexts (where most
  meaning comes from: entries, guards, stores), theme contexts (bind semantics
  to appearance; no access to layout).
- **Level-of-detail**: world → district (typed contracts) → traced path (a
  value's journey) → surface (actual code text). Never render statement-level
  logic as permanent geometry.
- The **traced path** experience is the bet-the-product feature: click a shape
  or callable, see its full upstream/downstream flow as a lit, persistent route.

## Repo layout

- `spec/world-ir-v0.2.md` — the IR spec (authoritative)
- `spec/findings/` — hand-compilation findings that shaped the spec
- `examples/toyshop/` — 5-file hand-built TS repo + its hand-compiled IR
  (`world.ir.yaml`, provenance: parsed-equivalent)
- `examples/petstore/` — reconstructed mongoose-express-ts repo + IR
  (provenance: inferred; see README-RECONSTRUCTION.md). Ideal demo world:
  7 http entries, 1 guard checkpoint, 2 data stores, temporal JWT flow.
- `renderer/` — the Three.js renderer (Milestone 1 target, see ROADMAP.md)

## Current milestone: Renderer M1

Build a browser renderer (Vite + TypeScript + Three.js) that:
1. Loads and validates a `world.ir.yaml` / `.jsonl` file
2. Computes a stable layout from the containment tree (treemap-style nesting:
   districts for containers, plots for units, buildings for callables/datashapes/
   values; deterministic given identical IR — same input, same world)
3. Renders: containers as districts, units as plots, callables/datashapes as
   buildings (height ← magnitudes.size/complexity.norm), `depends-on` as roads,
   `guards` as checkpoints, `accesses` as marked paths (read/write styles),
   `flows-into` as elevated/lit routes, externals as terrain beyond a city wall
4. First-person or orbit navigation; click an entity → info panel showing id,
   kind, roles, provenance, and source span
5. Traced-path v0: click a datashape → light up all its flows-into routes

Use `examples/petstore/world.ir.yaml` as the primary test input and
`examples/toyshop/world.ir.yaml` as the secondary.

## Conventions

- TypeScript strict everywhere; renderer has no backend (static files + IR input)
- Entity ids are opaque strings to the renderer; never parse meaning out of them
  beyond the `kind:` prefix
- Theme = a data file binding semantics → appearance; hardcode ONE default theme
  in M1 but keep the binding table in a single module so themes can be extracted
- Any deviation from the spec must be recorded in `spec/findings/` with rationale

## How to work
- Fable 5 is the brain, the project manager, you should discuss high level idea with me. Use codex as your limbs, the software developer to do all the implementation tasks.
- Please use the codex-chrome skill when you need to use the browser to complete any task