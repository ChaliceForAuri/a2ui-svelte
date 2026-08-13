/**
 * svelte-a2ui — the A2UI (Agent-to-UI) protocol renderer for Svelte 5.
 *
 * Agents describe UI as data against a catalog you control; this package turns
 * that data into real Svelte components. No agent-authored code is ever
 * evaluated, and nothing renders that isn't already in your catalog.
 *
 * ```svelte
 * <script lang="ts">
 *   import { A2uiClient, Surface, createCatalogRegistry, basicCatalog, createHttpTransport }
 *     from 'svelte-a2ui';
 *   import 'svelte-a2ui/theme.css';
 *
 *   const catalog = createCatalogRegistry([basicCatalog]);
 *   const client = new A2uiClient({
 *     transport: createHttpTransport({ url: '/api/agent', body: { prompt } })
 *   });
 *   client.start();
 * </script>
 *
 * <Surface {client} {catalog} surfaceId="main" />
 * ```
 */

/* --- reactive client --- */
export { A2uiClient } from './client.svelte.js';
export type { A2uiClientOptions } from './client.svelte.js';

/* --- rendering --- */
export { default as Surface } from './render/Surface.svelte';
export { default as Node } from './render/Node.svelte';
export { default as Slot } from './render/Slot.svelte';
export { getRenderContext, setRenderContext, DEPTH_KEY } from './render/context.js';
export type { RenderContext } from './render/context.js';
export { buildNodeProps } from './render/props.js';
export type { BuiltNode, NodeHandlers } from './render/props.js';

/* --- catalogs --- */
export { createCatalogRegistry } from './catalog/registry.js';
export type { CatalogRegistryOptions } from './catalog/registry.js';
export { basicCatalog, BASIC_COMPONENTS } from './catalog/basic/index.js';
export type {
	A2uiComponentProps,
	Binding,
	Catalog,
	CatalogEntry,
	CatalogRegistry,
	SlotContent,
	SlotKind,
	SlotNode
} from './catalog/types.js';

/* --- protocol --- */
export {
	A2UI_VERSION,
	BASIC_CATALOG_ID,
	isPathRef,
	isFunctionRef,
	isChildTemplate,
	isEventAction,
	isFunctionCallAction,
	checkCondition
} from './protocol/types.js';
export type {
	Action,
	AgentToRenderer,
	CheckRule,
	ComponentId,
	ComponentSpec,
	CreateSurface,
	DeleteSurface,
	Dynamic,
	DynamicBoolean,
	DynamicNumber,
	DynamicString,
	ErrorCode,
	EventAction,
	FunctionRef,
	PathRef,
	RendererAction,
	RendererToAgent,
	UpdateComponents,
	UpdateDataModel
} from './protocol/types.js';

export {
	INITIAL_STATE,
	ROOT_COMPONENT_ID,
	reduce,
	trackPendingAction,
	rendererDataModelMetadata
} from './protocol/reducer.js';
export type { ClientState, SurfaceState } from './protocol/reducer.js';

export {
	getPointer,
	setPointer,
	deletePointer,
	parsePointer,
	joinPointer
} from './protocol/pointer.js';
export { ROOT_SCOPE, absolutePath, childScope } from './protocol/scope.js';
export type { Scope } from './protocol/scope.js';

export { BUILTIN_FUNCTIONS, formatDatePattern, isSafeUrl } from './protocol/functions.js';
export type { EvalContext, FunctionImpl, FunctionRegistry } from './protocol/functions.js';
export {
	createFunctionRegistry,
	resolveDynamic,
	callFunction,
	evaluateExpression,
	RendererOnlyFunctionError
} from './protocol/resolve.js';
export { evaluateChecks } from './protocol/checks.js';
export type { ValidationResult } from './protocol/checks.js';

/* --- transports --- */
export { createHttpTransport, createMockTransport } from './transport/http.js';
export { createAgUiTransport, defaultExtract, A2UI_ACTIVITY_TYPES } from './transport/agui.js';
export { applyPatch, JsonPatchError } from './transport/json-patch.js';
export { readLines, readJsonLines, readSse, createEmitter } from './transport/index.js';
export type {
	AgUiEvent,
	AgUiTransportOptions,
	HttpTransportOptions,
	PatchOp,
	SseEvent,
	Transport
} from './transport/index.js';
