# Hand-Compilation Findings — toyshop → world IR v0.1

Compiling even a 5-file repo surfaced eight places where the draft vocabulary
had to bend. Each finding below states the tension and the resolution now
reflected in `world.ir.yaml`.

## 1. Classes break the clean callable/datashape split

`OrderStore` is a datashape (it defines the shape of a thing) that *contains*
callables (its methods). The original design assumed the containment tree ran
repo → container → unit → declaration and stopped. Resolution: the `contains`
tree is allowed to descend through datashapes. Spatially this is natural — a
class renders as a building whose methods are rooms/floors — and it means
method identity comes out clean: `sym:src/db#OrderStore.save`.

## 2. "interface-point" is not an entity kind

The draft had exported symbols as their own entity kind. In practice every
export is just an existing entity with `exported: true`. A separate kind would
have doubled entities and created identity ambiguity. Exportedness is a flag;
themes render it (a door on the street vs. an interior door) without a new noun.

## 3. Anonymous callables need a promotion rule

The HTTP request handler is an anonymous closure. Rule adopted: an anonymous
callable is **promoted to an entity** if it (a) crosses an entity boundary
(passed to another module/external), or (b) carries a role (here: http-entry).
Otherwise it folds into its parent's behavior skeleton. Without promotion, this
repo's most important callable — its only entry point — would not exist in the
world. Promoted entities get synthetic names (`requestHandler`) with
`anonymous: true` so the narrative layer knows the name is invented.

## 4. Constructor calls are `calls` with a tag, not a new edge type

`new OrderStore()` became `{ type: calls, instantiates: true }`. Keeping the
edge-type set small matters more than taxonomic purity; themes can still draw
instantiation differently.

## 5. Dependency injection is capability flow, not data flow

The `store` parameter of `placeOrder` is an `OrderStore` flowing in — but it is
not data moving through the system; it is a capability being handed over.
Tagged `mode: capability` on the flows-into edge. This distinction matters for
the traced-path feature: when a user traces "where does an Order go," capability
edges should not light up as cargo routes.

## 6. Error propagation wants transitive edges

`ValidationError` is thrown in validate.ts and caught two hops away in
index.ts, passing *through* placeOrder untouched. A hop-by-hop representation
would claim placeOrder "handles" it. Resolution: `error-flows` edges connect
raise-site to catch-site directly, with `through:` listing transited callables.
Rendering payoff: drainage that visibly crosses a district without stopping is
exactly the comprehension signal a reader needs.

## 7. The world needs an outside

`Error` and `createServer` live beyond the repo. New kind `external`, grouped
by ecosystem, with no containment inside the repo tree. Spatially: terrain
beyond the city walls — stdlib as mountains, node_modules as the surrounding
region, other repos in a monorepo as neighboring cities. Externals get
`provenance: indexed` and no behavior skeletons.

## 8. Normalized magnitudes are diff-poison unless raw values ride along

`size.norm` for a file changes whenever any *other* file grows, because
normalization is repo-relative. If the IR stored only normalized values, diffs
would report phantom changes everywhere. Resolution: every magnitude stores
`raw` + `norm`; the differ compares raw, themes consume norm.

## Open questions the toy repo was too small to answer

- **Re-exports and barrel files** (`export * from "./x"`): identity should
  stay with the defining module; barrels probably become a relation
  (`re-exports`) rather than duplicate entities. Needs a real repo to verify.
- **Generics**: does `Map<string, Order>` create a flows-into to Order?
  (Probably yes via `references` with a type-argument tag; deferred.)
- **Behavior skeleton depth**: nesting worked (loop containing branches) but a
  200-line function may need a depth cap or summarization rule.
- **Scale of flows-into**: type-level flow edges for a popular type in a large
  repo could number in the thousands; fine for full-resolution IR, but the
  renderer's traced-path query needs indexing by shape.

## Verdict

The v0 skeleton held. Nothing required a redesign; all eight findings were
absorbed as flags, tags, one new kind (`external`), and two rules (anonymous
promotion, tree-through-datashapes). Vocabulary feels close to right for a
first real-parser implementation.
