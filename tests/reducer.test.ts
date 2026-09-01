import test from 'node:test';
import assert from 'node:assert/strict';
import {
	INITIAL_STATE,
	reduce,
	trackPendingAction,
	trackPendingFunctionCall,
	rendererDataModelMetadata,
	rendererCapabilitiesMetadata
} from '../src/lib/protocol/reducer.ts';
import type { ClientState } from '../src/lib/protocol/reducer.ts';
import { createFunctionRegistry } from '../src/lib/protocol/resolve.ts';
import type { AgentToRenderer } from '../src/lib/protocol/types.ts';

const options = { functions: createFunctionRegistry() };

function run(state: ClientState, ...messages: AgentToRenderer[]) {
	const outbound = [];
	let s = state;
	for (const m of messages) {
		const r = reduce(s, m, options);
		s = r.state;
		outbound.push(...r.outbound);
	}
	return { state: s, outbound };
}

const create: AgentToRenderer = {
	version: 'v1.0',
	createSurface: { surfaceId: 's1', catalogId: 'basic' }
};

test('createSurface registers a surface that is not yet ready', () => {
	const { state, outbound } = run(INITIAL_STATE, create);
	assert.deepEqual(outbound, []);
	assert.equal(state.surfaces.s1?.surfaceId, 's1');
	assert.equal(state.surfaces.s1?.ready, false, 'no root component yet');
	assert.deepEqual(state.surfaces.s1?.dataModel, {});
});

test('single-message instantiation carries components and data inline', () => {
	const { state } = run(INITIAL_STATE, {
		version: 'v1.0',
		createSurface: {
			surfaceId: 's1',
			components: [
				{ id: 'root', component: 'Column', children: ['name'] },
				{ id: 'name', component: 'Text', text: { path: '/name' } }
			],
			dataModel: { name: 'John Doe' }
		}
	});
	assert.equal(state.surfaces.s1?.ready, true);
	assert.equal(Object.keys(state.surfaces.s1!.components).length, 2);
	assert.deepEqual(state.surfaces.s1?.dataModel, { name: 'John Doe' });
});

test('rendering is gated on a component with id "root"', () => {
	const a = run(INITIAL_STATE, create, {
		version: 'v1.0',
		updateComponents: {
			surfaceId: 's1',
			components: [{ id: 'leaf', component: 'Text', text: 'hi' }]
		}
	});
	assert.equal(a.state.surfaces.s1?.ready, false, 'buffered, not painted');
	assert.ok(a.state.surfaces.s1?.components.leaf, 'but still buffered');

	const b = run(a.state, {
		version: 'v1.0',
		updateComponents: {
			surfaceId: 's1',
			components: [{ id: 'root', component: 'Column', children: ['leaf'] }]
		}
	});
	assert.equal(b.state.surfaces.s1?.ready, true);
});

test('updateComponents upserts by id and shares the untouched surface', () => {
	const a = run(INITIAL_STATE, create, {
		version: 'v1.0',
		updateComponents: {
			surfaceId: 's1',
			components: [{ id: 'root', component: 'Column', children: ['a'] }]
		}
	});
	const b = run(a.state, {
		version: 'v1.0',
		updateComponents: {
			surfaceId: 's1',
			components: [{ id: 'root', component: 'Column', children: ['a', 'b'] }]
		}
	});
	assert.deepEqual(b.state.surfaces.s1?.components.root?.children, ['a', 'b']);
	assert.notEqual(b.state.surfaces.s1, a.state.surfaces.s1);
});

test('components missing id or type are skipped with VALIDATION_FAILED', () => {
	const { state, outbound } = run(INITIAL_STATE, create, {
		version: 'v1.0',
		updateComponents: {
			surfaceId: 's1',
			components: [
				{ id: 'ok', component: 'Text', text: 'x' },
				{ component: 'Text' } as never,
				{ id: 'no-type' } as never
			]
		}
	});
	assert.equal(Object.keys(state.surfaces.s1!.components).length, 1);
	assert.equal(outbound.length, 2);
	assert.equal(outbound[0]?.error?.code, 'VALIDATION_FAILED');
	assert.equal(outbound[0]?.error?.path, '/components/1/id');
	assert.equal(outbound[1]?.error?.path, '/components/2/component');
});

test('recreating a live surfaceId is refused', () => {
	const { outbound } = run(INITIAL_STATE, create, create);
	assert.equal(outbound.length, 1);
	assert.match(outbound[0]!.error!.message, /already exists/);
});

test('updateDataModel writes at a pointer, replaces at the root, deletes on null', () => {
	const a = run(INITIAL_STATE, create, {
		version: 'v1.0',
		updateDataModel: { surfaceId: 's1', path: '/user', value: { name: 'Jane', temp: 1 } }
	});
	assert.deepEqual(a.state.surfaces.s1?.dataModel, { user: { name: 'Jane', temp: 1 } });

	const b = run(a.state, {
		version: 'v1.0',
		updateDataModel: { surfaceId: 's1', path: '/user/name', value: 'Ada' }
	});
	assert.equal(
		(b.state.surfaces.s1?.dataModel as never as { user: { name: string } }).user.name,
		'Ada'
	);

	const c = run(b.state, {
		version: 'v1.0',
		updateDataModel: { surfaceId: 's1', path: '/user/temp', value: null }
	});
	assert.deepEqual(c.state.surfaces.s1?.dataModel, { user: { name: 'Ada' } });

	const d = run(c.state, {
		version: 'v1.0',
		updateDataModel: { surfaceId: 's1', value: { fresh: true } }
	});
	assert.deepEqual(d.state.surfaces.s1?.dataModel, { fresh: true });
});

