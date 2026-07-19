# Roadmap

## M1 — Static world renderer (current)
Vite + TS + Three.js app that loads an IR file and renders a navigable world:
treemap-nested districts from the containment tree, buildings with
magnitude-driven height, roads/checkpoints/routes for graph relations,
externals as terrain beyond the wall, click-to-inspect, and traced-path v0
(light up a shape's flows). Deterministic layout: same IR → same world.
Test inputs: examples/petstore, examples/toyshop.

## M2 — Real frontend
tree-sitter based TypeScript frontend + express/mongoose framework contexts
emitting IR JSONL from any repo checkout. Re-ground the petstore example with
parsed provenance and compare against the hand-compiled IR (accuracy report →
spec/findings/003).

## M3 — Time
IRDiff implementation; render diffs as construction/renovation/weathering.
Incremental layout (new entities placed without disturbing neighbors).

## M4 — Narrative layer
Agent pass generating names, plaques, one guided tour, scoped NPC briefings
as structured JSON with citations to entity ids; staleness stamps against
commits.

## M5 — Knowledge layer
.world/ annotation store (anchored, signed, agent-audited), IDE-side capture,
in-world placement.
