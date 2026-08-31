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
	 * Components are buffered until `root` exists — before that, updates are
	 * accepted but nothing is painted.
	 */
	ready: boolean;
}

export interface PendingAction {
	surfaceId: string;
	responsePath?: string;
}

export interface ClientState {
	surfaces: Readonly<Record<string, SurfaceState>>;
	pendingActions: Readonly<Record<string, PendingAction>>;
}

export const INITIAL_STATE: ClientState = Object.freeze({
	surfaces: Object.freeze({}),
	pendingActions: Object.freeze({})
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

		// Drop any actions that were still waiting on this surface.
		const pendingActions: Record<string, PendingAction> = {};
		for (const [id, p] of Object.entries(state.pendingActions)) {
			if (p.surfaceId !== surfaceId) pendingActions[id] = p;
		}

		return { state: { surfaces, pendingActions }, outbound };
	}

	/* --------------------------------------------------- callRendererFunction */

	/*
	 * v1.0 names this `callRendererFunction`; an earlier candidate draft called
	 * it `callFunction`, which is what this renderer shipped. The spec warns
	 * that v1.0 is a Candidate and the repo moves daily, and this is what that
	 * looks like in practice. The legacy key is still accepted so hosts and
	 * agents built against the older draft keep working.
	 */
	const rendererCall = message.callRendererFunction ?? message.callFunction;

	if (rendererCall) {
		const { functionCallId, wantResponse } = message;
		const ref = rendererCall;

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
			if (wantResponse) {
				outbound.push({
					version: A2UI_VERSION,
					// renderer_to_agent.json calls this `rendererFunctionResponse`.
					rendererFunctionResponse: { functionCallId, call: ref.call, value }
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
