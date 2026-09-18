---
applyTo: 'src/lib/protocol/**,src/lib/transport/**'
---

# Protocol and transport

These directories are **pure TypeScript**: zero runes, zero Svelte imports, no DOM. That purity is
what lets the suite run on `node --test` with type stripping and no build step, so an import of
`svelte` or a `$state` / `$derived` declaration added here is a defect, not a style question.

`reduce(state, message) → { state, outbound }` is a pure function. It must not perform I/O, mutate its
arguments, or reach for global state. Every transition returns a new root that preserves referential
identity for untouched subtrees — `setPointer` and `deletePointer` exist for this, and a test asserts
the sharing. Code that rebuilds a subtree wholesale, deep-clones state, or mutates in place breaks the
render short-circuit downstream even though nothing fails visibly.

## Wire conformance is the priority here

Check envelope names, property names, required fields and enum values against `specification/v1_0/` in
[a2ui-project/a2ui](https://github.com/a2ui-project/a2ui) — `agent_to_renderer.json`,
`renderer_to_agent.json` and `common_types.json` are authoritative. Points worth verifying whenever
this code is touched:

- Agent → renderer is a `oneOf` over `createSurface`, `updateComponents`, `updateDataModel`,
  `deleteSurface`, `callRendererFunction` and `agentFunctionResponse`. Renderer → agent is `action`,
  `callAgentFunction`, `rendererFunctionResponse` and `error`.
- `callRendererFunction` **nests both** `functionCallId` and `callFunction` inside itself; the message
  envelope carries neither, and the object is `additionalProperties: false`. The envelope-level
  `functionCallId` on `AgentToRenderer` belongs to the pre-v1.0 path only — treating it as canonical is
  what produced the silent mismatch 0.2.0 fixes.
- `functionCallId` is the only correlator: `FunctionResponse` is `additionalProperties: false` over
  `{functionCallId, value, error}`, with no echo of the function name.
- The pre-v1.0 aliases accepted on input are exactly the ones in `ENVELOPE_KEYS` — `callFunction` and
  `actionResponse`. `functionResponse` is **not** an input; it was this renderer's old _output_ name,
  replaced by `rendererFunctionResponse`. Emitting it again is a regression.
- `a2uiRendererCapabilities` is attached to every outbound message deliberately: the spec scopes
  message-carried capabilities to a conversation turn, so omitting it on later messages would withdraw
  A2UI support.
- `updateDataModel` with `value: null` deletes the pointer.

## Errors

Validation failures produce an `error` message with one of the four spec codes —
`INVALID_FUNCTION_CALL`, `VALIDATION_FAILED`, `UNALLOWED_PARENT`, `UNALLOWED_CHILD` — and leave state
otherwise untouched. The reducer does not throw on agent input — a hostile or malformed stream must
degrade, never crash the host application.
