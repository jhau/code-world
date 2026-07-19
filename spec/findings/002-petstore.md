# Hand-Compilation Findings #2 — PetStore (mongoose-express-ts) → IR v0.1

A real framework-heavy repo stressed the vocabulary very differently from the
hand-built toy. Findings ordered by how much they matter to the spec.

## 1. Framework contexts are a third plugin surface (the big one)

The most important structure in this repo is invisible to pure language
analysis. That `router.post("/", [...], handler)` creates an HTTP entry at
POST /api/user; that the `auth` argument makes it a *guarded* entry; that
`model("User", schema)` creates a persistent store — none of this is
TypeScript knowledge, it is **Express knowledge** and **Mongoose knowledge**.
Without it the world compiles to "a bunch of anonymous functions passed to
library calls" — technically true, semantically empty.

Conclusion: alongside language contexts and theme contexts, the architecture
needs **framework contexts** (express, mongoose, react, nest, spring, rails…)
that pattern-match idioms into IR roles and relations. These are also the
natural unit of agent assistance: an agent given the express context prompt
pack can recognize variants a rule-based matcher would miss.

## 2. New relation: `guards` (middleware is not `calls`)

The auth middleware is executed *before* handlers by the framework; no
call edge exists in the source. Modeled as `guards` edges (middleware →
handler) plus a `guarded_by` convenience on the handler. Rendering payoff is
large: a checkpoint on the road into four of seven entries makes the repo's
security model visible at a glance — including the entry that *isn't* guarded
(GET /api/profile is public: instantly visible, instantly reviewable).

## 3. New relation: `accesses` (read/write to stores)

Handlers touching Mongoose models are better modeled as `accesses {read|write}`
edges to a store than as calls to `.findOne`/`.save`. This is what makes the
"who can write to Users?" question a one-glance answer in the world.

## 4. New kind: `value` — exported runtime instances

`User`, `Profile` (model handles) and the three routers are exported *values*:
not callables, not datashapes. Third top-level kind added. Roles carry their
meaning: `data-store` (from mongoose context), `http-router` (from express
context). The alternative — forcing them into datashape — broke identity for
`User` (interface IUser and value User coexist in one file with distinct fan-in).

## 5. Temporal flows: values that leave and re-enter the system

`Payload` is serialized into a JWT at login, exits the process entirely, and
re-enters requests later where the middleware deserializes it. No def-use
chain connects the two ends, yet this is the single most important dataflow
in the app. Modeled as `flows-into { mode: temporal, via: serialized-token,
medium: jsonwebtoken }`, agent-inferred at 0.9 confidence. Same pattern covers
queues, caches, webhooks, DB round-trips — ubiquitous in real systems, and a
place where the agent frontend adds value no static analyzer can.

## 6. Request-context flow

Middleware writes `req.userId`; guarded handlers read it. The type
augmentation (`AuthRequest extends express.Request`) is the *declared*
contract for this implicit channel. New flow mode `context`. Repos without
the type declaration would need pure inference here — the typed version is
exactly why "well-typed code compiles to a better world."

## 7. Config keys are hidden coupling — surface them

`config.get("jwtSecret")` appears in three files. Stringly-typed, no import
connects them. Modeled as `external` entities in a `runtime-config` ecosystem
with `references` edges: three buildings tapping one utility line. Changing a
config key's semantics is a classic action-at-a-distance bug; the world can
make the blast radius literally visible.

## 8. Anonymous-promotion at scale — the rule held, naming is the cost

Every route handler in the repo is an anonymous closure; the promotion rule
(cross-boundary OR carries a role) fired 8 times and produced the right
entities. But every name is synthetic (`registerUser`, `getMyProfile`).
Naming inferred-entity is a narrative-layer job; geometry stores only the
synthetic id + `anonymous: true`. Nested anonymous callbacks (the `jwt.sign`
callback) correctly did NOT promote — they fold into parent behavior.

## 9. Local catch-alls: the absence of drainage is a signal

Every handler wraps its body in try/catch → 500. Unlike the toy repo, no
error flows cross entities. A world rendering this shows no inter-building
drainage — itself informative (errors can't propagate, but also: failures
are handled uniformly and shallowly). Comparative reading between repos
becomes possible.

## 10. Provenance:inferred exercised for real — spans are the casualty

GitHub blocked deep fetch; the frontend was forced into full inference mode.
It worked, but revealed: inferred facts have approximate or missing source
spans, which degrades the closest zoom level (surface = actual code text).
Spec consequence: `source` must be optional, and themes need a rendering for
"building with no interior yet" — resolved the moment a parsed frontend or
repo checkout becomes available and re-grounds the same entity ids.

## Deltas applied to the spec

New kind: `value`. New relations: `guards`, `accesses{read|write}`.
New flow modes: `temporal` (+ via/medium), `context`. New plugin surface:
framework contexts. New entity attrs: `http{method,path}`, `mounted_at`,
`stores_shape`, `guarded_by`, `fields_inferred`. `source` now optional.

## Verdict

The core (entities/relations/magnitudes/provenance + containment-drives-layout)
survived contact with a real repo unchanged. What grew was the periphery —
and every addition came from framework semantics, not language semantics.
The spec's center of gravity has shifted: language contexts get you a correct
world; framework contexts get you a *meaningful* one.
