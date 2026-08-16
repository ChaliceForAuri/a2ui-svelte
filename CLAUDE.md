# CLAUDE.md

Context for Claude working in this repo. Read this before changing anything.

## What this is

`svelte-a2ui` (repo: `a2ui-svelte`) is a renderer for the [A2UI](https://a2ui.org) protocol (Agent-to-UI, v1.0) built on Svelte 5 runes. An agent streams JSON describing an interface; this library renders it using components the host application registered in advance. No agent-authored code is ever evaluated.

**The positioning is deliberate and load-bearing — do not drift from it.** This is _not_ a general "generative UI" toolkit. That space is occupied: Vercel Labs ships `@json-render/svelte` with first-class Svelte support. This library targets the specific gap that A2UI's own roadmap lists as unclaimed — _"Svelte/Kit — Community interest"_ — while React, Angular, Lit and Flutter all have official renderers. The aim is to become the Svelte entry in that ecosystem, eventually `@a2ui/svelte`. Every design decision should be judged against "would the A2UI maintainers accept this as the Svelte renderer?"

Naming: the npm package is **`svelte-a2ui`** — the name `a2ui-svelte` was taken on npm (June 2026, conversabile/dariowho) by a v0.8-era runtime with one release and no activity since; the GitHub repo keeps the `a2ui-svelte` name. Don't disparage the other package in public docs; just be precise about versions.

Consequence: **track the spec, don't improve on it.** If the spec says `Modal` has `trigger`/`content`, we use `trigger`/`content` even if something else reads nicer. Deviations belong in a custom catalog, not in the basic one.

## Repo status

`0.1.0`, pre-release. Originally built in a sandbox where npm was blocked; the first-commit checklist has since been completed (2026-08-11):

- ✅ **The protocol and render layers are covered by 75 passing tests**, including a replay of the spec's own contact-form fixture (22 components walked from `root`).
- ✅ Dependencies install cleanly; `package-lock.json` is committed (CI uses `npm ci`).
- ✅ `svelte-check` is clean — 0 errors, 0 warnings.
- ✅ The demo has been driven in headless Chromium: the form streams in progressively, validation gates the submit button, the action round-trip carries the hand-picked `context`, dark mode renders, and the console is clean.
- ✅ `svelte-package` emits `dist/` and `publint` passes.

Second wave (also 2026-08-11): 16 Vitest browser-mode tests cover the component layer (`npm run test:browser`), which caught and fixed a DateTimeInput timezone-display bug and missing ChoicePicker radio grouping; wire conformance was verified against the official spec repo (`a2ui-project/a2ui`), fixing the v1.0 metadata key (`a2uiRendererDataModel`) and adding AG-UI's real `a2ui-surface` activity type.

## Commands

```bash
npm install
npm test        # 75 tests, no build step — node --test with type stripping
npm run check   # svelte-check — clean as of first commit; keep it that way
npm run dev     # demo at / , mock agent at /api/agent
npm run package # svelte-package + publint
```

`npm test` needs the resolver hook in `tests/register-hook.mjs`. `svelte-package` requires relative imports to carry a `.js` extension even when the source is `.ts`; Node's type stripper doesn't remap those, so the hook maps `./x.js` → `./x.ts` for tests only. If you add a test and get `ERR_MODULE_NOT_FOUND`, that hook is why — don't "fix" it by dropping the extensions in `src/`, which would break packaging.

## Architecture invariants

These are the rules that make the design work. Breaking one silently degrades correctness or performance.

**1. The protocol layer stays pure.** `src/lib/protocol/` and `src/lib/transport/` contain zero runes and zero Svelte imports. `reduce(state, message) → { state, outbound }` is a pure function. This is what makes the suite runnable without a compiler. `client.svelte.ts` is the _only_ file holding reactive state.

**2. State transitions are immutable with structural sharing.** `setPointer`/`deletePointer` return a new root that preserves referential identity for every untouched subtree. The client holds this in `$state.raw`, and each `Node.svelte` reads its own spec through `$derived`. Unchanged nodes produce referentially identical derived values, so Svelte skips them. Switching to plain `$state` or mutating in place would cost a proxy per node and a dependency per property read — and would break the short-circuit. There is a test asserting referential sharing; keep it passing.

**3. The catalog is the security boundary.** Components resolve only via `registry.resolve()`. Never add a dynamic `import()` of an agent-supplied name, never evaluate a path expression. Unknown types render nothing (or the `fallback` component) — log and skip, never throw.

**4. Nothing agent-supplied becomes a function.** `buildNodeProps` unconditionally strips `on*` keys and function values. Event handlers only ever come from `actions` (built from an `Action` the catalog declared) — never from spread props.

**5. `{@html}` is only ever fed markup this codebase generated.** `renderMarkdown` escapes first, then applies a fixed rule set. If you extend it, escape before you mark up, and keep the link scheme allowlist.

**6. Depth guards live on the eval context, not in a parameter.** A custom function can re-enter `resolveDynamic` with the context it was handed; a parameter would reset to zero each hop and never trip. This was an actual bug — the test `deeply self-referential registries bottom out instead of hanging` covers it.

## Gotchas already paid for

- **`childScope` takes a pointer, not a token.** An earlier version passed the collection path through `joinPointer`, which escaped `/employees` into a single `~1employees` token. Collection paths are resolved with `absolutePath` first.
- **A prop named `slot` collides with Svelte's legacy slot attribute.** `Slot.svelte` takes `content`, not `slot`. Don't rename it back.
- **Node's type stripper rejects TS parameter properties** (`constructor(public readonly x)`). Write the assignment out.
- **Code spans must be lifted before emphasis rules run**, or `` `**x**` `` becomes bold inside the code element. Placeholders use NUL, which is stripped from the source first so it can't be forged.
- **`ChoicePicker.value` is an array even in `mutuallyExclusive` mode.** That's what the spec's own fixture does.
- **`updateDataModel` with `value: null` means delete.** Local input writes deliberately bypass that path (`client.setData`) so a user can store an explicit null.

## Highest-value next work, in order

(Browser tests and green CI shipped 2026-08-11: 16 Vitest browser-mode tests in `tests/browser/`, run via `npm run test:browser`.)

1. ~~Publish to npm~~ — done 2026-08-13: `svelte-a2ui@0.1.0`, verified by installing from the registry into a fresh Vite app and rendering it headless. Future releases go through `.github/workflows/release.yml` on `v*` tags via npm Trusted Publishing — Hugo must configure the trusted publisher on npmjs.com (package Settings → Publishing access: GitHub repo `ChaliceForAuri/a2ui-svelte`, workflow `release.yml`) before the first tagged release.
2. ~~Complete the `Icon` enum~~ — done 2026-08-13: all 59 spec names (a browser test pins the set against the spec list), plus the `{svgPath}` variant rendered fill-based like the official renderers; named glyphs stay stroked outlines. Every glyph was verified visually on a rendered sheet.
3. ~~Renderer capability metadata~~ — done 2026-08-13: `supportedCatalogIds` option on `A2uiClient`; `#send` attaches `a2uiRendererCapabilities` (and `a2uiRendererDataModel` where opted in) to every outbound message. Inline catalogs (`inlineCatalogs`) remain unimplemented.
4. ~~A2A transport binding~~ — done 2026-08-15: `src/lib/transport/a2a.ts`, adapter-style like AG-UI (host brings its A2A client; we extract from Messages/Tasks/artifacts/status updates and wrap outbound). Envelope metadata is lifted onto the A2A message `metadata` per the extension spec. Legacy `application/json+a2ui` accepted on input, never emitted.
5. ~~Hosted demo~~ — live at https://chaliceforauri.github.io/a2ui-svelte/ (deployed 2026-08-15 by `pages.yml` on every push to main; `STATIC_DEMO=1` swaps in adapter-static and the client-side replay transport in `src/routes/demo-script.ts`). A short demo video for the listing's Discussions post is still worth recording — screen-capture the page while the stream replays.
6. **Submit to the A2UI ecosystem list.** Documented process: PR adding a row to `docs/public/ecosystem/renderers.md` in `a2ui-project/a2ui` (name, platform, npm package, supported versions, source link) + a GitHub Discussions post, demo video encouraged. Criteria are published source/license, stated spec versions, basic-catalog coverage, README, active maintenance — **all criteria are now met**; the demo/video (item 5) is polish for the Discussions post, not a listing requirement.

Spec caution: v1.0 is a **Candidate** (finalize target Q4 2026) and the repo moves daily — re-verify wire details against `specification/v1_0/` before implementing new protocol surface. The strict no-fallback catalog-resolution rule (per-component `catalogId` → surface default → error) is spec-mandated; our lenient default name-search should eventually be revisited.

## Conventions

- Tabs for indentation, single quotes, semicolons, ~100 char lines. `.prettierrc` and `.editorconfig` encode this — run `npx prettier --write .` rather than reformatting by hand.
- Comments explain _why_, not _what_. Several existing comments record spec requirements or bugs that were paid for; don't strip them as noise.
- Relative imports in `src/` always carry `.js`, even from `.ts` files. Required by `svelte-package`.
- New protocol logic goes in a pure module with tests. New rendering logic goes in `render/` and should push as much as possible into `props.ts`, which is pure and testable.
- Svelte in `peerDependencies` only — two copies break context and reactivity.
