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

import { DEMO_SCRIPT, bookingResponse } from '../../demo-script.js';

/** Open response streams, so an inbound action can push UI back. Dev-only. */
const listeners = new Set<(chunk: string) => void>();

export const POST: RequestHandler = async ({ request }) => {
	// Renderer -> agent messages arrive on the same URL, tagged by content type.
	if ((request.headers.get('content-type') ?? '').includes('a2ui')) {
		const message = (await request.json()) as RendererToAgent;
		console.log('[demo agent] received', JSON.stringify(message, null, 2));

		const action = message.action;
		if (action) {
			const steps = action.name === 'book_another' ? DEMO_SCRIPT.slice(1) : bookingResponse(action);
			// Fire and forget: the reply lands on whatever streams are open.
			void (async () => {
				for (const step of steps) {
					if ('__pause' in step) {
						await new Promise((resolve) => setTimeout(resolve, step.__pause));
						continue;
					}
					const line = JSON.stringify(step) + '\n';
					for (const send of listeners) send(line);
				}
			})();
		}

		return new Response(null, { status: 204 });
	}

	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let closed = false;
			const send = (chunk: string) => {
				if (!closed) controller.enqueue(encoder.encode(chunk));
			};
			listeners.add(send);

			const finish = () => {
				if (closed) return;
				closed = true;
				listeners.delete(send);
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
