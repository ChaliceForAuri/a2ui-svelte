/**
 * The A2UI state machine, as a pure reducer.
 *
 * Keeping this free of Svelte runes buys two things: it is unit-testable without
 * a compiler, and every transition returns a structurally-shared new state, so
 * the runes layer can hold it in `$state.raw` and let `$derived` short-circuit
 * on unchanged subtrees.
 */

import { deletePointer, setPointer } from './pointer.js';
import { ROOT_SCOPE } from './scope.js';
import { callFunction, RendererOnlyFunctionError, type EvalContext } from './resolve.js';
import type { FunctionRegistry } from './functions.js';
import {
	A2UI_VERSION,
	type AgentToRenderer,
	type ComponentId,
	type ComponentSpec,
	type ErrorCode,
	type RendererToAgent
} from './types.js';

export const ROOT_COMPONENT_ID = 'root';

export interface SurfaceState {
	surfaceId: string;
	/** Default catalog for components that don't override it. */
	catalogId?: string;
	/** Attach the full data model as metadata on outbound messages. */
	sendDataModel: boolean;
	components: Readonly<Record<ComponentId, ComponentSpec>>;
	dataModel: unknown;
	/**
	 * Values returned by the agent for functions this renderer does not
	 * implement, keyed by `agentCallKey`. Per-surface so `deleteSurface` drops
	 * them without extra bookkeeping, and so two surfaces cannot read each
	 * other's results.
	 */
	agentValues: Readonly<Record<string, unknown>>;
	/**
	 * Components are buffered until `root` exists — before that, updates are
	 * accepted but nothing is painted.
	 */
	ready: boolean;
}

export interface PendingAction {
	surfaceId: string;
	responsePath?: string;
}

export interface PendingFunctionCall {
	surfaceId: string;
	/** `agentCallKey` of the call, so the reply lands in the right cache slot. */
	key: string;
}

export interface ClientState {
	surfaces: Readonly<Record<string, SurfaceState>>;
	pendingActions: Readonly<Record<string, PendingAction>>;
	/** In-flight `callAgentFunction`s, by `functionCallId`. */
	pendingFunctionCalls: Readonly<Record<string, PendingFunctionCall>>;
}

export const INITIAL_STATE: ClientState = Object.freeze({
	surfaces: Object.freeze({}),
	pendingActions: Object.freeze({}),
	pendingFunctionCalls: Object.freeze({})
});

export interface ReduceOptions {
	functions: FunctionRegistry;
	/** Injectable for deterministic tests. */
	now?: () => Date;
}

export interface ReduceResult {
	state: ClientState;
	outbound: RendererToAgent[];
}

function err(
	code: ErrorCode,
	message: string,
	extra: { surfaceId?: string; functionCallId?: string; path?: string } = {}
): RendererToAgent {
	return { version: A2UI_VERSION, error: { code, message, ...extra } };
}

function withSurface(state: ClientState, surface: SurfaceState): ClientState {
	return { ...state, surfaces: { ...state.surfaces, [surface.surfaceId]: surface } };
}

