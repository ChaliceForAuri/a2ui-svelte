<script lang="ts">
	interface Props {
		axis?: 'horizontal' | 'vertical';
		weight?: number;
	}

	let { axis = 'horizontal', weight }: Props = $props();
</script>

{#if axis === 'vertical'}
	<div
		class="a2ui-divider vertical"
		role="separator"
		aria-orientation="vertical"
		style:flex-grow={weight}
	></div>
{:else}
	<hr class="a2ui-divider" style:flex-grow={weight} />
{/if}

<style>
	.a2ui-divider {
		border: none;
		background: var(--a2ui-color-border);
		margin: var(--a2ui-space-leaf);
		height: 1px;
		width: auto;
		align-self: stretch;
	}
	.vertical {
		width: 1px;
		height: auto;
	}
</style>
