/**
 * HTTP transport: POST a request, read A2UI messages back as JSONL or SSE.
 *
 * This is the baseline that works with any `+server.ts` endpoint. It negotiates
 * by response `content-type`, so an endpoint can switch between `application/
 * a2ui+json` (JSONL) and `text/event-stream` without a client change.
 */

import type { AgentToRenderer, RendererToAgent } from '../protocol/types.js';
import { readJsonLines, readSse } from './stream.js';
import { createEmitter, type Transport } from './types.js';

export interface HttpTransportOptions {
	/** Endpoint that streams A2UI messages. */
	url: string;
	/** Extra headers, e.g. authorization. */
	headers?: Record<string, string>;
	/** Body for the initial request. Defaults to `{}`. */
	body?: unknown;
	/** Where renderer -> agent messages go. Defaults to `url`. */
	sendUrl?: string;
	/**
	 * Turn-based (request/response) mode: read each `send()`'s response as A2UI
	 * messages and emit them, exactly as `start()` reads its own.
	 *
	 * The default assumes an agent that can push down a long-lived stream. A
	 * serverless agent cannot — two invocations share nothing — so there the
	 * natural contract is that the response to an action *is* the agent's next
	 * batch of messages. Without this, that reply is read and discarded, and the
	 * surface renders its first frame and then goes quiet.
	 */
	turnBased?: boolean;
	/**
	 * Where a failed turn goes (turn-based mode only). A turn failing is a
	 * conversation problem, not a renderer fault, so it is reported here instead
	 * of rejecting inside the component's action dispatch — leaving the host free
	 * to show the failure in-model. Falls back to `onError`.
	 */
	onTurnError?: (error: unknown, message: RendererToAgent) => void;
	fetch?: typeof globalThis.fetch;
	signal?: AbortSignal;
	onError?: (error: unknown) => void;
}

export function createHttpTransport(options: HttpTransportOptions): Transport {
	const emitter = createEmitter();
	const controller = new AbortController();
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

	if (options.signal) {
		if (options.signal.aborted) controller.abort();
		else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
	}

	let started = false;

	/** Read one response body as A2UI messages, negotiating by content-type. */
	async function consume(response: Response): Promise<void> {
		if (!response.body) {
			throw new Error('A2UI transport received a response with no body');
		}

		const contentType = response.headers.get('content-type') ?? '';

		if (contentType.includes('text/event-stream')) {
			for await (const frame of readSse(response.body, controller.signal)) {
				if (frame.event === 'done') break;
				try {
					emitter.emit(JSON.parse(frame.data) as AgentToRenderer);
				} catch {
					console.warn('[a2ui] skipping malformed SSE frame');
				}
			}
			return;
		}

		for await (const message of readJsonLines<AgentToRenderer>(response.body, controller.signal)) {
			emitter.emit(message);
		}
	}

	async function pump(): Promise<void> {
		const response = await doFetch(options.url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/a2ui+json, text/event-stream',
				...options.headers
			},
			body: JSON.stringify(options.body ?? {}),
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`A2UI transport failed: ${response.status} ${response.statusText}`);
		}
		await consume(response);
	}

	/*
	 * Turns are serialised. Two actions fired in quick succession would otherwise
	 * interleave their replies, and `updateComponents` is order-sensitive — the
	 * later arrival wins per id. Sequential is also what "turn-based" means.
	 */
	let turn: Promise<void> = Promise.resolve();

	async function runTurn(message: RendererToAgent): Promise<void> {
		const response = await doFetch(options.sendUrl ?? options.url, {
			method: 'POST',
			headers: {
				'content-type': 'application/a2ui+json',
				accept: 'application/a2ui+json, text/event-stream',
				...options.headers
			},
			body: JSON.stringify(message),
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`A2UI turn failed: ${response.status} ${response.statusText}`);
		}
		// 204, or any empty body: the agent had nothing to say to this action.
		if (response.status === 204 || !response.body) return;
		await consume(response);
	}

	return {
		start() {
			if (started) return;
			started = true;
			return pump().catch((error) => {
				if (controller.signal.aborted) return;
				(options.onError ?? ((e) => console.error('[a2ui] transport error', e)))(error);
			});
		},

		subscribe: emitter.subscribe,

		send(message: RendererToAgent) {
			if (!options.turnBased) {
				return doFetch(options.sendUrl ?? options.url, {
					method: 'POST',
					headers: { 'content-type': 'application/a2ui+json', ...options.headers },
					body: JSON.stringify(message),
					signal: controller.signal
				}).then(() => undefined);
			}

			// Chained, and never rejecting: one failed turn must not poison the
			// queue or surface as an exception inside the renderer's dispatch.
			turn = turn.then(() =>
				runTurn(message).catch((error) => {
					if (controller.signal.aborted) return;
					const report =
						options.onTurnError ??
						options.onError ??
						((e: unknown) => console.error('[a2ui] turn failed', e));
					report(error as never, message as never);
				})
			);
			return turn;
		},

		close() {
			controller.abort();
			emitter.clear();
		}
	};
}

/**
 * In-memory transport for tests, demos and offline playgrounds: feed it a list
 * of messages and it replays them, optionally with a delay between each so you
 * can watch progressive rendering happen.
 */
export function createMockTransport(
	messages: AgentToRenderer[],
	options: { delayMs?: number; onSend?: (message: RendererToAgent) => void } = {}
): Transport {
	const emitter = createEmitter();
	let cancelled = false;

	return {
		async start() {
			for (const message of messages) {
				if (cancelled) return;
				if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
				emitter.emit(message);
			}
		},
		subscribe: emitter.subscribe,
		send(message) {
			options.onSend?.(message);
		},
		close() {
			cancelled = true;
			emitter.clear();
		}
	};
}
