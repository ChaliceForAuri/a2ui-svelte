<!--
	Renders the children of a slot.

	Catalog components use this instead of Svelte snippets because A2UI addresses
	children by id, not by lexical nesting — a container receives a list of ids
	(or a template plus a collection path), and the renderer decides what those
	resolve to.
-->
<script lang="ts">
	import type { SlotContent } from '../catalog/types.js';
	import Node from './Node.svelte';

	interface Props {
		/**
		 * The slot to render. Named `content`, not `slot`: a prop literally called
		 * `slot` collides with Svelte's legacy slot attribute.
		 */
		content?: SlotContent;
		/** Render only the nodes of one tab, by index. */
		tab?: number;
	}

	let { content, tab }: Props = $props();

	const nodes = $derived.by(() => {
		if (!content) return [];
		if (content.kind === 'nodes') return content.nodes;
		return content.tabs[tab ?? 0]?.nodes ?? [];
	});
</script>

{#each nodes as node (node.key)}
	<Node id={node.id} scope={node.scope} />
{/each}
