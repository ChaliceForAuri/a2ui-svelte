<!--
	Mounts one A2UI surface.

	`createSurface` implicitly instantiates the canonical `Surface` container,
	whose child is always `root`. Nothing paints until `root` exists — components
	that arrive first are buffered by the reducer, which is what makes progressive
	streaming look deliberate instead of janky.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { A2uiClient } from '../client.svelte.js';
	import type { CatalogRegistry } from '../catalog/types.js';
	import { ROOT_COMPONENT_ID } from '../protocol/reducer.js';
	import { setRenderContext, type RenderContext } from './context.js';
	import Node from './Node.svelte';

	interface Props {
		client: A2uiClient;
		catalog: CatalogRegistry;
		surfaceId: string;
		/** Shown until the surface exists and its `root` component arrives. */
		pending?: Snippet;
		/** Rendered in place of a component type this catalog doesn't know. */
		fallback?: RenderContext['fallback'];
		maxDepth?: number;
		class?: string;
	}

	let {
		client,
		catalog,
		surfaceId,
		pending,
		fallback,
		maxDepth = 64,
		class: className = ''
	}: Props = $props();

	// Context is set once; the fields it exposes are read through getters so a
	// swapped client or catalog still propagates.
	setRenderContext({
		get client() {
			return client;
		},
		get catalog() {
			return catalog;
		},
		get surfaceId() {
			return surfaceId;
		},
		get fallback() {
			return fallback;
		},
		get maxDepth() {
			return maxDepth;
		}
	} as RenderContext);

	const surface = $derived(client.surface(surfaceId));
	const ready = $derived(surface?.ready === true);
</script>

<div class="a2ui-surface {className}" data-a2ui-surface={surfaceId} data-a2ui-ready={ready}>
	{#if ready}
		<Node id={ROOT_COMPONENT_ID} />
	{:else if pending}
		{@render pending()}
	{/if}
</div>

<style>
	.a2ui-surface {
		display: flex;
		flex-direction: column;
		color: var(--a2ui-color-text);
		font-family: var(--a2ui-font-family);
	}
</style>
