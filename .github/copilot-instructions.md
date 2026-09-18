# Review guidance for svelte-a2ui

`svelte-a2ui` renders the [A2UI](https://a2ui.org) protocol (v1.0) on Svelte 5 runes. An agent streams
JSON describing an interface; this library renders it using components the host application registered
in advance. **No agent-authored code is ever evaluated.** Assume the agent is hostile.

## Track the spec, don't improve on it

The authoritative schemas live in `specification/v1_0/` in
[a2ui-project/a2ui](https://github.com/a2ui-project/a2ui). v1.0 is a Candidate and the repo moves
often, so a divergence between this code and those schemas is the **highest-value finding here** —
report it even when the code is internally consistent and the tests pass. A past review caught exactly
this: message types still modeling a pre-v1.0 payload shape, valid on their own terms but not
interoperable.

Spec property names are used verbatim even when something else would read better — `Modal.trigger` /
`Modal.content`, `Tabs.tabs`, `Slider.min` / `max`. Do not propose renaming them. Deviations belong in
a custom catalog, never in the basic one.

## Invariants — breaking one silently degrades correctness or performance

1. **The protocol layer stays pure.** `src/lib/protocol/` and `src/lib/transport/` contain zero runes
   and zero Svelte imports; `reduce(state, message) → { state, outbound }` is a pure function. This is
   what lets the suite run without a compiler. `client.svelte.ts` is the only file holding reactive
   state. Flag any Svelte import or rune introduced under `protocol/` or `transport/`.
2. **State transitions are immutable with structural sharing.** `setPointer` / `deletePointer` return
   a new root preserving referential identity for untouched subtrees. `$state.raw` is deliberate —
   plain `$state` would cost a proxy per node and a dependency per property read, and would break the
   short-circuit that lets unchanged nodes skip re-rendering. Never suggest `$state` or in-place
   mutation here. A test asserts referential sharing.
3. **The catalog is the security boundary.** Components resolve only through `registry.resolve()`.
   Never a dynamic `import()` of an agent-supplied name, never an evaluated path expression. Unknown
   types log and skip — they never throw.
4. **Nothing agent-supplied becomes a function.** `buildNodeProps` unconditionally strips `on*` keys
   and function values. Event handlers come only from `actions` the catalog declared, never from
   spread props.
5. **`{@html}` only ever receives markup this codebase generated.** `renderMarkdown` escapes first,
   then applies a fixed rule set. Any extension must escape before marking up and keep the link-scheme
   allowlist.
6. **Depth guards live on the eval context, not in a parameter.** A custom function can re-enter
   `resolveDynamic` with the context it was handed; a parameter would reset to zero each hop and never
   trip. This was a real bug with a test covering it.

## Deliberate choices that look like defects — do not flag

- **Relative imports in `src/` carry a `.js` extension even from `.ts` files.** Required by
  `svelte-package`. Dropping them breaks packaging.
- **`Slot.svelte` takes `content`, not `slot`.** A prop named `slot` collides with Svelte's legacy
  slot attribute.
- **`ChoicePicker.value` is an array even in `mutuallyExclusive` mode.** The spec's own fixture does
  this.
- **No TypeScript parameter properties** (`constructor(public readonly x)`). Node's type stripper
  rejects them, and the test suite runs on it.
- **Code spans are lifted before emphasis rules run**, using NUL placeholders. NUL is stripped from
  the source first so it cannot be forged. Reordering makes `` `**x**` `` bold inside the code element.
- **`updateDataModel` with `value: null` means delete.** Local input writes bypass that path via
  `client.setData` on purpose, so a user can store an explicit null.

## Conventions

Tabs, single quotes, semicolons, ~100-character lines, enforced by Prettier — **do not comment on
formatting**. Comments explain _why_, not _what_; several record spec requirements or bugs already paid
for, so do not suggest removing them as noise. Svelte stays in `peerDependencies` only — two copies
break context and reactivity. New protocol logic belongs in a pure module with tests; new rendering
logic should push as much as possible into `props.ts`, which is pure and testable.

## What to prioritize

Wire conformance against the spec, security-boundary violations, reactivity or performance regressions
(anything breaking structural sharing or the `$derived` short-circuit), and protocol logic landing
without tests. Deprioritize prose and style.
