/**
 * A mock A2UI agent.
 *
 * Streams the spec's contact-form fixture as JSONL with deliberate pauses, and
 * deliberately sends leaf components *before* `root` — that ordering is legal
 * and is exactly what the buffering rule exists for. Watching this endpoint is
 * the fastest way to see progressive rendering behave.
 *
 * The stream stays open after the script finishes so the agent can answer an
 * action with more UI, which is how A2UI actually works: an action is a
 * request, not a form submission.
 */

import type { RequestHandler } from './$types';
import type { RendererToAgent } from '$lib/protocol/types.js';

import { DEMO_SCRIPT, agentResponse } from '../../demo-script.js';

/**
 * Open response streams, keyed by the caller's session so a reply reaches only
 * the browser that acted — a module-global set would broadcast one visitor's
 * booking (and their email) to every open stream. Dev-only mock agent.
 */
const listeners = new Map<string, Set<(chunk: string) => void>>();

/** The demo page sends this on both the stream request and its actions. */
const sessionOf = (request: Request) => request.headers.get('x-demo-session') ?? 'anonymous';

export const POST: RequestHandler = async ({ request }) => {
	// Renderer -> agent messages arrive on the same URL, tagged by content type.
	if ((request.headers.get('content-type') ?? '').includes('a2ui')) {
		const message = (await request.json()) as RendererToAgent;
		console.log('[demo agent] received', JSON.stringify(message, null, 2));

		const action = message.action;
		if (action) {
			const steps = agentResponse(action);
			const session = sessionOf(request);
			// Fire and forget: the reply lands on this session's open streams.
			void (async () => {
				for (const step of steps) {
					if ('__pause' in step) {
						await new Promise((resolve) => setTimeout(resolve, step.__pause));
						continue;
					}
					const line = JSON.stringify(step) + '\n';
					for (const send of listeners.get(session) ?? []) send(line);
				}
			})();
		}

		return new Response(null, { status: 204 });
	}

	const encoder = new TextEncoder();
	const session = sessionOf(request);

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let closed = false;
			const send = (chunk: string) => {
				if (!closed) controller.enqueue(encoder.encode(chunk));
			};
			const forSession = listeners.get(session) ?? new Set();
			forSession.add(send);
			listeners.set(session, forSession);

			const finish = () => {
				if (closed) return;
				closed = true;
				forSession.delete(send);
				if (forSession.size === 0) listeners.delete(session);
				try {
					controller.close();
				} catch {
					// Already closed by the client disconnecting.
				}
			};
			request.signal.addEventListener('abort', finish, { once: true });

			for (const step of DEMO_SCRIPT) {
				if (closed) return;
				if ('__pause' in step) {
					await new Promise((resolve) => setTimeout(resolve, step.__pause));
					continue;
				}
				send(JSON.stringify(step) + '\n');
			}
			// Deliberately not closed: the agent may still have something to say.
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'application/a2ui+json',
			'cache-control': 'no-store',
			// Stop reverse proxies buffering the stream into one chunk.
			'x-accel-buffering': 'no'
		}
	});
};
