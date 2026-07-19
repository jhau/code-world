# World IR Specification — v0.2

The World IR is the intermediate representation at the center of the codebase-world
system: a typed property graph describing what a codebase *is*, from which a stable
3D world is deterministically generated. Frontends (parsers or agents) emit IR;
the layout engine and theme bindings consume it. The IR never contains coordinates,
visuals, or prose — layout is computed downstream, appearance is bound by themes,
and narration lives in a separate layer.

This version consolidates the v0.1 draft with findings from two hand-compilations
(see spec/findings/). Changes from v0.1: added kinds `external` and `value`;
added relations `guards`, `accesses`, `error-flows`; added flow modes `temporal`
and `context`; made `source` optional; added framework contexts as a third plugin
surface; magnitudes store raw + normalized.

## Architecture

Frontends compile source into IR. A frontend is either *parsed* (tree-sitter
grammar plus symbol indexer — deterministic) or *agent-inferred* (an LLM reading
code, emitting IR with confidence scores — used where no parser exists or where
the fact is invisible to static analysis, such as temporal flows). Both emit the
same format; provenance distinguishes them.

The layout engine consumes only the containment tree and produces stable
positions. Layout is incremental across commits: existing entities keep their
positions; new entities are placed without disturbing neighbors. Spatial memory
is a core product feature and layout stability is its contract.

Theme contexts bind IR semantics to appearance. A theme maps kinds, roles,
relations, and magnitudes onto geometry, materials, and effects. Themes have no
access to layout and cannot introduce or suppress entities, which is what makes
user-supplied themes safe.

There are three plugin surfaces. A **language context** provides the parser
binding, the mapping of language-specific constructs onto IR (Tier 3), and a
prompt pack for agent frontends. A **framework context** (express, mongoose,
react, nest, spring…) pattern-matches framework idioms into roles and relations —
this is where most *meaning* comes from in real repos: entry points, guards,
data stores. A **theme context** binds semantics to appearance.

## Entities

Six kinds. The set is closed; extension happens through roles, not new kinds.

`repo` — the root. `container` — module, package, directory-as-namespace.
`unit` — a file. `callable` — function, method, procedure. `datashape` — class,
interface, struct, record, enum, alias (attribute `shape_class` distinguishes).
`value` — an exported runtime instance that is neither callable nor datashape
(model handles, routers, singletons). `external` — anything beyond the repo:
stdlib, packages, runtime config keys; grouped by `ecosystem`, excluded from the
containment tree, rendered as terrain beyond the city.

Common attributes: `id` (see Identity), `contains_parent` (every non-repo,
non-external entity has exactly one), `exported` (boolean; exportedness is a
flag, never a kind), `roles` (open vocabulary contributed by framework and
language contexts: http-entry, http-guard, http-router, data-store, error-type,
app-entry, cli-entry, serialized-contract, request-context…), `anonymous`
(true when the entity was promoted from an unnamed construct and its name is
synthetic), `magnitudes`, `behavior`, `source`, `provenance`, `fingerprint`.

Anonymous promotion rule: an anonymous callable becomes an entity if it crosses
an entity boundary (is passed to another module or external) or carries a role.
Otherwise it folds into its parent's behavior skeleton. Promoted entities get
synthetic names; renaming them meaningfully is a narrative-layer job.

Classes are datashapes that may contain callables: the containment tree descends
through datashapes (a class renders as a building whose methods are rooms).

## Relations

One tree relation and several graph relations. `contains` (encoded as
`contains_parent`) is a strict tree and is the *only* input to spatial layout.
Graph relations render as connections and never move buildings:

`depends-on` (unit → unit or external; import graph). `calls` (callable →
callable; attributes: `awaited`, `instantiates`). `flows-into` (typed dataflow;
see Flows). `error-flows` (raise-site → catch-site, with `through:` listing
transited callables; local catch-alls produce no inter-entity edges — the
absence is itself a signal). `guards` (guard callable → guarded callable;
framework-mediated control flow, not a call). `accesses` (callable → value with
role data-store; `mode: read|write`). `extends`, `implements`, `references`
(type-system and miscellaneous reference edges). `re-exports` (barrel files;
identity stays with the defining module — provisional, unverified at scale).

## Flows

`flows-into` carries: `shape` (the datashape moving), `from`/`to`, `precision`
(`type` — derivable from signatures; `value` — requires dataflow analysis; ship
type-level first), `via` (parameter, return, request-mutation, serialized-token…),
and `mode`. Modes: *(default)* ordinary intra-process flow; `capability` —
dependency injection: a capability handed over, not data moving (traced-path
queries exclude these from cargo routes); `temporal` — the value is serialized,
leaves the system, and re-enters later (JWTs, queues, caches, webhooks, DB
round-trips; carries `medium`; typically agent-inferred since no def-use chain
connects the ends); `context` — implicit channel through a request/ambient
context object written by one entity and read by others.

## Magnitudes

Continuous attributes on entities and edges: size, complexity, fan_in, fan_out,
and git-derived churn, recency, author-diversity. Every magnitude stores both
`raw` and `norm` (repo-relative [0,1]). Diffing compares raw; themes consume
norm. Storing only normalized values is forbidden — normalization shifts when
anything else changes, producing phantom diffs.

## Behavior skeletons

A callable's `behavior` is a nested list of regions — branch (with `arms`),
loop, error-path (`raises`/`catches`, `handled`, `terminal`), async-boundary,
side-effect (`effect`: state-mutation, db-read, db-write, network-io…; with
`target` where known) — not an AST. Regions nest. Skeletons feed the near-field
zoom (corridors, drains, bridges); actual logic renders as source text at the
closest zoom via `source` spans. Depth cap for very long functions: unresolved,
revisit with a real parser.

## Identity, fingerprints, diffs

Primary id is the semantic path: `sym:<container-path>#<Name>` (methods:
`#Class.method`), `unit:<path>`, `dir:<path>`, `external:<ecosystem-path>`.
Never line numbers. Each entity stores a content `fingerprint`; the differ uses
name-path plus fingerprint similarity to emit `renamed`/`moved` rather than
`destroyed`+`created`. IRDiff (created, destroyed, renamed, moved, magnitude
changes, edge rewires) is a first-class format — it drives construction
animation, staleness flags, review views, and weathering. The annotation layer
anchors to entity ids and rides through renames via the differ.

## Provenance

On every entity and relation: `parsed` (deterministic), `indexed` (symbol
resolver), `inferred` (agent; carries `confidence` and optionally the context
pack used), `asserted` (human). Inferred facts may lack precise `source` spans
(`source` is optional); themes must render "no interior yet" gracefully. When a
parsed frontend later covers the same code, it re-grounds the same entity ids
and upgrades provenance in place.

## Serialization

Design format is YAML for readability; production format is streamable JSONL,
one entity or relation per line, so renderers build the world progressively.
Full resolution always: no pre-aggregated rollups in the IR; district-level
summaries are derived views computed deterministically downstream.

## Open questions

Barrel/re-export handling at scale; generics (`Map<string, Order>` →
`references` with type-argument tag, unverified); behavior-skeleton depth cap;
indexing strategy for traced-path queries over high-fan-in shapes; incremental
layout algorithm selection; monorepo cross-project externals.
