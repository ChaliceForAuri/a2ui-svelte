<script lang="ts">
	import Slot from '../../render/Slot.svelte';
	import type { SlotContent } from '../types.js';
	import { ALIGN, JUSTIFY } from './layout.js';

	interface Props {
		slots: Record<string, SlotContent>;
		justify?: keyof typeof JUSTIFY;
		align?: keyof typeof ALIGN;
		weight?: number;
		ariaLabel?: string;
	}

	let { slots, justify = 'start', align = 'stretch', weight, ariaLabel }: Props = $props();
</script>

<div
	class="a2ui-row"
	style:justify-content={JUSTIFY[justify] ?? 'flex-start'}
	style:align-items={ALIGN[align] ?? 'stretch'}
	style:flex-grow={weight}
	aria-label={ariaLabel}
>
	<Slot content={slots.children} />
</div>

<style>
	.a2ui-row {
		display: flex;
		flex-direction: row;
		min-width: 0;
		/* Invisible containers contribute no spacing — leaves own their margins. */
		margin: 0;
		padding: 0;
	}
</style>
