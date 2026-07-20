# Finding 005 — Renderer: source links are resolved from IR data

Context: Renderer M1 entity inspection for worlds whose source repository is
available on GitHub.

## Decision

World metadata may provide two optional keys for source navigation:

- `repo_url`: the repository URL used as the GitHub link base.
- `ref`: the branch, tag, or commit to browse; the renderer defaults to `main`.

The entity panel resolves a file from the selected entity's own `source.file`.
When that field is absent, it walks `contains_parent` and uses the nearest
ancestor with a `source.file`. An entity's own `source.span` becomes a GitHub
line fragment. An ancestor contributes only its file because its span describes
the ancestor, not the selected child. Repository-root and external entities are
never linked.

Query parameters may override the metadata with `repo` and `ref`, allowing a
world without repository metadata to opt into source navigation at runtime.

## Opaque identity boundary

The resolver looks up the entity id as an opaque key and follows explicit IR
fields. It never derives a path from `unit:`, `sym:`, or any other id syntax.
This keeps source navigation compatible with future frontend identity schemes
and preserves the renderer's opaque-id rule.
