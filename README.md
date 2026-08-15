# svelte-a2ui

[![CI](https://github.com/ChaliceForAuri/a2ui-svelte/actions/workflows/ci.yml/badge.svg)](https://github.com/ChaliceForAuri/a2ui-svelte/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/svelte-a2ui)](https://www.npmjs.com/package/svelte-a2ui)

**The [A2UI](https://a2ui.org) renderer for Svelte 5.**

A2UI is the agent-to-UI protocol: an agent describes an interface as _data_ against a component catalog the client already owns, and the client renders it with its own components. No generated code, no sandboxed iframes, no HTML from the model. Google originated it; it's carried today over [A2A](https://a2a-protocol.org), [AG-UI](https://docs.ag-ui.com) and MCP.

There are official renderers for React, Angular, Lit and Flutter. The Svelte slot is open — the A2UI roadmap lists _"Svelte/Kit — Community interest"_ as unclaimed, and the only prior community attempt targets the obsolete v0.8 wire format. This renderer targets **v1.0**, covers the full basic catalog, and is tested against the spec's own fixtures.

```svelte
<script lang="ts">
	import {
		A2uiClient,
		Surface,
		createCatalogRegistry,
		basicCatalog,
		createHttpTransport
	} from 'svelte-a2ui';
	import 'svelte-a2ui/theme.css';

	const catalog = createCatalogRegistry([basicCatalog]);
	const client = new A2uiClient({ transport: createHttpTransport({ url: '/api/agent' }) });
	client.start();
</script>

<Surface {client} {catalog} surfaceId="main" />
```

That's the whole integration. The agent streams JSONL; the surface fills in as it arrives.

---

## Why this instead of a chat widget

A2UI's model is worth understanding before the API, because it's what makes the guarantees possible.

**The component tree is flat and id-addressed, not nested.** Messages carry a list of `{ id, component, … }` records that reference each other by id. An LLM can emit them in any order, correct itself mid-stream, and never has to hold a balanced tree in its head. Forward references are legal — a parent may name a child that doesn't exist yet.

**Rendering is gated on `root`.** Components that arrive before a component with id `root` are buffered, not painted. Progressive rendering therefore looks deliberate rather than like a half-built DOM.

**The data model is separate from the tree.** Components bind to a per-surface JSON document by [RFC 6901](https://datatracker.ietf.org/doc/html/rfc6901) pointer. Changing data doesn't re-send components, and `updateDataModel` patches a single path.

**Typing produces no network traffic.** Inputs write straight to the local data model. Validation (`checks`) runs entirely client-side and disables the submit control locally. Only an explicit `action` sends anything to the agent, and it sends a hand-picked `context`, not the whole model.

**Styling is the host's, always.** v1.0 removed agent theming outright. Agents send semantic hints (`variant: "primary"`), never colours. Everything visual here is a CSS custom property at `:where(:root)` — zero specificity, so your stylesheet wins without `!important`.

---

## Install

```bash
npm install svelte-a2ui
```

Requires Svelte `^5.55` (peer dependency). Works in SvelteKit, plain Vite, Astro — nothing imports `$app/*`.

## The surface

```svelte
<Surface {client} {catalog} surfaceId="main" maxDepth={64} fallback={UnknownComponent}>
	{#snippet pending()}
		<Skeleton />
	{/snippet}
</Surface>
```

- `pending` renders until the surface exists and its `root` arrives.
- `fallback` renders in place of a component type your catalog doesn't have. Without it, unknown types render nothing — the spec says log and skip, never crash.
- `maxDepth` bounds nesting, so a cyclic component graph can't recurse forever.

## Transports

```ts
// HTTP: POST once, read JSONL or SSE back. Content-type decides which.
createHttpTransport({ url: '/api/agent', body: { prompt }, headers: { … } })

// AG-UI: A2UI rides inside ACTIVITY_SNAPSHOT / ACTIVITY_DELTA (RFC 6902 patches).
createAgUiTransport({ events, send })

// A2A: A2UI DataParts (mimeType application/a2ui+json) on Messages, Tasks and
// streamed updates. Bring your own A2A client; this extracts and wraps.
createA2aTransport({ events, send })

// Offline: replay a fixture, optionally with a delay between messages.
createMockTransport(messages, { delayMs: 300 })
```

A transport is three methods (`send`, `subscribe`, optional `start`/`close`), so A2A, WebSockets or a service worker are all a small file.

## Custom catalogs

The catalog is the security boundary — an agent can only name what you registered. A catalog entry declares which properties are _structural_, and the renderer does the rest:

```ts
import type { Catalog } from 'svelte-a2ui';
import Chart from './Chart.svelte';
import Approve from './Approve.svelte';

export const appCatalog: Catalog = {
	id: 'https://example.com/catalogs/app.json',
	components: {
		Chart: { component: Chart, bindings: ['series'] },
		Approve: {
			component: Approve,
			slots: { child: 'child' }, // 'child' | 'children' | 'tabs'
			actions: ['onApprove'] // becomes a () => void handler
		}
	},
	functions: {
		// Remote-callable functions must opt in; everything defaults to renderer-only.
		getViewport: { callableFrom: 'any', run: () => ({ w: innerWidth, h: innerHeight }) }
	}
};

const catalog = createCatalogRegistry([basicCatalog, appCatalog]);
```

Your component receives resolved scalars spread at the top level, plus four namespaced props:

```svelte
<script lang="ts">
	import { Slot, type A2uiComponentProps } from 'svelte-a2ui';

	let { title, slots, bindings, actions, validation }: A2uiComponentProps = $props();
</script>

<section>
	<h2>{title}</h2>
	<Slot content={slots.child} />
	<button disabled={!validation.valid} onclick={actions.onApprove}>Approve</button>
</section>
```

`bindings.x` is `{ value, set(next), path }` — two-way against the data model, scope-aware inside collection templates.

Pass `{ strict: true }` to `createCatalogRegistry` to enforce the spec's rule that a component with no resolvable `catalogId` is an error rather than falling back to a name search across catalogs.

## Protocol coverage

| Area                                                                 | Status                       |
| -------------------------------------------------------------------- | ---------------------------- |
| `createSurface` (incl. v1.0 inline components + data model)          | ✅                           |
| `updateComponents` (id-keyed upsert, `root` gating, buffering)       | ✅                           |
| `updateDataModel` (JSON Pointer paths, `null` deletes, root replace) | ✅                           |
| `deleteSurface`                                                      | ✅                           |
| `callFunction` / `functionResponse`, `callableFrom` enforcement      | ✅                           |
| `actionResponse` → `responsePath`                                    | ✅                           |
| Renderer → agent `action`, `error` (all four codes)                  | ✅                           |
| `sendDataModel` → `a2uiRendererDataModel` metadata                   | ✅                           |
| Data binding, collection scope, relative vs absolute paths           | ✅                           |
| `${…}` interpolation, nested calls, `@index(offset)`                 | ✅                           |
| All 14 built-in functions + `checks` (both rule shapes)              | ✅                           |
| Basic catalog — all 18 components, v1.0 property names               | ✅                           |
| Transports: HTTP/JSONL, SSE, AG-UI activities, A2A, mock             | ✅                           |
| A2A binding (`DataPart` extraction, metadata lifting, ext. URI)      | ✅                           |
| Capability advertisement (`a2uiRendererCapabilities`)                | ✅ (inline catalogs not yet) |
| Full 59-name `Icon` enum + `{svgPath}` custom glyphs                 | ✅                           |

Built against **v1.0** (currently a Candidate, slated to finalize Q4 2026). This library uses the current property names — `Modal.trigger`/`content` (not v0.8's `entryPointChild`/`contentChild`), `Tabs.tabs` (not `tabItems`), `Slider.min`/`max` (not `minValue`/`maxValue`), `TextField.value`/`variant` (not `text`/`textFieldType`), and `ChoicePicker` (not `MultipleChoice`) — which are shared by v0.9 and v1.0; only v0.8 used the old ones. The v1.0-specific behaviours (inline `createSurface` components/data, `updateDataModel` null-deletes, the `a2uiRendererDataModel` metadata key) are implemented.

## Architecture

```
protocol/    pure TypeScript — pointer, scope, functions, resolve, checks, reducer
transport/   pure TypeScript — JSONL/SSE decoding, JSON Patch, HTTP + AG-UI
client.svelte.ts   the only stateful rune: $state.raw over the reducer
render/      Surface, Node, Slot + the pure prop-classification pass
catalog/     registry + the basic catalog as Svelte components
```

The protocol is a **pure reducer**: `reduce(state, message) → { state, outbound }`. Two consequences worth stating.

_It's testable without a compiler._ The suite runs on `node --test` with type stripping — no build step, no jsdom.

_It makes rendering cheap._ Every transition returns a structurally-shared new state, so untouched subtrees keep referential identity. The client holds that in `$state.raw` and each `Node` reads its own spec through `$derived` — a data-model tweak leaves every unrelated node's derived value referentially identical, so Svelte skips it. Deep-proxying a large agent-authored tree with plain `$state` would cost a proxy per node and a dependency per property read; this avoids both.

## Security

The threat model assumes the agent is untrusted.

- **Allowlisted rendering.** Only registered catalog components render. Unknown types are skipped. There is no dynamic `import()` of an agent-supplied name.
- **No expression evaluation.** `${…}` resolves paths and calls _registered_ functions. There is no `new Function`, no `eval`, no property-path execution.
- **`on*` keys and function values are stripped** from every spec before props reach a component — defence in depth, since spreading a wire-supplied `onclick` would be an injection.
- **Prototype pollution is refused.** `__proto__`, `constructor` and `prototype` throw on write and never resolve on read.
- **Markdown is escaped first, then marked up.** `Text` supports simple Markdown; the HTML handed to `{@html}` is built from markup this library emitted, never from agent HTML. Links are scheme-allowlisted (`http`/`https`/`mailto`) and get `noopener noreferrer`.
- **`openUrl` requires a safe scheme** and opens with `noopener,noreferrer`.
- **Bounded recursion.** `maxDepth` on surfaces, and a depth guard on function/expression evaluation that lives on the eval context so it survives re-entry from a custom function.
- **`callableFrom` is enforced.** Agent-initiated `callFunction` against a renderer-only function returns `INVALID_FUNCTION_CALL`. Every built-in is renderer-only.

If you forward A2UI between agents, strip `metadata.a2uiRendererDataModel` — the spec requires it, to stop one sub-agent's surface state leaking into another's.

## Demo

```bash
npm install
npm run dev
```

`/api/agent` streams a booking form as JSONL with pauses, and deliberately sends leaves _before_ `root` so you can watch buffering work. It covers markdown text, a collection template with relative bindings and `@index`, client-side validation gating the submit button, and an action round-trip.

## Development

```bash
npm test      # protocol + render suite, no build step
npm run check # svelte-check
npm run package
```

## Status

`0.1.0`, pre-release. The protocol layer is covered by 75 tests including a replay of the specification's own contact-form fixture. The Svelte components have not yet been exercised in a browser test harness — that's the next thing.

## License

Apache-2.0, matching the A2UI project.
