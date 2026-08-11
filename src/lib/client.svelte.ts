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
	callFunction,
	createFunctionRegistry,
	resolveDynamic,
	type EvalContext
} from './protocol/resolve.js';
import type { FunctionRegistry } from './protocol/functions.js';
import {
	INITIAL_STATE,
	clientDataModelMetadata,
	reduce,
	trackPendingAction,
	type ClientState,
	type SurfaceState
} from './protocol/reducer.js';
import {
	A2UI_VERSION,
	isEventAction,
	isFunctionCallAction,
	type Action,
	type AgentToRenderer,
	type RendererAction,
	type RendererToAgent
} from './protocol/types.js';
import type { Transport } from './transport/types.js';

export interface A2uiClientOptions {
	transport?: Transport;
	/** Host functions, merged over the built-ins. */
	functions?: FunctionRegistry;
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
			functions: this.functions
		};
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

		const message: RendererToAgent = { version: A2UI_VERSION, action: rendererAction };
		const metadata = clientDataModelMetadata(this.#state);
		if (metadata) message.metadata = metadata;

		this.#options.onAction?.(rendererAction);
		this.#send(message);
	}

	/* --------------------------------------------------------------- private */

	#send(message: RendererToAgent): void {
		const transport = this.#options.transport;
		if (!transport) return;
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