/** Apply one agent message. Never throws on malformed input; reports instead. */
export function reduce(
	state: ClientState,
	message: AgentToRenderer,
	options: ReduceOptions
): ReduceResult {
	const outbound: RendererToAgent[] = [];

	if (message?.version && message.version !== A2UI_VERSION) {
		console.warn(
			`[a2ui] message version ${message.version} != renderer ${A2UI_VERSION}; processing anyway`
		);
	}

	/* ---------------------------------------------------------------- create */

	if (message.createSurface) {
		const { surfaceId, catalogId, sendDataModel, components, dataModel } = message.createSurface;

		if (!surfaceId) {
			return { state, outbound: [err('VALIDATION_FAILED', 'createSurface requires surfaceId')] };
		}
		if (state.surfaces[surfaceId]) {
			return {
				state,
				outbound: [
					err('VALIDATION_FAILED', `Surface ${surfaceId} already exists; delete it first.`, {
						surfaceId
					})
				]
			};
		}

		const map: Record<ComponentId, ComponentSpec> = {};
		const bad = collect(components, map, surfaceId, outbound);

		const surface: SurfaceState = {
			surfaceId,
			catalogId,
			sendDataModel: Boolean(sendDataModel),
			components: map,
			dataModel: dataModel ?? {},
			agentValues: {},
			ready: Object.prototype.hasOwnProperty.call(map, ROOT_COMPONENT_ID)
		};

		void bad;
		return { state: withSurface(state, surface), outbound };
	}

	/* ------------------------------------------------------- updateComponents */

	if (message.updateComponents) {
		const { surfaceId, components } = message.updateComponents;
		const surface = state.surfaces[surfaceId];
		if (!surface) {
			return { state, outbound: [unknownSurface(surfaceId)] };
		}

		const map: Record<ComponentId, ComponentSpec> = { ...surface.components };
		collect(components, map, surfaceId, outbound);

		const next: SurfaceState = {
			...surface,
			components: map,
			ready: Object.prototype.hasOwnProperty.call(map, ROOT_COMPONENT_ID)
		};
		return { state: withSurface(state, next), outbound };
	}

	/* -------------------------------------------------------- updateDataModel */

	if (message.updateDataModel) {
		const { surfaceId, path, value } = message.updateDataModel;
		const surface = state.surfaces[surfaceId];
		if (!surface) {
			return { state, outbound: [unknownSurface(surfaceId)] };
		}

		let dataModel: unknown;
		try {
			if (path === undefined || path === '' || path === '/') {
				dataModel = value ?? {};
			} else if (value === null) {
				// `null` is the delete sentinel, not a stored value.
				dataModel = deletePointer(surface.dataModel, path);
			} else {
				dataModel = setPointer(surface.dataModel, path, value);
			}
		} catch (e) {
			return {
				state,
				outbound: [err('VALIDATION_FAILED', (e as Error).message, { surfaceId, path: path ?? '/' })]
			};
		}

		return { state: withSurface(state, { ...surface, dataModel }), outbound };
	}

	/* ---------------------------------------------------------- deleteSurface */

	if (message.deleteSurface) {
		const { surfaceId } = message.deleteSurface;
		if (!state.surfaces[surfaceId]) {
			return { state, outbound: [unknownSurface(surfaceId)] };
		}
		const surfaces = { ...state.surfaces };
		delete surfaces[surfaceId];

		// Drop anything still waiting on this surface — actions and function calls
		// alike. A reply arriving after teardown has nowhere to land.
		const pendingActions: Record<string, PendingAction> = {};
		for (const [id, p] of Object.entries(state.pendingActions)) {
			if (p.surfaceId !== surfaceId) pendingActions[id] = p;
		}
		const pendingFunctionCalls: Record<string, PendingFunctionCall> = {};
		for (const [id, p] of Object.entries(state.pendingFunctionCalls)) {
			if (p.surfaceId !== surfaceId) pendingFunctionCalls[id] = p;
		}

		return { state: { surfaces, pendingActions, pendingFunctionCalls }, outbound };
	}

	/* --------------------------------------------------- callRendererFunction */

	/*
	 * Two shapes, one behaviour.
	 *
	 * v1.0 (agent_to_renderer.json#/$defs/CallRendererFunctionMessage) nests
	 * everything under the key and is `additionalProperties: false`:
	 *   {callRendererFunction: {functionCallId, callFunction: {call, catalogId, args}}}
	 * There is no envelope-level `functionCallId` and no `wantResponse` — the
	 * renderer MUST always reply (protocol doc: "even if the function's return
	 * type is void").
	 *
	 * The earlier candidate draft this renderer shipped put both at envelope
	 * level and gated the reply on `wantResponse`. Renaming the key alone was
	 * not enough: a schema-valid v1.0 message reached the reducer and was then
	 * rejected for a missing top-level id, so it stayed uninteroperable while
	 * looking fixed. A name is not a shape.
	 */
	const canonicalCall = message.callRendererFunction;
	const legacyCall = message.callFunction;

	if (canonicalCall || legacyCall) {
		const functionCallId = canonicalCall ? canonicalCall.functionCallId : message.functionCallId;
		const ref = canonicalCall ? canonicalCall.callFunction : legacyCall!;
		// Canonical calls are always answered; legacy ones keep their opt-in.
		const mustReply = canonicalCall ? true : message.wantResponse === true;

		if (!functionCallId) {
			return {
				state,
				outbound: [err('VALIDATION_FAILED', 'callRendererFunction requires a functionCallId')]
			};
		}

		const ctx: EvalContext = {
			data: undefined,
			scope: ROOT_SCOPE,
			functions: options.functions,
			remote: true
		};

		try {
			const value = callFunction(ref, ctx);
			if (mustReply) {
				outbound.push({
					version: A2UI_VERSION,
					/*
					 * common_types.json#/$defs/FunctionResponse is
					 * `additionalProperties: false` over {functionCallId, value, error}
					 * with a oneOf demanding exactly one of value/error — so no `call`
					 * echo, and a void return still needs an explicit value.
					 */
					rendererFunctionResponse: { functionCallId, value: value ?? null }
				});
			}
		} catch (e) {
			const message_ =
				e instanceof RendererOnlyFunctionError
					? e.message
					: `Function ${ref.call} failed: ${(e as Error).message}`;
			outbound.push(err('INVALID_FUNCTION_CALL', message_, { functionCallId }));
		}

		return { state, outbound };
	}

	/* --------------------------------------------------- agentFunctionResponse */

	/*
	 * The agent's reply to a `callAgentFunction` we dispatched because the
	 * function was not registered locally. Correlate by `functionCallId`, then
	 * write the value into the surface's cache under the call's key — the next
	 * evaluation reads it there and the value simply appears.
	 */
	if (message.agentFunctionResponse) {
		const { functionCallId, value, error } = message.agentFunctionResponse;
		const pending = state.pendingFunctionCalls[functionCallId];

		if (!pending) {
			// Late, duplicated, or for a surface that has since been deleted.
			console.warn(`[a2ui] agentFunctionResponse for unknown functionCallId ${functionCallId}`);
			return { state, outbound };
		}

		const pendingFunctionCalls = { ...state.pendingFunctionCalls };
		delete pendingFunctionCalls[functionCallId];

		const surface = state.surfaces[pending.surfaceId];
		if (!surface) return { state: { ...state, pendingFunctionCalls }, outbound };

		/*
		 * An error is cached too, as undefined. Without that the call is retried
		 * on every single render — the spec has the agent answer UNKNOWN_FUNCTION
		 * for a name it does not recognise, and re-asking forever is worse than
		 * rendering nothing.
		 */
		if (error) {
			console.warn(`[a2ui] agent function failed: ${error.code} ${error.message}`);
		}

		const agentValues = { ...surface.agentValues, [pending.key]: error ? undefined : value };

		return {
			state: {
				...state,
				surfaces: { ...state.surfaces, [surface.surfaceId]: { ...surface, agentValues } },
				pendingFunctionCalls
			},
			outbound
		};
	}

	/* --------------------------------------------------------- actionResponse */

	if (message.actionResponse) {
		const actionId = message.actionId;
		if (!actionId) {
			return {
				state,
				outbound: [err('VALIDATION_FAILED', 'actionResponse requires an actionId')]
			};
		}

		const pending = state.pendingActions[actionId];
		if (!pending) {
			console.warn(`[a2ui] actionResponse for unknown actionId ${actionId}`);
			return { state, outbound };
		}

		const pendingActions = { ...state.pendingActions };
		delete pendingActions[actionId];

		const surface = state.surfaces[pending.surfaceId];
		if (!surface || !pending.responsePath) {
			return { state: { ...state, pendingActions }, outbound };
		}

		const dataModel = setPointer(
			surface.dataModel,
			pending.responsePath,
			message.actionResponse.value
		);

		return {
			state: {
				...state,
				surfaces: { ...state.surfaces, [surface.surfaceId]: { ...surface, dataModel } },
				pendingActions
			},
			outbound
		};
	}

	console.warn('[a2ui] message contained no recognised action key', message);
	return { state, outbound };
}

