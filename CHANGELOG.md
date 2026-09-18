# Changelog

Notable changes to `svelte-a2ui`. Dates are the release date on npm.

## 0.2.0 — 2026-09-18

Everything below shipped to `main` after 0.1.0 went to the registry. The first entry
is a wire fix, so 0.2.0 supersedes 0.1.0 for anything using function calls.

### Fixed

- **v1.0 envelope names for function calls.** 0.1.0 shipped an earlier candidate draft's
  `callFunction` / `functionResponse`. v1.0 settled on `callRendererFunction` /
  `rendererFunctionResponse`, verified against the authoritative schemas: `agent_to_renderer.json`
  is a `oneOf` over `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`,
  `callRendererFunction` and `agentFunctionResponse`; `renderer_to_agent.json` over `action`,
  `callAgentFunction`, `rendererFunctionResponse` and `error`. The four UI messages were always
  correct, so rendering was never affected — only the function-call half, which failed silently.
  The draft names are still accepted on input and never emitted.

### Added

- **Bidirectional function calls.** A `${…}` call naming a function the catalog does not implement
  is routed to the agent as `callAgentFunction` instead of resolving to `undefined`, and the
  `agentFunctionResponse` resolves it. Call identity ignores argument order, so one call is one
  round trip no matter how many props reference it.
- **`a2ui.pending`.** The names of props still waiting on an agent round trip, per prop rather than
  per node, so a component can show a skeleton for the one late figure instead of over the whole
  card. Clears when the value arrives.
- **Turn-based `createHttpTransport`.** For serverless hosts with no persistent stream: each
  action's POST response is the agent's next batch of messages. Turns are serialised, and a failed
  turn goes to `onTurnError` rather than throwing inside the component that dispatched it.
- **A2A transport binding.** `createA2aTransport` extracts A2UI `DataPart`s (`application/a2ui+json`)
  from Messages, Tasks, artifacts and status updates, and lifts envelope metadata onto the outbound
  A2A message per the extension spec. Host brings its own A2A client. Legacy
  `application/json+a2ui` is accepted on input, never emitted.
- **The complete `Icon` enum** — all 59 spec names, plus the `{svgPath}` variant rendered fill-based
  as the official renderers do, while named glyphs stay stroked outlines.
- **Renderer capability metadata.** `supportedCatalogIds` on `A2uiClient` advertises
  `a2uiRendererCapabilities` on every outbound message (and `a2uiRendererDataModel` where a surface
  opted in with `sendDataModel`). Advertising on every message is deliberate: the spec scopes
  message-carried capabilities to a turn, so omitting them would withdraw A2UI support.
- A hosted demo at <https://chaliceforauri.github.io/a2ui-svelte/>, streaming the booking scenario
  client-side with the wire feed visible, and answering the booking action with new UI.

### Changed

- 23 browser-mode component tests (`npm run test:browser`) alongside the 103 protocol and render
  tests, which caught a `DateTimeInput` timezone-display bug and missing `ChoicePicker` radio
  grouping.

## 0.1.0 — 2026-08-13

First release. Pure-reducer protocol core with structural sharing held in `$state.raw`, the full
basic catalog as Svelte 5 components, catalog-as-security-boundary registry, scope-aware data
binding with collection templates, `checks` validation, and HTTP JSONL/SSE, AG-UI and mock
transports.
