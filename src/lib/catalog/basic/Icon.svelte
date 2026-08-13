<script lang="ts">
	import { iconPath } from './icons.js';

	interface Props {
		/** A catalog icon name, or `{ svgPath: "M…" }` for a custom glyph. */
		name?: string | { svgPath?: string };
		weight?: number;
		ariaLabel?: string;
	}

	let { name = '', weight, ariaLabel }: Props = $props();

	// The spec's custom-glyph variant. These paths are solid shapes (the official
	// renderers fill them), unlike the built-in set, which is stroked outlines.
	const custom = $derived(
		typeof name === 'object' && name !== null && typeof name.svgPath === 'string'
			? name.svgPath
			: null
	);
	const d = $derived(custom ?? iconPath(typeof name === 'string' ? name : ''));
	const label = $derived(ariaLabel ?? (typeof name === 'string' && name ? name : undefined));
</script>

{#if custom !== null}
	<svg
		class="a2ui-icon"
		viewBox="0 0 24 24"
		width="24"
		height="24"
		fill="currentColor"
		role={label ? 'img' : 'presentation'}
		aria-label={label}
		aria-hidden={label ? undefined : 'true'}
		style:flex-grow={weight}
	>
		<path {d} />
	</svg>
{:else}
	<svg
		class="a2ui-icon"
		viewBox="0 0 24 24"
		width="24"
		height="24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.7"
		stroke-linecap="round"
		stroke-linejoin="round"
		role={label ? 'img' : 'presentation'}
		aria-label={label}
		aria-hidden={label ? undefined : 'true'}
		style:flex-grow={weight}
	>
		<path {d} />
	</svg>
{/if}

<style>
	.a2ui-icon {
		flex: none;
		margin: var(--a2ui-space-leaf);
		color: inherit;
	}
</style>