function unknownSurface(surfaceId: string): RendererToAgent {
	return err('VALIDATION_FAILED', `Unknown surfaceId: ${surfaceId}`, { surfaceId });
}

/** Upsert specs into `map`, reporting (and skipping) structurally invalid ones. */
function collect(
	components: ComponentSpec[] | undefined,
	map: Record<ComponentId, ComponentSpec>,
	surfaceId: string,
	outbound: RendererToAgent[]
): number {
	let skipped = 0;
	components?.forEach((spec, i) => {
		if (!spec || typeof spec !== 'object' || typeof spec.id !== 'string' || spec.id === '') {
			outbound.push(
				err('VALIDATION_FAILED', 'Component is missing a string id', {
					surfaceId,
					path: `/components/${i}/id`
				})
			);
			skipped += 1;
			return;
		}
		if (typeof spec.component !== 'string' || spec.component === '') {
			outbound.push(
				err('VALIDATION_FAILED', 'Component is missing a component type', {
					surfaceId,
					path: `/components/${i}/component`
				})
			);
			skipped += 1;
			return;
		}
		map[spec.id] = spec;
	});
	return skipped;
}

/* -------------------------------------------------------------------------- */
/* Outbound helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Record an action that asked for a response so `actionResponse` can land. */
export function trackPendingAction(
	state: ClientState,
	actionId: string,
	pending: PendingAction
): ClientState {
	return { ...state, pendingActions: { ...state.pendingActions, [actionId]: pending } };
}

/** Record a dispatched `callAgentFunction` so its reply can be correlated. */
export function trackPendingFunctionCall(
	state: ClientState,
	functionCallId: string,
	pending: PendingFunctionCall
): ClientState {
	return {
		...state,
		pendingFunctionCalls: { ...state.pendingFunctionCalls, [functionCallId]: pending }
	};
}

/**
 * `a2uiRendererDataModel` metadata for surfaces created with `sendDataModel`.
 * An orchestrator must strip this before forwarding to a different sub-agent.
 */
export function rendererDataModelMetadata(
	state: ClientState
): RendererToAgent['metadata'] | undefined {
	const surfaces: Record<string, unknown> = {};
	let any = false;
	for (const surface of Object.values(state.surfaces)) {
		if (surface.sendDataModel) {
			surfaces[surface.surfaceId] = surface.dataModel;
			any = true;
		}
	}
	return any ? { a2uiRendererDataModel: { version: A2UI_VERSION, surfaces } } : undefined;
}

/**
 * `a2uiRendererCapabilities` metadata (`renderer_capabilities.json`). The spec
 * wants this on every renderer → agent message so an agent can discover which
 * catalogs it may reference without a separate handshake.
 */
export function rendererCapabilitiesMetadata(
	supportedCatalogIds: readonly string[]
): NonNullable<RendererToAgent['metadata']> {
	return {
		a2uiRendererCapabilities: { [A2UI_VERSION]: { supportedCatalogIds: [...supportedCatalogIds] } }
	};
}
