/**
 * Line- and event-oriented stream decoding.
 *
 * A2UI's baseline wire format is JSON Lines: one complete JSON message per line,
 * delivered in order. SSE is the same payloads wrapped in `data:` frames.
 */

/** Decode a byte stream into complete lines, without splitting multi-byte chars. */
export async function* readLines(
	stream: ReadableStream<Uint8Array>,
	signal?: AbortSignal
): AsyncGenerator<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	const abort = () => void reader.cancel().catch(() => {});
	signal?.addEventListener('abort', abort, { once: true });

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			let newline: number;
			while ((newline = buffer.indexOf('\n')) !== -1) {
				const line = buffer.slice(0, newline).replace(/\r$/, '');
				buffer = buffer.slice(newline + 1);
				if (line !== '') yield line;
			}
		}
		buffer += decoder.decode();
		const tail = buffer.trim();
		if (tail !== '') yield tail;
	} finally {
		signal?.removeEventListener('abort', abort);
		reader.releaseLock();
	}
}

/** JSONL: one message per line. Malformed lines are reported and skipped. */
export async function* readJsonLines<T>(
	stream: ReadableStream<Uint8Array>,
	signal?: AbortSignal
): AsyncGenerator<T> {
	for await (const line of readLines(stream, signal)) {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) continue;
		try {
			yield JSON.parse(trimmed) as T;
		} catch {
			console.warn('[a2ui] skipping malformed JSONL line:', trimmed.slice(0, 200));
		}
	}
}

export interface SseEvent {
	event: string;
	data: string;
	id?: string;
}

/** Server-sent events, accumulating multi-line `data:` fields per frame. */
export async function* readSse(
	stream: ReadableStream<Uint8Array>,
	signal?: AbortSignal
): AsyncGenerator<SseEvent> {
	let event = 'message';
	let id: string | undefined;
	let data: string[] = [];

	for await (const line of readLinesKeepingBlanks(stream, signal)) {
		if (line === '') {
			if (data.length > 0) yield { event, data: data.join('\n'), id };
			event = 'message';
			id = undefined;
			data = [];
			continue;
		}
		if (line.startsWith(':')) continue; // comment / keep-alive

		const colon = line.indexOf(':');
		const field = colon === -1 ? line : line.slice(0, colon);
		const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');

		if (field === 'event') event = value;
		else if (field === 'data') data.push(value);
		else if (field === 'id') id = value;
	}

	if (data.length > 0) yield { event, data: data.join('\n'), id };
}

/** SSE frame boundaries are blank lines, so those must survive decoding. */
async function* readLinesKeepingBlanks(
	stream: ReadableStream<Uint8Array>,
	signal?: AbortSignal
): AsyncGenerator<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	const abort = () => void reader.cancel().catch(() => {});
	signal?.addEventListener('abort', abort, { once: true });

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let newline: number;
			while ((newline = buffer.indexOf('\n')) !== -1) {
				yield buffer.slice(0, newline).replace(/\r$/, '');
				buffer = buffer.slice(newline + 1);
			}
		}
		buffer += decoder.decode();
		if (buffer !== '') yield buffer.replace(/\r$/, '');
		yield '';
	} finally {
		signal?.removeEventListener('abort', abort);
		reader.releaseLock();
	}
}
