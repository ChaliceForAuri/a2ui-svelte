import test from 'node:test';
import assert from 'node:assert/strict';
import {
	INITIAL_STATE,
	reduce,
	trackPendingAction,
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

test('agent callFunction of a host-registered function returns functionResponse', () => {
	const opts = {
		functions: createFunctionRegistry({
			getScreenResolution: { callableFrom: 'any' as const, run: () => ({ w: 1920, h: 1080 }) }
		})
	};
	const { outbound } = reduce(
		INITIAL_STATE,
		{
			version: 'v1.0',
			functionCallId: 'c9',
			wantResponse: true,
			callFunction: { call: 'getScreenResolution', args: { screenIndex: 0 } }
		},
		opts
	);
	assert.deepEqual(outbound[0]?.functionResponse, {
		functionCallId: 'c9',
		call: 'getScreenResolution',
		value: { w: 1920, h: 1080 }
	});
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
