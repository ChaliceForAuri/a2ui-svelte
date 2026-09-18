---
applyTo: 'src/lib/catalog/**'
---

# Catalog

The catalog is the security boundary of this library: an agent can only name what the host registered
in advance. Components resolve through `registry.resolve()` and nothing else. A dynamic `import()` of
an agent-supplied name, a lookup that falls through to `eval`, or any path expression evaluated against
agent input defeats the entire threat model — treat these as blocking findings, however convenient the
call site.

Functions default to renderer-only. Remote-callable ones must opt in through `callableFrom`, and an
agent-initiated call against a renderer-only function returns `INVALID_FUNCTION_CALL`. Every built-in
is renderer-only. A new built-in that is callable by the agent without a stated reason is a finding.

`basic/` mirrors the spec's basic catalog and is not a design surface. All 18 components, the 59-name
`Icon` enum and the 14 built-in functions match the published names exactly, including ones that read
awkwardly. Notable shapes that are correct as written:

- `ChoicePicker.value` is an array even in `mutuallyExclusive` mode — the spec's own fixture does this.
- `Modal` uses `trigger` / `content`; `Tabs` uses `tabs`; `Slider` uses `min` / `max`.
- Named icon glyphs stay stroked outlines while the `{svgPath}` variant renders fill-based, matching
  the official renderers.

Anything the host might genuinely want differently belongs in a custom catalog, never in `basic/`.

Styling is host-owned. Components emit semantic hints and CSS custom properties at `:where(:root)` —
zero specificity, so a host stylesheet wins without `!important`. A hardcoded colour, a bare element
selector, or a raised specificity in these components is a defect: v1.0 removed agent theming outright.
