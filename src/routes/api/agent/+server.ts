/**
 * A mock A2UI agent.
 *
 * Streams the spec's contact-form fixture as JSONL with deliberate pauses, and
 * deliberately sends leaf components *before* `root` — that ordering is legal
 * and is exactly what the buffering rule exists for. Watching this endpoint is
 * the fastest way to see progressive rendering behave.
 */

import type { RequestHandler } from './$types';
import type { RendererToAgent } from '$lib/protocol/types.js';

import { DEMO_SCRIPT } from '../../demo-script.js';
export const POST: RequestHandler = async ({ request }) => {
	// Renderer -> agent messages arrive on the same URL, tagged by content type.
	if ((request.headers.get('content-type') ?? '').includes('a2ui')) {
		const message = (await request.json()) as RendererToAgent;
		console.log('[demo agent] received', JSON.stringify(message, null, 2));
		return new Response(null, { status: 204 });
	}

	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for (const step of DEMO_SCRIPT) {
					if (request.signal.aborted) break;
					if ('__pause' in step) {
						await new Promise((resolve) => setTimeout(resolve, step.__pause));
						continue;
					}
					controller.enqueue(encoder.encode(JSON.stringify(step) + '\n'));
				}
			} finally {
				controller.close();
			}
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
