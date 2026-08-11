<script lang="ts">
	import Slot from '../../render/Slot.svelte';
	import type { SlotContent } from '../types.js';

	interface Props {
		slots: Record<string, SlotContent>;
		weight?: number;
		ariaLabel?: string;
	}

	let { slots, weight, ariaLabel }: Props = $props();
</script>

<div class="a2ui-card" style:flex-grow={weight} aria-label={ariaLabel}>
	<Slot content={slots.child} />
</div>

<style>
	.a2ui-card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		margin: var(--a2ui-space-leaf);
		padding: var(--a2ui-space-inset);
		border: 1px solid var(--a2ui-color-border);
		border-radius: var(--a2ui-radius);
		background: var(--a2ui-color-surface-raised);
		box-shadow: var(--a2ui-elevation);
	}

	/* Nested cards outline rather than stack opaque surfaces. */
	.a2ui-card :global(.a2ui-card) {
		background: transparent;
		box-shadow: none;
	}
</style>
