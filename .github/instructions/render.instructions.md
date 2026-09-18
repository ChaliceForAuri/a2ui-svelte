---
applyTo: 'src/lib/render/**,src/lib/client.svelte.ts'
---

# Render layer

`client.svelte.ts` is the **only** file in the library holding reactive state, and it holds it in
`$state.raw` over the reducer's output. Each `Node.svelte` reads its own spec through `$derived`, so an
unchanged node produces a referentially identical derived value and Svelte skips it. Two consequences
for review:

- Converting to plain `$state`, or mutating state in place, costs a proxy per node and a dependency per
  property read on an agent-authored tree of arbitrary size, and destroys the short-circuit. Do not
  suggest it.
- Anything that rebuilds derived values on every render — a new object or array literal in a hot path,
  a non-memoized map over the tree — silently removes the same benefit. That is worth flagging.

## Props are a security boundary, not just a mapping

`buildNodeProps` strips `on*` keys and function values from every spec unconditionally, before props
reach a component. Spreading a wire-supplied `onclick` would be an injection, so this strip is not
defensive clutter. Event handlers come only from `actions`, built from an `Action` the catalog
declared. Keep `props.ts` pure and push logic into it rather than into `.svelte` files — it is the part
that can be tested without a compiler.

`Slot.svelte` takes `content`, not `slot`: a prop named `slot` collides with Svelte's legacy slot
attribute. Do not suggest renaming it back.

## Rendering rules from the spec

- Components arriving before `root` are buffered, not painted.
- An unknown component type renders nothing, or the `fallback` component — log and skip, never throw.
- `maxDepth` bounds nesting so a cyclic component graph cannot recurse forever.
- `a2ui.pending` names the props still waiting on an agent round trip, per prop rather than per node.
  A flag that sets but never clears leaves a permanent skeleton over data that already arrived, so
  lifecycle matters as much as the set itself.

`{@html}` is only ever fed markup this codebase generated. `renderMarkdown` escapes first, then applies
a fixed rule set; any extension escapes before marking up and keeps the link-scheme allowlist
(`http`, `https`, `mailto`) plus `noopener noreferrer`.
