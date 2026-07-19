# Finding 003 — Renderer: customs entities render as city gates, not buildings

Context: Renderer M1, petstore world. Follows the metaphor work that turned
`accesses` into warehouse logistics and temporal `flows-into` into permit
circuits through a city gate.

## Decision

An entity that receives temporal flows (a "customs" point — petstore's
`authMiddleware`) renders as a **gate in the city wall** instead of a building
in its district. The redundant building is suppressed:

- **Layout is untouched.** The entity keeps its slot in the containment
  layout (its plot still reserves the footprint). Determinism, spatial
  stability, and IRDiff behavior are unaffected; only mesh creation skips it.
- All of the entity's edges re-anchor to the gate: revealed context/ordinary
  flows draw from the gate, permit circuits end their inbound leg at the
  gate, click-to-inspect and trace glow target the gate structure.
- Its footprint is released from the street grid (nothing to route around).

## Rationale

After the gate exists, a separate in-district building for the same entity is
a double representation: two places claim to "be" the middleware, and the
building is the less truthful one (the middleware acts at the boundary, not
in a district office). One entity, one landmark.

## Spec tension to note

- "Layout derives only from the containment tree" — still true; this is a
  rendering suppression, not a layout change.
- "Themes cannot introduce or suppress entities" — also still true: this is
  core renderer semantics driven by IR facts (temporal-flow receivership),
  not a theme decision. Themes still cannot suppress anything.
- Open question for the spec: should "representation relocation" (entity
  rendered at a boundary landmark rather than as a district building) become
  a first-class, IR-driven concept (e.g. a role like `boundary-infra`) rather
  than a renderer heuristic keyed off temporal-flow receivership? Revisit
  when a second case appears (message-queue consumers, webhook receivers).

## Addendum: exits are unchecked (posterns)

The customs gate only inspects *inbound* traffic — the middleware never sees
responses. Routing outbound permit circuits through the customs gate implied
exit control that does not exist. Corrected model:

- Each temporal-flow **issuer** gets an unguarded **postern** (small plain
  opening, no towers, no lock) in the wall nearest its own building —
  responses leave wherever they were issued, uninspected.
- Re-entry remains exclusively through the customs gate.
- The asymmetry (humble unchecked exits, one imposing checked entrance) is
  itself the rendering of the security model.
- Posterns dedupe per issuer and nudge deterministically along the wall to
  clear the gate and each other. Issuer buildings are NOT suppressed — a
  postern is the issuer's exit chute, not its representation.
