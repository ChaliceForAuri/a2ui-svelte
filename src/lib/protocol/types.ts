/**
 * A2UI v1.0 wire types.
 *
 * Reference: https://a2ui.org/specification/v1.0-a2ui/
 *
 * The protocol is deliberately *data*, never code: an agent may only reference
 * component types that already exist in the renderer's catalog. Nothing here
 * ever becomes an executable expression.
 */

export const A2UI_VERSION = 'v1.0' as const;

export const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json';

/** RFC 6901 JSON Pointer, or a scope-relative path when it has no leading `/`. */
export type Path = string;

export type ComponentId = string;

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/* -------------------------------------------------------------------------- */
/* Dynamic values                                                             */
/* -------------------------------------------------------------------------- */

export interface PathRef {
	path: Path;
}

export interface FunctionRef {
	call: string;
	/**
	 * Which catalog defines the function, overriding the surface default
	 * (`common_types.json#/$defs/FunctionCall`). Optional in general, but
	 * REQUIRED inside `callRendererFunction`, where the agent must be explicit
	 * about what it is asking the renderer to run.
	 */
	catalogId?: string;
	args?: Record<string, unknown>;
}

/** A property is a literal, a binding, or a function call. */
export type Dynamic<T> = T | PathRef | FunctionRef;

export type DynamicString = Dynamic<string>;
export type DynamicNumber = Dynamic<number>;
export type DynamicBoolean = Dynamic<boolean>;
export type DynamicStringList = string[] | PathRef;

export function isPathRef(v: unknown): v is PathRef {
	return typeof v === 'object' && v !== null && typeof (v as PathRef).path === 'string';
}

export function isFunctionRef(v: unknown): v is FunctionRef {
	return typeof v === 'object' && v !== null && typeof (v as FunctionRef).call === 'string';
}

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

/** Static child list, or a template instantiated once per item at `path`. */
export type ChildList = ComponentId[] | { path: Path; componentId: ComponentId };

export function isChildTemplate(v: unknown): v is { path: Path; componentId: ComponentId } {
	return (
		typeof v === 'object' &&
		v !== null &&
		!Array.isArray(v) &&
		typeof (v as { path?: unknown }).path === 'string' &&
		typeof (v as { componentId?: unknown }).componentId === 'string'
	);
}

/** Fields every catalog component inherits (`common_types.json#/$defs/ComponentCommon`). */
export interface ComponentCommon {
	id: ComponentId;
	component: string;
	/** Per-component catalog override; falls back to the surface default. */
	catalogId?: string;
	/** Flex-grow within a Row/Column. */
	weight?: number;
	visible?: DynamicBoolean;
	disabled?: DynamicBoolean;
	semanticId?: string;
	ariaLabel?: DynamicString;
}

/**
 * A component instance as it arrives on the wire: flat, id-addressed, with
 * arbitrary catalog-defined properties alongside the common fields.
 */
export type ComponentSpec = ComponentCommon & Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Validation rules                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Renderer-side validation. Two shapes appear in the spec: inputs use the flat
 * `{ call, args, message }` form, buttons use `{ condition: { call, args }, message }`.
 */
export type CheckRule =
	| { call: string; args?: Record<string, unknown>; message: string }
	| { condition: FunctionRef; message: string };

