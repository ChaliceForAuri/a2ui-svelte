<script lang="ts">
	import { iconPath } from './icons.js';

	interface Props {
		/** A catalog icon name, or `{ svgPath: { path } }` for a custom glyph. */
		name?: string | { path?: string; svgPath?: string };
		weight?: number;
		ariaLabel?: string;
	}

	let { name = '', weight, ariaLabel }: Props = $props();

	const custom = $derived(
		typeof name === 'object' && name !== null ? (name.path ?? name.svgPath ?? null) : null
	);
	const d = $derived(custom ?? iconPath(String(name)));
	const label = $derived(ariaLabel ?? (typeof name === 'string' ? name : undefined));
</script>

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

<style>
	.a2ui-icon {
		flex: none;
		margin: var(--a2ui-space-leaf);
		color: inherit;
	}
</style>
