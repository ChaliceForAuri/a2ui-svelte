/**
 * A2A transport binding.
 *
 * A2A (Agent2Agent) is the agent-to-agent protocol; A2UI rides in it as an
 * extension (`https://a2ui.org/a2a-extension/a2ui/v1.0`). A2UI messages travel
 * as an *array* inside an A2A `DataPart` marked with
 * `metadata.mimeType = "application/a2ui+json"`; those parts appear on
 * `Message.parts`, on `Task` artifacts, and on streamed status/artifact
 * update events.
 *
 * Deliberately not an A2A client: the host brings whatever A2A SDK it uses
 * and feeds this transport the Message/Task/event objects it receives —
 * mirroring the AG-UI adapter. This module knows how to *extract* A2UI from
 * A2A values and how to *wrap* renderer messages back into A2A shape.
 */

import type { AgentToRenderer, RendererToAgent } from '../protocol/types.js';
import { createEmitter, type Transport } from './types.js';

export const A2UI_MIME_TYPE = 'application/a2ui+json';
/** Pre-v0.9.1 drafts used the reversed form. Accepted on input, never emitted. */
export const A2UI_MIME_TYPE_LEGACY = 'application/json+a2ui';
/** Advertise via the `X-A2A-Extensions` header (or gRPC metadata) to activate. */
export const A2UI_A2A_EXTENSION_URI = 'https://a2ui.org/a2a-extension/a2ui/v1.0';

/** The wire shape of an A2UI-bearing A2A DataPart. */
export interface A2aDataPart {
	kind: 'data';
	data: unknown;
	metadata?: Record<string, unknown>;
	[k: string]: unknown;
}

const ENVELOPE_KEYS = [
	'createSurface',
	'updateComponents',
	'updateDataModel',
	'deleteSurface',
	'callFunction',
	'actionResponse'
];

function isA2uiEnvelope(value: unknown): value is AgentToRenderer {
	if (!value || typeof value !== 'object') return false;
	return ENVELOPE_KEYS.some((k) => k in (value as Record<string, unknown>));
}

function isA2uiDataPart(part: unknown): part is A2aDataPart {
	if (!part || typeof part !== 'object') return false;
	const record = part as Record<string, unknown>;
	if (record.kind !== undefined && record.kind !== 'data') return false;
	const mime = (record.metadata as Record<string, unknown> | undefined)?.mimeType;
	return mime === A2UI_MIME_TYPE || mime === A2UI_MIME_TYPE_LEGACY;
}

/** Pull A2UI messages out of a `parts` array (an A2A Message or Artifact). */
export function extractA2uiParts(parts: readonly unknown[]): AgentToRenderer[] {
	const out: AgentToRenderer[] = [];
	for (const part of parts) {
		if (!isA2uiDataPart(part)) continue;
		const data = part.data;
		if (Array.isArray(data)) {
			// The list is not transactional: keep whatever validates, skip the rest.
			out.push(...data.filter(isA2uiEnvelope));
		} else if (isA2uiEnvelope(data)) {
			console.warn('[a2ui] A2A DataPart.data should be an array of messages; got one object');
			out.push(data);
		}
	}
	return out;
}

/**
 * Extract A2UI messages from any A2A value a client library may surface:
 * a `Message` (`{parts}`), a `Task` (`{artifacts, status}`), or the streamed
 * `TaskStatusUpdateEvent` / `TaskArtifactUpdateEvent` shapes. Order follows
 * the containers: direct parts, then artifacts, then the status message.
 */
export function extractA2uiFromA2a(value: unknown): AgentToRenderer[] {
	if (!value || typeof value !== 'object') return [];
	const record = value as Record<string, unknown>;
	const out: AgentToRenderer[] = [];

	if (Array.isArray(record.parts)) out.push(...extractA2uiParts(record.parts));
	if (Array.isArray(record.artifacts)) {
		for (const artifact of record.artifacts) out.push(...extractA2uiFromA2a(artifact));
	}
	// TaskArtifactUpdateEvent carries a single `artifact`.
	if (record.artifact) out.push(...extractA2uiFromA2a(record.artifact));
	// Task.status.message / TaskStatusUpdateEvent.status.message.
	const status = record.status as Record<string, unknown> | undefined;
	if (status?.message) out.push(...extractA2uiFromA2a(status.message));

	return out;
}

/** Build the DataPart for a list of A2UI messages (either direction). */
export function a2uiDataPart(
	messages: readonly (AgentToRenderer | RendererToAgent)[]
): A2aDataPart {
	return { kind: 'data', data: [...messages], metadata: { mimeType: A2UI_MIME_TYPE } };
}

/** What the host should place on its outbound A2A `SendMessage` request. */
export interface A2aOutbound {
	/** Goes on `message.parts`. */
	parts: A2aDataPart[];
	/** Goes on `message.metadata` — capabilities and data-model sync live here. */
	metadata?: Record<string, unknown>;
}

/**
 * Wrap one renderer → agent message for A2A. The extension spec puts
 * `a2uiRendererCapabilities` / `a2uiRendererDataModel` on the A2A message's
 * `metadata`, not inside the envelope, so envelope metadata is lifted out.
 */
export function toA2aOutbound(message: RendererToAgent): A2aOutbound {
	const { metadata, ...envelope } = message;
	return { parts: [a2uiDataPart([envelope])], metadata };
}

export interface A2aTransportOptions {
	/**
	 * Source of A2A values: `Message`s, `Task`s, or streaming events, exactly
	 * as the host's A2A client yields them.
	 */
	events: AsyncIterable<unknown>;
	/** Deliver a renderer → agent message back to the A2A agent. */
	send?: (outbound: A2aOutbound) => void | Promise<void>;
	onError?: (error: unknown) => void;
}

export function createA2aTransport(options: A2aTransportOptions): Transport {
	const emitter = createEmitter();
	let cancelled = false;

	async function pump() {
		for await (const event of options.events) {
			if (cancelled) return;
			// One DataPart's list is emitted in one synchronous loop, so Svelte's
			// batched flush repaints once per list — the spec's "no intermediate
			// repaints" guidance falls out for free.
			for (const message of extractA2uiFromA2a(event)) emitter.emit(message);
		}
	}

	return {
		start() {
			return pump().catch((error) => {
				if (cancelled) return;
				(options.onError ?? ((e) => console.error('[a2ui] A2A transport error', e)))(error);
			});
		},
		subscribe: emitter.subscribe,
		send(message) {
			return options.send?.(toA2aOutbound(message));
		},
		close() {
			cancelled = true;
			emitter.clear();
		}
	};
}