test('messages for an unknown surface report instead of throwing', () => {
	const { outbound } = run(INITIAL_STATE, {
		version: 'v1.0',
		updateDataModel: { surfaceId: 'ghost', path: '/a', value: 1 }
	});
	assert.equal(outbound[0]?.error?.code, 'VALIDATION_FAILED');
	assert.match(outbound[0]!.error!.message, /Unknown surfaceId/);
});

test('deleteSurface removes the surface and its pending actions', () => {
	let { state } = run(INITIAL_STATE, create);
	state = trackPendingAction(state, 'a1', { surfaceId: 's1', responsePath: '/x' });
	const after = run(state, { version: 'v1.0', deleteSurface: { surfaceId: 's1' } });
	assert.equal(after.state.surfaces.s1, undefined);
	assert.deepEqual(after.state.pendingActions, {});
});

test('agent callFunction of a rendererOnly builtin is rejected', () => {
	const { outbound } = run(INITIAL_STATE, {
		version: 'v1.0',
		functionCallId: 'c1',
		wantResponse: true,
		callFunction: { call: 'required', args: { value: 'x' } }
	});
	assert.equal(outbound[0]?.error?.code, 'INVALID_FUNCTION_CALL');
	assert.equal(outbound[0]?.error?.functionCallId, 'c1');
});

const screenResolutionOpts = () => ({
	functions: createFunctionRegistry({
		getScreenResolution: { callableFrom: 'any' as const, run: () => ({ w: 1920, h: 1080 }) }
	})
});

test('the canonical v1.0 callRendererFunction shape round-trips', () => {
	/*
	 * The whole message as a conformant agent sends it: id and call NESTED under
	 * the key, catalogId present, and no envelope-level wantResponse. Renaming
	 * the key without adopting this shape left the reducer rejecting valid
	 * messages for a missing top-level id.
	 */
	const { outbound } = reduce(
		INITIAL_STATE,
		{
			version: 'v1.0',
			callRendererFunction: {
				functionCallId: 'c9',
				callFunction: {
					call: 'getScreenResolution',
					catalogId: 'https://example.com/catalog.json',
					args: { screenIndex: 0 }
				}
			}
		},
		screenResolutionOpts()
	);
	// FunctionResponse is additionalProperties:false over {functionCallId,value,error}
	// — no echo of the function name.
	assert.deepEqual(outbound[0]?.rendererFunctionResponse, {
		functionCallId: 'c9',
		value: { w: 1920, h: 1080 }
	});
});

test('a canonical call is answered even when the function returns nothing', () => {
	// "The renderer MUST always send a corresponding response, even if the
	// function's return type is void" — and FunctionResponse's oneOf demands
	// exactly one of value/error, so void becomes an explicit null.
	const { outbound } = reduce(
		INITIAL_STATE,
		{
			version: 'v1.0',
			callRendererFunction: {
				functionCallId: 'c10',
				callFunction: { call: 'ping', catalogId: 'https://example.com/catalog.json' }
			}
		},
		{
			functions: createFunctionRegistry({
				ping: { callableFrom: 'any' as const, run: () => undefined }
			})
		}
	);
	assert.deepEqual(outbound[0]?.rendererFunctionResponse, { functionCallId: 'c10', value: null });
});

test('the legacy callFunction key is still accepted', () => {
	/*
	 * `callFunction` was the candidate-draft name this renderer shipped before
	 * v1.0 settled on `callRendererFunction`. Agents built against the older
	 * draft must keep working, so the legacy key is normalized rather than
	 * dropped — but the REPLY is the v1.0 name either way, because that is what
	 * a conformant agent parses.
	 */
	const { outbound } = reduce(
		INITIAL_STATE,
		{
			version: 'v1.0',
			functionCallId: 'c9',
			wantResponse: true,
			callFunction: { call: 'getScreenResolution', args: { screenIndex: 0 } }
		},
		screenResolutionOpts()
	);
	assert.deepEqual(outbound[0]?.rendererFunctionResponse, {
		functionCallId: 'c9',
		value: { w: 1920, h: 1080 }
	});
	assert.equal(
		(outbound[0] as unknown as Record<string, unknown>).functionResponse,
		undefined,
		'the pre-v1.0 outbound key must not be emitted'
	);
});

test('callFunction without wantResponse stays silent', () => {
	const opts = {
		functions: createFunctionRegistry({ ping: { callableFrom: 'any' as const, run: () => true } })
	};
	const { outbound } = reduce(
		INITIAL_STATE,
		{ version: 'v1.0', functionCallId: 'c2', callFunction: { call: 'ping' } },
		opts
	);
	assert.deepEqual(outbound, []);
});

