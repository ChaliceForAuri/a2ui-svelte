import { getContext, setContext } from 'svelte';
import type { A2uiClient } from '../client.svelte.js';
import type { CatalogRegistry } from '../catalog/types.js';

const KEY = Symbol.for('a2ui.render-context');

/** Nesting depth, carried on context so slots need not thread it as a prop. */
export const DEPTH_KEY = Symbol.for('a2ui.depth');

export interface RenderContext {
	client: A2uiClient;
	catalog: CatalogRegistry;
	surfaceId: string;
	/** Rendered instead of an unknown component type. */
	fallback?: import('svelte').Component<{ component: string; id: string }>;
	/** Hard cap on nesting, to bound an adversarial or looping component graph. */
	maxDepth: number;
}

export function setRenderContext(context: RenderContext): RenderContext {
	return setContext(KEY, context);
}

export function getRenderContext(): RenderContext {
	const context = getContext<RenderContext | undefined>(KEY);
	if (!context) {
		throw new Error(
			'[a2ui] no render context found — render A2UI nodes inside <Surface> (or call setRenderContext yourself).'
		);
	}
	return context;
}
