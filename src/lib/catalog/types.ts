import type { Component } from 'svelte';

/**
 * Catalog entries hold components with wildly different prop shapes, so the
 * registry is intentionally permissive here; per-component typing happens in
 * the component itself via `A2uiComponentProps`.
 */
export type AnyComponent = Component<any, any, any>;
import type { FunctionRegistry } from '../protocol/functions.js';
import type { Scope } from '../protocol/scope.js';
import type { ComponentSpec } from '../protocol/types.js';
import type { ValidationResult } from '../protocol/checks.js';

/**
 * How a property that holds component references should be turned into a slot.
 *
 * - `child`    — a single ComponentId (`Card.child`, `Button.child`)
 * - `children` — a ChildList: either ids or a `{path, componentId}` template
 * - `tabs`     — `[{ title, child }]`, as used by `Tabs`
 */
export type SlotKind = 'child' | 'children' | 'tabs';

/** One instantiated child: which component, and the data scope it renders in. */
export interface SlotNode {
	id: string;
	scope: Scope;
	/** Stable `{#each}` key — a template child appears once per item. */
	key: string;
}

export type SlotContent =
	| { kind: 'nodes'; nodes: SlotNode[] }
	| { kind: 'tabs'; tabs: { title: string; nodes: SlotNode[] }[] };

/** Two-way binding between an input component and the surface data model. */
export interface Binding<T = unknown> {
	readonly value: T;
	set(next: T): void;
	/** Absolute JSON Pointer this binding writes to, if it is bound at all. */
	readonly path: string | null;
}

/**
 * The props every catalog component receives.
 *
 * Resolved scalar properties are spread at the top level, so a `Text` component
 * simply declares `let { text, variant } = $props()`. Everything structural is
 * namespaced to avoid colliding with catalog property names.
 */
export interface A2uiComponentProps {
	slots: Record<string, SlotContent>;
	bindings: Record<string, Binding>;
	/** Action properties, already resolved into callable handlers. */
	actions: Record<string, () => void>;
	validation: ValidationResult;
	/** Escape hatch for custom components that need the raw wire spec. */
	a2ui: { id: string; component: string; spec: ComponentSpec; scope: Scope };
	[key: string]: unknown;
}

export interface CatalogEntry {
	component: AnyComponent;
	/** Properties holding component references. */
	slots?: Readonly<Record<string, SlotKind>>;
	/** Properties two-way bound to the data model. */
	bindings?: readonly string[];
	/** Properties holding an `Action`. */
	actions?: readonly string[];
	/** Properties passed through verbatim, without dynamic resolution. */
	raw?: readonly string[];
}

export interface Catalog {
	/** Canonical catalog id, as referenced by `createSurface.catalogId`. */
	id: string;
	components: Readonly<Record<string, CatalogEntry>>;
	/** Catalog-scoped functions, merged over the built-ins. */
	functions?: FunctionRegistry;
}

export interface CatalogRegistry {
	/**
	 * Resolution order per spec: explicit per-component `catalogId`, then the
	 * surface default. `strict` mode stops there; otherwise an unscoped lookup
	 * falls back to searching every registered catalog by component name, which
	 * is what makes single-catalog apps pleasant.
	 */
	resolve(catalogId: string | undefined, component: string): CatalogEntry | undefined;
	functions: FunctionRegistry;
	has(catalogId: string): boolean;
	ids: string[];
}
