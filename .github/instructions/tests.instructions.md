---
applyTo: 'tests/**'
---

# Tests

Two suites, deliberately different:

- `npm test` runs the protocol and render tests on `node --test` with type stripping — no build step,
  no jsdom. This is only possible because `src/lib/protocol/` and `src/lib/transport/` stay free of
  runes and Svelte imports.
- `npm run test:browser` runs the component tests in real Chromium via Vitest browser mode. It needs
  `svelte-kit sync` first, which the script already does.

## The resolver hook is load-bearing

`svelte-package` requires relative imports to carry a `.js` extension even when the source is `.ts`,
and Node's type stripper does not remap those. `tests/register-hook.mjs` maps `./x.js` → `./x.ts` for
tests only. A new test failing with `ERR_MODULE_NOT_FOUND` means the hook was bypassed — the fix is
never to drop extensions in `src/`, which would break packaging.

## What a good test here looks like

The suite's job is to pin behaviour that would otherwise regress silently, so prefer tests that fail
for a specific reason over tests that assert shape:

- Protocol changes are tested against the spec's own fixtures where one exists. The contact-form
  fixture replay (22 components walked from `root`) is the reference example.
- Referential sharing after a state transition is asserted, not assumed. It is a performance contract,
  and nothing visible breaks when it is lost.
- Guards are tested with the case that would hang or recurse — the self-referential registry test
  exists because a depth guard passed as a parameter reset each hop and never tripped.
- Lifecycle is tested in both directions. A flag that sets correctly but never clears is a bug the
  positive assertion will not catch.
- New behaviour should be verified to fail without the change.

Flag new protocol logic arriving with no test, and tests that would still pass with the
implementation removed.
