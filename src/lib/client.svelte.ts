/**
 * The reactive front door.
 *
 * All protocol logic lives in the pure reducer; this class is the thin runes
 * layer over it. State is held in `$state.raw` and replaced wholesale on every
 * transition — because the reducer structurally shares untouched subtrees, the
 * `$derived` lookups in `Node.svelte` short-circuit for every component whose
 * spec didn't change, so a data-model tweak repaints only what it touched.
 */

import { setPointer } from './protocol/pointer.js';
import type { Scope } from './protocol/scope.js';
import { ROOT_SCOPE } from './protocol/scope.js';
import {
	agentCallKey,
	callFunction,
	createFunctionRegistry,
	resolveDynamic,
	type EvalContext
} from './protocol/resolve.js';
import type { FunctionRegistry } from './protocol/functions.js';
import {
	INITIAL_STATE,
	rendererDataModelMetadata,
	rendererCapabilitiesMetadata,
	reduce,
	trackPendingAction,
	trackPendingFunctionCall,
	type ClientState,
	type SurfaceState
} from './protocol/reducer.js';
import {
	A2UI_VERSION,
	isEventAction,
	isFunctionCallAction,
	type Action,
	type AgentToRenderer,
	type FunctionRef,
	type RendererAction,
	type RendererToAgent
} from './protocol/types.js';
import type { Transport } from './transport/types.js';

export interface A2uiClientOptions {
	transport?: Transport;
	/** Host functions, merged over the built-ins. */
	functions?: FunctionRegistry;
	/**
	 * Catalog ids to advertise as `a2uiRendererCapabilities` metadata on every
	 * outbound message, per the v1.0 capability-negotiation contract. Typically
	 * `catalogRegistry.ids`.
	 */
	supportedCatalogIds?: readonly string[];
	/** Observe outbound actions (analytics, optimistic UI, logging). */
	onAction?: (action: RendererAction) => void;
	/** Observe every inbound message before it is reduced. */
	onMessage?: (message: AgentToRenderer) => void;
	onError?: (error: unknown) => void;
	/** Injectable for deterministic tests. */
	now?: () => Date;
	newId?: () => string;
}

let fallbackCounter = 0;

function defaultNewId(): string {
	const c = globalThis.crypto;
	if (c && typeof c.randomUUID === 'function') return c.randomUUID();
	fallbackCounter += 1;
	return `a2ui-${fallbackCounter}`;
}

export class A2uiClient {
	#state = $state.raw<ClientState>(INITIAL_STATE);
	#unsubscribe: (() => void) | null = null;

	readonly functions: FunctionRegistry;
	readonly #options: A2uiClientOptions;

	constructor(options: A2uiClientOptions = {}) {
		this.#options = options;
		this.functions = createFunctionRegistry(options.functions);

		if (options.transport) this.attach(options.transport);
	}

	/* ------------------------------------------------------------- lifecycle */

	attach(transport: Transport): void {
		this.detach();
		this.#options.transport = transport;
		this.#unsubscribe = transport.subscribe((message) => this.ingest(message));
	}

	detach(): void {
		this.#unsubscribe?.();
		this.#unsubscribe = null;
	}

	/** Kick the transport, if it needs one. Safe to call more than once. */
	start(): void | Promise<void> {
		return this.#options.transport?.start?.();
	}

	destroy(): void {
		this.detach();
		this.#options.transport?.close?.();
		this.#state = INITIAL_STATE;
	}

	/* ----------------------------------------------------------------- reads */

	get state(): ClientState {
		return this.#state;
	}

