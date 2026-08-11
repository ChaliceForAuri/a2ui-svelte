<script lang="ts">
	import { isPlainText, renderMarkdown } from './markdown.js';

	interface Props {
		text?: unknown;
		variant?: 'caption' | 'body';
		weight?: number;
		ariaLabel?: string;
	}

	let { text = '', variant = 'body', weight, ariaLabel }: Props = $props();

	const value = $derived(text === null || text === undefined ? '' : String(text));
	// Escaping happens inside renderMarkdown; plain strings skip it entirely.
	const plain = $derived(isPlainText(value));
</script>

{#if plain}
	<span
		class="a2ui-text"
		class:caption={variant === 'caption'}
		style:flex-grow={weight}
		aria-label={ariaLabel}>{value}</span
	>
{:else}
	<div
		class="a2ui-text a2ui-markdown"
		class:caption={variant === 'caption'}
		style:flex-grow={weight}
		aria-label={ariaLabel}
	>
		{@html renderMarkdown(value)}
	</div>
{/if}

<style>
	.a2ui-text {
		margin: var(--a2ui-space-leaf);
		color: var(--a2ui-color-text);
		line-height: 1.5;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.caption {
		font-size: 0.8125rem;
		color: var(--a2ui-color-text-muted);
	}
	.a2ui-markdown :global(h1),
	.a2ui-markdown :global(h2),
	.a2ui-markdown :global(h3) {
		margin: 0 0 0.25em;
		line-height: 1.25;
	}
	.a2ui-markdown :global(h1) {
		font-size: 1.5rem;
	}
	.a2ui-markdown :global(h2) {
		font-size: 1.25rem;
	}
	.a2ui-markdown :global(h3) {
		font-size: 1.0625rem;
	}
	.a2ui-markdown :global(p) {
		margin: 0 0 0.5em;
	}
	.a2ui-markdown :global(p:last-child) {
		margin-bottom: 0;
	}
	.a2ui-markdown :global(ul) {
		margin: 0 0 0.5em;
		padding-left: 1.25em;
	}
	.a2ui-markdown :global(code) {
		font-family: var(--a2ui-font-family-monospace);
		font-size: 0.9em;
		background: var(--a2ui-color-surface-raised);
		border-radius: var(--a2ui-radius-small);
		padding: 0.1em 0.3em;
	}
	.a2ui-markdown :global(a) {
		color: var(--a2ui-color-primary);
	}
</style>
