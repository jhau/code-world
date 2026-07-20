# Finding 004 — Renderer: non-class datashapes render as documents, not buildings

Context: Renderer M1, petstore and toyshop worlds. Follows the gate
representation precedent: an entity may keep its containment-derived layout
slot while core renderer semantics give it a more truthful visual structure.

## Decision

A leaf datashape whose `shape_class` is not `class` renders as a document
schematic instead of a building. There are two representations:

- **Hosted blueprint.** When a rendered `value` building declares
  `stores_shape: <shape id>`, the shape renders as a thin upright blueprint
  board leaning against that host warehouse. It uses an unblocked wall away
  from the dock crates where possible, with deterministic fixed-order
  placement; the fallback is a fixed offset along the dock wall.
- **Standalone lectern.** Every other eligible shape renders as a low document
  lectern at the center of its own reserved layout rectangle.

Classes remain buildings because they can own behavior rooms. A datashape with
layout children also remains a building regardless of `shape_class`, so its
contained behavior is never suppressed defensively.

As with customs gates, schematic entities extend the renderer's existing
suppression set. Their old building meshes are skipped, their footprints are
released from street routing and door-side obstacles, and their replacement
meshes remain pickable representatives of the same entity.

## Rationale

The skyline is reserved for behavior. Callables, runtime values, and classes
act in the running system; interfaces, records, aliases, and similar shapes are
contracts. Rendering those contracts as paperwork makes that distinction
legible without inventing a new IR kind.

`stores_shape` carries a stronger statement than ordinary proximity: it says a
runtime store is backed by that contract. Putting the blueprint at the
warehouse makes this relationship visible while keeping the contract distinct
from both the warehouse building and its runtime cargo.

Standalone lecterns preserve declaration-site discoverability for contracts
that have no runtime host. A serialized contract may therefore appear once as
its declaration schematic and again as permit instances in a client camp;
those are intentionally different meanings.

## Layout and diff stability

Layout slots are unchanged. The containment tree still produces the same
rectangles, positions, and heights, and graph relations still do not influence
placement. Suppression happens only during mesh creation, so layout
determinism, spatial memory, and IRDiff behavior are unaffected.
