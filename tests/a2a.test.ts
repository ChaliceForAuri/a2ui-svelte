import test from 'node:test';
import assert from 'node:assert/strict';
import {
	A2UI_MIME_TYPE,
	a2uiDataPart,
	createA2aTransport,
	extractA2uiFromA2a,
	extractA2uiParts,
	toA2aOutbound
} from '../src/lib/transport/a2a.ts';
import type { AgentToRenderer, RendererToAgent } from '../src/lib/protocol/types.ts';

const create: AgentToRenderer = {
	version: 'v1.0',
	createSurface: { surfaceId: 's' }
};
const update: AgentToRenderer = {
	version: 'v1.0',
	updateComponents: { surfaceId: 's', components: [{ id: 'root', component: 'Text' }] }
};

const part = (data: unknown, mimeType = A2UI_MIME_TYPE) => ({
	kind: 'data',
	data,
	metadata: { mimeType }
});

test('A2UI messages are extracted, in order, from a marked DataPart', () => {
	const parts = [
		{ kind: 'text', text: 'Here is your dashboard' },
		part([create, update]),
		{
			kind: 'data',
			data: [{ some: 'other tool payload' }],
			metadata: { mimeType: 'application/json' }
		}
	];
	assert.deepEqual(extractA2uiParts(parts), [create, update]);
});

test('non-envelope entries in the list are skipped, the rest survive', () => {
	const parts = [part([create, { garbage: true }, update])];
	assert.deepEqual(extractA2uiParts(parts), [create, update]);
});

test('a legacy-MIME part and a bare-object data payload are tolerated', () => {
	assert.deepEqual(extractA2uiParts([part([create], 'application/json+a2ui')]), [create]);
	assert.deepEqual(extractA2uiParts([part(create)]), [create]);
});

test('extraction walks Messages, Tasks, artifacts and status updates', () => {
	const message = { role: 'agent', parts: [part([create])] };
	assert.deepEqual(extractA2uiFromA2a(message), [create]);

	const task = {
		id: 't1',
		artifacts: [{ artifactId: 'a1', parts: [part([create])] }],
		status: { state: 'working', message: { parts: [part([update])] } }
	};
	assert.deepEqual(extractA2uiFromA2a(task), [create, update]);

	const artifactUpdate = { taskId: 't1', artifact: { parts: [part([update])] } };
	assert.deepEqual(extractA2uiFromA2a(artifactUpdate), [update]);

	assert.deepEqual(extractA2uiFromA2a({ unrelated: true }), []);
	assert.deepEqual(extractA2uiFromA2a(null), []);
});

test('a2uiDataPart emits the canonical wire shape with an array payload', () => {
	assert.deepEqual(a2uiDataPart([create]), {
		kind: 'data',
		data: [create],
		metadata: { mimeType: A2UI_MIME_TYPE }
	});
});

test('toA2aOutbound lifts envelope metadata onto the A2A message', () => {
	const action: RendererToAgent = {
		version: 'v1.0',
		action: {
			name: 'submit',
			surfaceId: 's',
			sourceComponentId: 'go',
			timestamp: '2026-08-15T00:00:00.000Z',
			context: {}
		},
		metadata: {
			a2uiRendererCapabilities: { 'v1.0': { supportedCatalogIds: ['cat'] } }
		}
	};

	const outbound = toA2aOutbound(action);
	assert.deepEqual(outbound.metadata, {
		a2uiRendererCapabilities: { 'v1.0': { supportedCatalogIds: ['cat'] } }
	});
	// The envelope inside the DataPart no longer carries the lifted metadata.
	assert.deepEqual(outbound.parts, [
		a2uiDataPart([{ version: 'v1.0', action: action.action } as RendererToAgent])
	]);
});

test('the transport pumps events to subscribers and wraps sends', async () => {
	const received: AgentToRenderer[] = [];
	const posted: unknown[] = [];

	async function* events() {
		yield { role: 'agent', parts: [part([create, update])] };
		yield { unrelated: true };
	}

	const transport = createA2aTransport({
		events: events(),
		send: (outbound) => void posted.push(outbound)
	});
	transport.subscribe((m) => received.push(m));
	await transport.start?.();

	assert.deepEqual(received, [create, update]);

	await transport.send({
		version: 'v1.0',
		error: { code: 'VALIDATION_FAILED', message: 'x', surfaceId: 's' }
	});
	assert.equal(posted.length, 1);
	const outbound = posted[0] as { parts: { data: unknown[] }[] };
	assert.equal(outbound.parts[0]!.data.length, 1);
});

test('a v1.0 callRendererFunction is recognized as an A2UI envelope', () => {
	/*
	 * Transports decide whether a payload is A2UI at all by looking for an
	 * envelope key. When the list omitted `callRendererFunction`, a conformant
	 * agent's function call was not a degraded message — it was an INVISIBLE
	 * one, silently discarded here before the reducer could handle it. Both
	 * transports shared the omission because both had their own copy of the list.
	 */
	const call = {
		version: 'v1.0',
		callRendererFunction: {
			functionCallId: 'c1',
			callFunction: { call: 'getScreenResolution', catalogId: 'https://example.com/catalog.json' }
		}
	};
	const response = { version: 'v1.0', agentFunctionResponse: { value: 1 } };
	const parts = extractA2uiParts([a2uiDataPart([call, response])]);
	assert.equal(parts.length, 2, 'both v1.0 function messages must survive extraction');
	assert.equal(parts[0]?.callRendererFunction?.callFunction.call, 'getScreenResolution');
});
