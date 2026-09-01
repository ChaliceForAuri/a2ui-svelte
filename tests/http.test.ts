import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpTransport } from '../src/lib/transport/http.ts';
import type { AgentToRenderer, RendererToAgent } from '../src/lib/protocol/types.ts';

const create: AgentToRenderer = { version: 'v1.0', createSurface: { surfaceId: 's' } };
const update = (text: string): AgentToRenderer => ({
	version: 'v1.0',
	updateComponents: { surfaceId: 's', components: [{ id: 'root', component: 'Text', text }] }
});

/** A JSONL response body, as a serverless turn would return it. */
function jsonl(messages: AgentToRenderer[], init: ResponseInit = {}): Response {
	const body = messages.map((m) => JSON.stringify(m) + '\n').join('');
	return new Response(body, {
		status: 200,
		headers: { 'content-type': 'application/a2ui+json' },
		...init
	});
}

const action = (name: string): RendererToAgent => ({
	version: 'v1.0',
	action: { name, surfaceId: 's', sourceComponentId: 'b', timestamp: 'now', context: {} }
});

test('turn-based mode emits the messages returned by send()', async () => {
	const received: AgentToRenderer[] = [];
	const transport = createHttpTransport({
		url: '/agent',
		turnBased: true,
		fetch: async () => jsonl([create, update('after the action')])
	});
	transport.subscribe((m) => received.push(m));

	await transport.send(action('go'));

	assert.deepEqual(received, [create, update('after the action')]);
});

test('the default mode still discards the send response', async () => {
	const received: AgentToRenderer[] = [];
	const transport = createHttpTransport({
		url: '/agent',
		fetch: async () => jsonl([update('ignored')])
	});
	transport.subscribe((m) => received.push(m));

	await transport.send(action('go'));

	assert.deepEqual(received, []);
});

test('turns are serialised, so replies cannot interleave', async () => {
	const received: string[] = [];
	let call = 0;
	const transport = createHttpTransport({
		url: '/agent',
		turnBased: true,
		// The first turn resolves slowly; without chaining, the second would win.
		fetch: async () => {
			const mine = ++call;
			if (mine === 1) await new Promise((r) => setTimeout(r, 30));
			return jsonl([update(`turn ${mine}`)]);
		}
	});
	transport.subscribe((m) => {
		const spec = m.updateComponents?.components?.[0] as { text?: string } | undefined;
		if (spec?.text) received.push(spec.text);
	});

	const first = transport.send(action('one'));
	const second = transport.send(action('two'));
	await Promise.all([first, second]);

	assert.deepEqual(received, ['turn 1', 'turn 2']);
});

test('a 204 turn is silence, not an error', async () => {
	const errors: unknown[] = [];
	const transport = createHttpTransport({
		url: '/agent',
		turnBased: true,
		onTurnError: (e) => errors.push(e),
		fetch: async () => new Response(null, { status: 204 })
	});

	await transport.send(action('go'));

	assert.deepEqual(errors, []);
});

test('a failed turn reaches onTurnError instead of rejecting the dispatch', async () => {
	const errors: { error: unknown; message: RendererToAgent }[] = [];
	const transport = createHttpTransport({
		url: '/agent',
		turnBased: true,
		onTurnError: (error, message) => errors.push({ error, message }),
		fetch: async () => new Response('nope', { status: 500, statusText: 'Server Error' })
	});

	// Must not throw: a failing conversation is not a renderer fault.
	await transport.send(action('go'));

	assert.equal(errors.length, 1);
	assert.match(String((errors[0]!.error as Error).message), /500/);
	assert.equal(errors[0]!.message.action?.name, 'go');
});

test('one failed turn does not poison the queue', async () => {
	const received: AgentToRenderer[] = [];
	let call = 0;
	const transport = createHttpTransport({
		url: '/agent',
		turnBased: true,
		onTurnError: () => {},
		fetch: async () =>
			++call === 1 ? new Response('nope', { status: 500 }) : jsonl([update('recovered')])
	});
	transport.subscribe((m) => received.push(m));

	await transport.send(action('one'));
	await transport.send(action('two'));

	assert.deepEqual(received, [update('recovered')]);
});

test('turn-based send negotiates content type like start does', async () => {
	const received: AgentToRenderer[] = [];
	const transport = createHttpTransport({
		url: '/agent',
		turnBased: true,
		fetch: async () =>
			new Response(`data: ${JSON.stringify(update('via sse'))}\n\n`, {
				headers: { 'content-type': 'text/event-stream' }
			})
	});
	transport.subscribe((m) => received.push(m));

	await transport.send(action('go'));

	assert.deepEqual(received, [update('via sse')]);
});
