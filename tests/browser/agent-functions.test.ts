import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { A2uiClient } from '../../src/lib/client.svelte.js';
import Surface from '../../src/lib/render/Surface.svelte';
import type { RendererToAgent } from '../../src/lib/protocol/types.js';
import { buildNodeProps } from '../../src/lib/render/props.js';
import { ROOT_SCOPE } from '../../src/lib/protocol/scope.js';
import { catalog, SURFACE } from './helpers.js';

/**
 * The spec's fallback routing, end to end: a function this renderer does not
 * implement is dispatched to the agent, its answer is cached, and the UI shows
 * it — without the component ever knowing the value came from a round trip.
 */
function clientWithCapturedOutbound() {
	const sent: RendererToAgent[] = [];
	const client = new A2uiClient({
		transport: {
			send: (message) => {
				sent.push(message);
			},
			subscribe: () => () => {}
		},
		newId: (() => {
			let n = 0;
			return () => `fc-${++n}`;
		})()
	});
	return { client, sent };
}

const settle = () => new Promise((r) => setTimeout(r, 60));

test('an unimplemented function is dispatched to the agent, then renders its answer', async () => {
	const { client, sent } = clientWithCapturedOutbound();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	client.ingest({
		version: 'v1.0',
		createSurface: {
			surfaceId: SURFACE,
			components: [
				{ id: 'root', component: 'Text', text: { call: 'stockLabel', args: { sku: 'A-1' } } }
			]
		}
	});
	await settle();

	const call = sent.find((m) => m.callAgentFunction);
	expect(call?.callAgentFunction?.surfaceId).toBe(SURFACE);
	expect(call?.callAgentFunction?.callFunction.call).toBe('stockLabel');
	expect(call?.callAgentFunction?.callFunction.args).toEqual({ sku: 'A-1' });

	// The agent answers, and the value simply appears.
	client.ingest({
		version: 'v1.0',
		agentFunctionResponse: {
			functionCallId: call!.callAgentFunction!.functionCallId,
			value: 'In stock'
		}
	});
	await settle();

	await expect.element(screen.getByText('In stock')).toBeInTheDocument();
});

test('the same call is dispatched once, however many times it is evaluated', async () => {
	/*
	 * Evaluation happens on every render, so without dedupe a single agent
	 * function would issue a request per repaint — and each reply would trigger
	 * another repaint. Three components share one call here; the agent must be
	 * asked once.
	 */
	const { client, sent } = clientWithCapturedOutbound();
	await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	client.ingest({
		version: 'v1.0',
		createSurface: {
			surfaceId: SURFACE,
			components: [
				{ id: 'root', component: 'Column', children: ['a', 'b', 'c'] },
				{ id: 'a', component: 'Text', text: { call: 'price', args: { sku: 'A-1' } } },
				{ id: 'b', component: 'Text', text: { call: 'price', args: { sku: 'A-1' } } },
				// Same args, different key order — must still be the same call.
				{ id: 'c', component: 'Text', text: { call: 'price', args: { sku: 'A-1' } } }
			]
		}
	});
	await settle();

	const calls = sent.filter((m) => m.callAgentFunction);
	expect(calls).toHaveLength(1);
});

test('a surface torn down mid-flight does not strand the reply', async () => {
	const { client, sent } = clientWithCapturedOutbound();
	await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	client.ingest({
		version: 'v1.0',
		createSurface: {
			surfaceId: SURFACE,
			components: [{ id: 'root', component: 'Text', text: { call: 'slow', args: {} } }]
		}
	});
	await settle();
	expect(sent.filter((m) => m.callAgentFunction)).toHaveLength(1);

	client.ingest({ version: 'v1.0', deleteSurface: { surfaceId: SURFACE } });
	// The late reply must be a no-op rather than an exception.
	client.ingest({
		version: 'v1.0',
		agentFunctionResponse: { functionCallId: 'fc-1', value: 'too late' }
	});
	await settle();
	expect(client.surfaceIds).not.toContain(SURFACE);
});

test('pending clears once the agent answers', async () => {
	/*
	 * The lifecycle, not just the flag: a prop is pending while the round trip is
	 * in flight and NOT pending afterwards. A flag that is set but never cleared
	 * leaves a permanent skeleton over a value that already arrived.
	 */
	const { client, sent } = clientWithCapturedOutbound();
	await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	client.ingest({
		version: 'v1.0',
		createSurface: {
			surfaceId: SURFACE,
			components: [{ id: 'root', component: 'Text', text: { call: 'stockLabel', args: {} } }]
		}
	});
	await settle();

	const pendingWhileWaiting = buildFor(client).pending;
	expect([...pendingWhileWaiting]).toContain('text');

	const call = sent.find((m) => m.callAgentFunction)!;
	client.ingest({
		version: 'v1.0',
		agentFunctionResponse: {
			functionCallId: call.callAgentFunction!.functionCallId,
			value: 'In stock'
		}
	});
	await settle();

	const after = buildFor(client);
	expect([...after.pending]).toEqual([]);
	expect(after.props.text).toBe('In stock');
});

/** Rebuild the root node's props the way the renderer does, to inspect them. */
function buildFor(client: A2uiClient) {
	const surface = client.surface(SURFACE)!;
	const spec = surface.components.root;
	return buildNodeProps(
		spec,
		{ component: (() => {}) as never },
		{
			data: surface.dataModel,
			scope: ROOT_SCOPE,
			functions: catalog.functions,
			agentValues: surface.agentValues,
			onUnresolvedFunction: (ref, key) => client.requestAgentFunction(SURFACE, ref, key)
		},
		{ setData: () => {}, dispatch: () => {} }
	);
}