	get surfaceIds(): string[] {
		return Object.keys(this.#state.surfaces);
	}

	surface(surfaceId: string): SurfaceState | undefined {
		return this.#state.surfaces[surfaceId];
	}

	/** Evaluation context for a surface at a given collection scope. */
	context(surfaceId: string, scope: Scope = ROOT_SCOPE): EvalContext {
		return {
			data: this.#state.surfaces[surfaceId]?.dataModel,
			scope,
			functions: this.functions,
			agentValues: this.#state.surfaces[surfaceId]?.agentValues,
			onUnresolvedFunction: (ref, key) => this.#queueAgentCall(surfaceId, ref, key)
		};
	}

	/* ------------------------------------------- agent-side function routing */

	/*
	 * A plain Map, deliberately NOT reactive state. `onUnresolvedFunction` fires
	 * from inside `resolveDynamic`, which runs during render; writing reactive
	 * state there re-enters the effect that is currently reading it and trips
	 * `effect_update_depth_exceeded`. So requests are collected here and flushed
	 * on a microtask, after the render that discovered them has finished.
	 */
	#queuedAgentCalls = new Map<string, { surfaceId: string; ref: FunctionRef }>();
	#flushScheduled = false;

	/**
	 * Route a function the renderer does not implement to the agent. Public
	 * because the render layer builds its own `EvalContext` per node — this is
	 * the hook it passes as `onUnresolvedFunction`.
	 */
	requestAgentFunction(surfaceId: string, ref: FunctionRef, key: string): void {
		this.#queueAgentCall(surfaceId, ref, key);
	}

	#queueAgentCall(surfaceId: string, ref: FunctionRef, key: string): void {
		// Already asked and still waiting: one round trip, not one per render.
		for (const pending of Object.values(this.#state.pendingFunctionCalls)) {
			if (pending.key === key && pending.surfaceId === surfaceId) return;
		}
		this.#queuedAgentCalls.set(`${surfaceId}\u0000${key}`, { surfaceId, ref });
		if (this.#flushScheduled) return;
		this.#flushScheduled = true;
		queueMicrotask(() => this.#flushAgentCalls());
	}

	#flushAgentCalls(): void {
		this.#flushScheduled = false;
		const queued = [...this.#queuedAgentCalls.entries()];
		this.#queuedAgentCalls.clear();

		for (const [composite, { surfaceId, ref }] of queued) {
			const key = composite.slice(composite.indexOf('\u0000') + 1);
			const surface = this.#state.surfaces[surfaceId];
			// The surface may have been deleted, or the value may have arrived,
			// between queueing and this flush.
			if (!surface || key in surface.agentValues) continue;

			const functionCallId = (this.#options.newId ?? defaultNewId)();
			this.#state = trackPendingFunctionCall(this.#state, functionCallId, { surfaceId, key });
			this.#send({
				version: A2UI_VERSION,
				callAgentFunction: { surfaceId, functionCallId, callFunction: ref }
			});
		}
	}

	/* ---------------------------------------------------------------- writes */

	/** Apply one agent message and flush any protocol-mandated replies. */
	ingest(message: AgentToRenderer): void {
		this.#options.onMessage?.(message);
		try {
			const { state, outbound } = reduce(this.#state, message, {
				functions: this.functions,
				now: this.#options.now
			});
			this.#state = state;
			for (const reply of outbound) this.#send(reply);
		} catch (error) {
			this.#fail(error);
		}
	}

	/**
	 * Local write from an input binding. Deliberately does *not* go through
	 * `updateDataModel`, whose `null` means "delete" — a user clearing a field
	 * should be able to store an explicit null.
	 */
	setData(surfaceId: string, pointer: string, value: unknown): void {
		const surface = this.#state.surfaces[surfaceId];
		if (!surface) return;
		try {
			const dataModel = setPointer(surface.dataModel, pointer, value);
			this.#state = {
				...this.#state,
				surfaces: { ...this.#state.surfaces, [surfaceId]: { ...surface, dataModel } }
			};
		} catch (error) {
			this.#fail(error);
		}
	}

	/* --------------------------------------------------------------- actions */

	dispatch(
		surfaceId: string,
		action: Action,
		sourceComponentId: string,
		scope: Scope = ROOT_SCOPE
	): void {
		const surface = this.#state.surfaces[surfaceId];
		if (!surface) return;

		const ctx: EvalContext = { data: surface.dataModel, scope, functions: this.functions };

		// A local function call never reaches the agent.
		if (isFunctionCallAction(action)) {
			try {
				callFunction(action.functionCall, ctx);
			} catch (error) {
				this.#fail(error);
			}
			return;
		}

		if (!isEventAction(action)) return;

		const event = action.event;
		const context = (resolveDynamic(event.context ?? {}, ctx) ?? {}) as Record<string, unknown>;
		const wantResponse = event.wantResponse === true;
		const actionId = wantResponse ? (this.#options.newId ?? defaultNewId)() : undefined;

		if (actionId) {
			this.#state = trackPendingAction(this.#state, actionId, {
				surfaceId,
				responsePath: event.responsePath
			});
		}

		const rendererAction: RendererAction = {
			name: event.name,
			surfaceId,
			sourceComponentId,
			timestamp: (this.#options.now?.() ?? new Date()).toISOString(),
			context,
			...(wantResponse ? { wantResponse, actionId } : {})
		};

		this.#options.onAction?.(rendererAction);
		this.#send({ version: A2UI_VERSION, action: rendererAction });
	}

	/* --------------------------------------------------------------- private */

	/**
	 * Every outbound message carries the metadata the spec asks the renderer to
	 * attach: capability advertisement always (when configured), and the full
	 * data model for surfaces that opted into `sendDataModel`.
	 */
	#withMetadata(message: RendererToAgent): RendererToAgent {
		const capabilities = this.#options.supportedCatalogIds?.length
			? rendererCapabilitiesMetadata(this.#options.supportedCatalogIds)
			: undefined;
		const dataModel = rendererDataModelMetadata(this.#state);
		if (!capabilities && !dataModel) return message;
		return { ...message, metadata: { ...capabilities, ...dataModel, ...message.metadata } };
	}

	#send(message: RendererToAgent): void {
		const transport = this.#options.transport;
		if (!transport) return;
		message = this.#withMetadata(message);
		try {
			const result = transport.send(message);
			if (result instanceof Promise) result.catch((error) => this.#fail(error));
		} catch (error) {
			this.#fail(error);
		}
	}

	#fail(error: unknown): void {
		if (this.#options.onError) this.#options.onError(error);
		else console.error('[a2ui]', error);
	}
}
