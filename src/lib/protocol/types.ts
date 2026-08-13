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
	/** Correlation id for `callFunction`; lives at envelope level, not inside it. */
	functionCallId?: string;
	wantResponse?: boolean;
	/** Correlation id for `actionResponse`. */
	actionId?: string;

	createSurface?: CreateSurface;
	updateComponents?: UpdateComponents;
	updateDataModel?: UpdateDataModel;
	deleteSurface?: DeleteSurface;
	callFunction?: FunctionRef;
	actionResponse?: { value: unknown };
}

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

export interface RendererFunctionResponse {
	functionCallId: string;
	call: string;
	value?: unknown;
	error?: string;
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
	functionResponse?: RendererFunctionResponse;
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
