import type { AgentToRenderer, RendererToAgent } from '../protocol/types.js';

/**
 * A2UI is transport-agnostic: A2A, AG-UI, plain HTTP+JSONL and SSE all carry the
 * same messages. Everything above this interface is transport-independent.
 */
export interface Transport {
	/** Deliver a renderer-originated message (action, functionResponse, error). */
	send(message: RendererToAgent): void | Promise<void>;
	/** Register an inbound handler. Returns an unsubscribe function. */
	subscribe(handler: (message: AgentToRenderer) => void): () => void;
	/** Begin receiving, if the transport needs an explicit kick. */
	start?(): void | Promise<void>;
	close?(): void;
}

export type MessageHandler = (message: AgentToRenderer) => void;

/** Minimal multi-subscriber fan-out shared by the built-in transports. */
export function createEmitter(): {
	emit: MessageHandler;
	subscribe: (handler: MessageHandler) => () => void;
	clear: () => void;
} {
	const handlers = new Set<MessageHandler>();
	return {
		emit(message) {
			for (const handler of handlers) {
				try {
					handler(message);
				} catch (err) {
					console.error('[a2ui] transport subscriber threw', err);
				}
			}
		},
		subscribe(handler) {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},
		clear() {
			handlers.clear();
		}
	};
}
