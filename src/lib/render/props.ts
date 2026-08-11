/**
 * Turn one wire `ComponentSpec` into the props a Svelte catalog component gets.
 *
 * Pure by design: the renderer passes in handlers for the two effectful things
 * (writing a binding, dispatching an action) so this whole classification pass
 * is unit-testable without a compiler.
 */

import { getPointer } from '../protocol/pointer.js';
import { absolutePath, childScope, type Scope } from '../protocol/scope.js';
import { resolveDynamic, type EvalContext } from '../protocol/resolve.js';
import { evaluateChecks, VALID, type ValidationResult } from '../protocol/checks.js';
import {
	isChildTemplate,
	isPathRef,
	type Action,
	type CheckRule,
	type ComponentSpec
} from '../protocol/types.js';
import type { Binding, CatalogEntry, SlotContent, SlotNode } from '../catalog/types.js';

/** Structural keys that are never forwarded as ordinary props. */
const RESERVED = new Set(['id', 'component', 'catalogId', 'checks']);

/**
 * Defence in depth. A2UI can't express a function, but a compromised
 * intermediary could try to smuggle an `onclick`; catalog components never need
 * one, so `on*` keys and function values are dropped unconditionally.
 */
function isUnsafeKey(key: string): boolean {
	return /^on[A-Z]?/.test(key) && key !== 'on';
}

export interface NodeHandlers {
	/** Write a resolved binding back into the local data model. */
	setData(pointer: string, value: unknown): void;
	/** Fire an action property. */
	dispatch(action: Action, sourceComponentId: string, scope: Scope): void;
}

export interface BuiltNode {
	/** `false` when a `visible` binding evaluates falsy — render nothing. */
	visible: boolean;
	props: Record<string, unknown>;
	slots: Record<string, SlotContent>;
	bindings: Record<string, Binding>;
	actions: Record<string, () => void>;
	validation: ValidationResult;
}

export function buildNodeProps(
	spec: ComponentSpec,
	entry: CatalogEntry,
	ctx: EvalContext,
	handlers: NodeHandlers
): BuiltNode {
	const scope = ctx.scope;
	const slotKinds = entry.slots ?? {};
	const bindingKeys = new Set(entry.bindings ?? []);
	const actionKeys = new Set(entry.actions ?? []);
	const rawKeys = new Set(entry.raw ?? []);

	const props: Record<string, unknown> = {};
	const slots: Record<string, SlotContent> = {};
	const bindings: Record<string, Binding> = {};
	const actions: Record<string, () => void> = {};

	for (const [key, value] of Object.entries(spec)) {
		if (RESERVED.has(key) || isUnsafeKey(key)) continue;
		if (typeof value === 'function') continue;

		const slotKind = slotKinds[key];
		if (slotKind) {
			slots[key] = buildSlot(slotKind, value, ctx);
			continue;
		}

		if (actionKeys.has(key)) {
			const action = value as Action;
			actions[key] = () => handlers.dispatch(action, spec.id, scope);
			continue;
		}

		if (bindingKeys.has(key)) {
			bindings[key] = buildBinding(value, ctx, handlers);
			// Also expose the current value positionally, for read-only rendering.
			props[key] = bindings[key]!.value;
			continue;
		}

		props[key] = rawKeys.has(key) ? value : resolveDynamic(value, ctx);
	}

	const validation = evaluateChecks(spec.checks as CheckRule[] | undefined, ctx);

	// `visible` defaults to true; only an explicit falsy resolution hides a node.
	const visible = spec.visible === undefined ? true : props.visible !== false;

	return { visible, props, slots, bindings, actions, validation };
}

/* -------------------------------------------------------------------------- */
/* Slots                                                                      */
/* -------------------------------------------------------------------------- */

function buildSlot(kind: string, value: unknown, ctx: EvalContext): SlotContent {
	if (kind === 'child') {
		return { kind: 'nodes', nodes: typeof value === 'string' ? [node(value, ctx.scope)] : [] };
	}

	if (kind === 'tabs') {
		const tabs = Array.isArray(value) ? value : [];
		return {
			kind: 'tabs',
			tabs: tabs
				.filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === 'object')
				.map((t, i) => ({
					title: String(resolveDynamic(t.title, ctx) ?? `Tab ${i + 1}`),
					nodes: typeof t.child === 'string' ? [node(t.child, ctx.scope)] : []
				}))
		};
	}

	// `children`: a static id list, or a template instantiated per collection item.
	if (Array.isArray(value)) {
		return {
			kind: 'nodes',
			nodes: value.filter((v) => typeof v === 'string').map((v) => node(v, ctx.scope))
		};
	}

	if (isChildTemplate(value)) {
		const collection = getPointer(ctx.data, absolutePath(value.path, ctx.scope));
		if (!Array.isArray(collection)) return { kind: 'nodes', nodes: [] };
		return {
			kind: 'nodes',
			nodes: collection.map((_, i) => {
				const itemScope = childScope(ctx.scope, value.path, i);
				return {
					id: value.componentId,
					scope: itemScope,
					key: `${value.componentId}#${itemScope.base}`
				};
			})
		};
	}

	return { kind: 'nodes', nodes: [] };
}

function node(id: string, scope: Scope): SlotNode {
	return { id, scope, key: `${id}@${scope.base}` };
}

/* -------------------------------------------------------------------------- */
/* Bindings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Input components write straight to the local data model and nothing leaves the
 * client until an explicit action fires. That is the protocol's stated design:
 * typing in a form must not generate network traffic.
 */
function buildBinding(value: unknown, ctx: EvalContext, handlers: NodeHandlers): Binding {
	if (isPathRef(value)) {
		const pointer = absolutePath(value.path, ctx.scope);
		return {
			get value() {
				return getPointer(ctx.data, pointer);
			},
			path: pointer,
			set(next) {
				handlers.setData(pointer, next);
			}
		};
	}

	// A literal (or a function result) is display-only — there is nowhere to write.
	const resolved = resolveDynamic(value, ctx);
	return {
		value: resolved,
		path: null,
		set() {
			console.warn('[a2ui] ignoring write to an unbound value');
		}
	};
}

export { VALID };
