/**
 * AG-UI transport binding.
 *
 * AG-UI is the event/transport protocol; A2UI is the payload. A2UI messages ride
 * inside `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA` events, which is why
 * `ACTIVITY_DELTA.patch` is RFC 6902 — it incrementally mutates a live activity
 * as the model streams.
 *
 * The activity payload shape is the one part of this pairing that is still
 * settling across implementations, so extraction is pluggable: override
 * `extract` if your backend nests A2UI differently.
 */

import { ENVELOPE_KEYS } from '../protocol/types.js';
import type { AgentToRenderer, RendererToAgent } from '../protocol/types.js';
import { applyPatch, type PatchOp } from './json-patch.js';
import { createEmitter, type Transport } from './types.js';

export interface AgUiEvent {
	type: string;
	messageId?: string;
	activityType?: string;
	content?: Record<string, unknown>;
	patch?: PatchOp[];
	replace?: boolean;
	[k: string]: unknown;
}

/**
 * Activity types conventionally used to carry A2UI. `a2ui-surface` is what
 * AG-UI's official `@ag-ui/a2ui-middleware` emits; the rest appear in earlier
 * integrations (`application/json+a2ui` is the pre-v0.9.1 MIME).
 */
export const A2UI_ACTIVITY_TYPES = [
	'a2ui-surface',
	'a2ui',
	'application/a2ui+json',
	'application/json+a2ui'
];

/**
 * Pull zero or more A2UI messages out of an activity payload. Handles the three
 * shapes seen in the wild: a bare envelope, `{ a2ui: envelope }`, and
 * `{ messages: [envelope, ...] }`.
 */
export function defaultExtract(content: unknown): AgentToRenderer[] {
	if (!content || typeof content !== 'object') return [];
	const record = content as Record<string, unknown>;

	if (Array.isArray(record.messages)) {
		return record.messages.filter(isA2uiEnvelope);
	}
	if (record.a2ui !== undefined) {
		return Array.isArray(record.a2ui)
			? record.a2ui.filter(isA2uiEnvelope)
			: isA2uiEnvelope(record.a2ui)
				? [record.a2ui]
				: [];
	}
	return isA2uiEnvelope(record) ? [record] : [];
}

function isA2uiEnvelope(value: unknown): value is AgentToRenderer {
	if (!value || typeof value !== 'object') return false;
	return ENVELOPE_KEYS.some((k) => k in (value as Record<string, unknown>));
}

export interface AgUiTransportOptions {
	/** Source of AG-UI events — an async iterable is the common case. */
	events: AsyncIterable<AgUiEvent>;
	/** Deliver renderer -> agent messages back to the AG-UI backend. */
	send?: (message: RendererToAgent) => void | Promise<void>;
	activityTypes?: readonly string[];
	extract?: (content: unknown) => AgentToRenderer[];
	onError?: (error: unknown) => void;
}

export function createAgUiTransport(options: AgUiTransportOptions): Transport {
	const emitter = createEmitter();
	const extract = options.extract ?? defaultExtract;
	const activityTypes = new Set(options.activityTypes ?? A2UI_ACTIVITY_TYPES);

	/** Live activity content per messageId, so deltas have something to patch. */
	const activities = new Map<string, unknown>();
	let cancelled = false;

	async function pump() {
		for await (const event of options.events) {
			if (cancelled) return;

			if (event.type === 'ACTIVITY_SNAPSHOT') {
				if (!isA2uiActivity(event)) continue;
				const key = event.messageId ?? '';
				const content =
					event.replace === false && activities.has(key)
						? { ...(activities.get(key) as object), ...(event.content ?? {}) }
						: (event.content ?? {});
				activities.set(key, content);
				for (const message of extract(content)) emitter.emit(message);
				continue;
			}

			if (event.type === 'ACTIVITY_DELTA') {
				if (!isA2uiActivity(event)) continue;
				const key = event.messageId ?? '';
				const before = activities.get(key) ?? {};
				try {
					const after = applyPatch(before, event.patch ?? []);
					activities.set(key, after);
					for (const message of extract(after)) emitter.emit(message);
				} catch (error) {
					// Divergence: the spec's guidance is to re-request a snapshot.
					options.onError?.(error);
					console.warn('[a2ui] ACTIVITY_DELTA failed to apply; awaiting next snapshot', error);
				}
				continue;
			}

			if (event.type === 'RUN_ERROR') {
				options.onError?.(new Error(String(event.message ?? 'AG-UI run error')));
			}
		}
	}

	function isA2uiActivity(event: AgUiEvent): boolean {
		// An untyped activity is assumed to be ours only if it parses as A2UI.
		if (event.activityType === undefined) return extract(event.content).length > 0;
		return activityTypes.has(event.activityType);
	}

	return {
		start() {
			return pump().catch((error) => {
				if (cancelled) return;
				(options.onError ?? ((e) => console.error('[a2ui] AG-UI transport error', e)))(error);
			});
		},
		subscribe: emitter.subscribe,
		send(message) {
			return options.send?.(message);
		},
		close() {
			cancelled = true;
			activities.clear();
			emitter.clear();
		}
	};
}