test('actionResponse writes the value at the pending action responsePath', () => {
	let { state } = run(INITIAL_STATE, create);
	state = trackPendingAction(state, 'act-1', { surfaceId: 's1', responsePath: '/suggestions' });

	const after = run(state, {
		version: 'v1.0',
		actionId: 'act-1',
		actionResponse: { value: ['apple', 'application'] }
	});
	assert.deepEqual(after.state.surfaces.s1?.dataModel, { suggestions: ['apple', 'application'] });
	assert.deepEqual(after.state.pendingActions, {}, 'pending entry is consumed');
});

test('actionResponse for an unknown actionId is ignored', () => {
	const { state, outbound } = run(INITIAL_STATE, create, {
		version: 'v1.0',
		actionId: 'nope',
		actionResponse: { value: 1 }
	});
	assert.deepEqual(outbound, []);
	assert.deepEqual(state.surfaces.s1?.dataModel, {});
});

test('rendererDataModelMetadata only includes surfaces that opted in', () => {
	const { state } = run(
		INITIAL_STATE,
		{ version: 'v1.0', createSurface: { surfaceId: 'quiet' } },
		{
			version: 'v1.0',
			createSurface: { surfaceId: 'loud', sendDataModel: true, dataModel: { a: 1 } }
		}
	);
	const meta = rendererDataModelMetadata(state);
	assert.deepEqual(meta?.a2uiRendererDataModel?.surfaces, { loud: { a: 1 } });
	assert.equal(rendererDataModelMetadata(INITIAL_STATE), undefined);
});

test('prototype-polluting data paths are refused, not applied', () => {
	const { state, outbound } = run(INITIAL_STATE, create, {
		version: 'v1.0',
		updateDataModel: { surfaceId: 's1', path: '/__proto__/pwned', value: true }
	});
	assert.equal(outbound[0]?.error?.code, 'VALIDATION_FAILED');
	assert.deepEqual(state.surfaces.s1?.dataModel, {});
	assert.equal(({} as Record<string, unknown>).pwned, undefined);
});

test('rendererCapabilitiesMetadata matches the renderer_capabilities.json shape', () => {
	const meta = rendererCapabilitiesMetadata([
		'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json'
	]);
	assert.deepEqual(meta, {
		a2uiRendererCapabilities: {
			'v1.0': {
				supportedCatalogIds: ['https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json']
			}
		}
	});
});

/* --------------------------------------------- agentFunctionResponse */

const SURFACE_WITH_PENDING = () => {
	const { state } = reduce(
		INITIAL_STATE,
		{
			version: 'v1.0',
			createSurface: {
				surfaceId: 's1',
				components: [{ id: 'root', component: 'Text', text: 'hi' }]
			}
		},
		options
	);
	return trackPendingFunctionCall(state, 'fc-1', { surfaceId: 's1', key: 'K' });
};

test('agentFunctionResponse caches the value and clears the pending call', () => {
	const { state } = reduce(
		SURFACE_WITH_PENDING(),
		{
			version: 'v1.0',
			agentFunctionResponse: { functionCallId: 'fc-1', value: { inStock: true } }
		},
		options
	);
	assert.deepEqual(state.surfaces.s1?.agentValues, { K: { inStock: true } });
	assert.deepEqual(state.pendingFunctionCalls, {});
});

test('an agent function error is cached too, so it is not re-asked forever', () => {
	/*
	 * The spec has the agent answer UNKNOWN_FUNCTION for a name it does not
	 * recognise. If the failure were not cached, the next render would find the
	 * value still missing and dispatch again — a request loop for as long as the
	 * component is on screen.
	 */
	const { state } = reduce(
		SURFACE_WITH_PENDING(),
		{
			version: 'v1.0',
			agentFunctionResponse: {
				functionCallId: 'fc-1',
				error: { code: 'UNKNOWN_FUNCTION', message: 'no such function' }
			}
		},
		options
	);
	assert.ok('K' in (state.surfaces.s1?.agentValues ?? {}), 'the failure must occupy the slot');
	assert.equal(state.surfaces.s1?.agentValues.K, undefined);
	assert.deepEqual(state.pendingFunctionCalls, {});
});

test('a response for an unknown functionCallId is ignored, not fatal', () => {
	const before = SURFACE_WITH_PENDING();
	const { state } = reduce(
		before,
		{
			version: 'v1.0',
			agentFunctionResponse: { functionCallId: 'nope', value: 1 }
		},
		options
	);
	assert.deepEqual(state.pendingFunctionCalls, before.pendingFunctionCalls);
});

test('deleting a surface drops its in-flight function calls', () => {
	// A reply arriving after teardown has nowhere to land.
	const { state } = reduce(
		SURFACE_WITH_PENDING(),
		{
			version: 'v1.0',
			deleteSurface: { surfaceId: 's1' }
		},
		options
	);
	assert.deepEqual(state.pendingFunctionCalls, {});
});