export function checkCondition(rule: CheckRule): FunctionRef {
	return 'condition' in rule ? rule.condition : { call: rule.call, args: rule.args };
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

export interface EventAction {
	name: string;
	context?: Record<string, unknown>;
	wantResponse?: boolean;
	/** JSON Pointer the agent's `actionResponse.value` is written to. */
	responsePath?: Path;
}

export type Action = { event: EventAction } | { functionCall: FunctionRef };

export function isEventAction(a: unknown): a is { event: EventAction } {
	return typeof a === 'object' && a !== null && 'event' in a;
}

export function isFunctionCallAction(a: unknown): a is { functionCall: FunctionRef } {
	return typeof a === 'object' && a !== null && 'functionCall' in a;
}

/* -------------------------------------------------------------------------- */
/* Agent -> renderer messages                                                 */
/* -------------------------------------------------------------------------- */

export interface CreateSurface {
	surfaceId: string;
	catalogId?: string;
	/** Attach the full surface data model as metadata on outbound messages. */
	sendDataModel?: boolean;
	components?: ComponentSpec[];
	dataModel?: Record<string, unknown>;
}

export interface UpdateComponents {
	surfaceId: string;
	components: ComponentSpec[];
}

export interface UpdateDataModel {
	surfaceId: string;
	/** Omitted or `/` replaces the whole model. `value: null` deletes the key. */
	path?: Path;
	value: unknown;
}

export interface DeleteSurface {
	surfaceId: string;
}

export interface AgentToRenderer {
	version: string;
	/** Correlation id for `callRendererFunction`; lives at envelope level, not inside it. */
	functionCallId?: string;
	wantResponse?: boolean;
	/** Correlation id for `actionResponse` (non-spec, see below). */
	actionId?: string;

	createSurface?: CreateSurface;
	updateComponents?: UpdateComponents;
	updateDataModel?: UpdateDataModel;
	deleteSurface?: DeleteSurface;
	/**
	 * v1.0's shape for an agent invoking a renderer-registered function
	 * (`agent_to_renderer.json#/$defs/CallRendererFunctionMessage`). Both the
	 * correlation id and the call itself are NESTED here — the envelope carries
	 * neither, and the object is `additionalProperties: false`.
	 */
	callRendererFunction?: {
		functionCallId: string;
		/** `catalogId` is required on this FunctionCall, unlike elsewhere. */
		callFunction: FunctionRef;
	};
	/**
	 * @deprecated The candidate-draft name for `callRendererFunction`. Still
	 * accepted — `reduce` normalizes it — but agents should send the v1.0 key.
	 */
	callFunction?: FunctionRef;
	/**
	 * NOT an A2UI v1.0 message. The v1.0 envelope is a `oneOf` over exactly
	 * `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`,
	 * `callRendererFunction` and `agentFunctionResponse` — there is no
	 * agent-side reply to a user action, because the spec's model is that the
	 * agent simply sends `updateDataModel` at whatever path it wants written.
	 *
	 * Kept working for hosts already relying on it; do not build on it.
	 */
	actionResponse?: { value: unknown };
}

/**
 * Every key that marks an object as an agent-to-renderer envelope.
 *
 * The v1.0 list (`agent_to_renderer.json` is a `oneOf` over exactly these) plus
 * the pre-v1.0 aliases this renderer shipped. Transports use it to decide
 * whether a payload is A2UI at all, so a key missing here is not a degraded
 * message — it is an INVISIBLE one, dropped before the reducer ever sees it.
 * That is what happened to `callRendererFunction`: the reducer would have
 * handled it, but neither transport recognized it as A2UI.
 *
 * It lives here, once, because it was previously duplicated in both transports
 * and drifted in both.
 */
export const ENVELOPE_KEYS = [
	'createSurface',
	'updateComponents',
	'updateDataModel',
	'deleteSurface',
	'callRendererFunction',
	'agentFunctionResponse',
	// pre-v1.0 aliases, still accepted
	'callFunction',
	'actionResponse'
] as const;

/* -------------------------------------------------------------------------- */
/* Renderer -> agent messages                                                 */
/* -------------------------------------------------------------------------- */

export type ErrorCode =
	'INVALID_FUNCTION_CALL' | 'VALIDATION_FAILED' | 'UNALLOWED_PARENT' | 'UNALLOWED_CHILD';

export interface RendererAction {
	name: string;
	surfaceId: string;
	sourceComponentId: ComponentId;
	/** ISO 8601. */
	timestamp: string;
	context: Record<string, unknown>;
	wantResponse?: boolean;
	actionId?: string;
}

/**
 * `common_types.json#/$defs/FunctionResponse` — `additionalProperties: false`,
 * with a `oneOf` requiring exactly one of `value` or `error`. It carries no
 * echo of the function name; `functionCallId` is the only correlator.
 */
export interface RendererFunctionResponse {
	functionCallId: string;
	value?: unknown;
	error?: { code: string; message: string };
}

export interface RendererError {
	code: ErrorCode;
	message: string;
	surfaceId?: string;
	functionCallId?: string;
	path?: string;
}

export interface RendererToAgent {
	version: string;
	action?: RendererAction;
	/**
	 * v1.0's name for the reply to `callRendererFunction`
	 * (`renderer_to_agent.json`, which is a `oneOf` over `action`,
	 * `callAgentFunction`, `rendererFunctionResponse` and `error`).
	 */
	rendererFunctionResponse?: RendererFunctionResponse;
	error?: RendererError;
	/**
	 * `a2uiRendererDataModel` is populated when a surface was created with
	 * `sendDataModel: true`; `a2uiRendererCapabilities` advertises supported
	 * catalogs on every message (`renderer_capabilities.json`). v1.0 renamed
	 * both keys from v0.9's `a2uiClient*`.
	 */
	metadata?: {
		a2uiRendererDataModel?: {
			version: string;
			surfaces: Record<string, unknown>;
		};
		a2uiRendererCapabilities?: {
			'v1.0': { supportedCatalogIds: string[] };
		};
	};
}
