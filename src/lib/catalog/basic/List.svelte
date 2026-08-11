<script lang="ts">
	import Slot from '../../render/Slot.svelte';
	import type { SlotContent } from '../types.js';
	import { ALIGN } from './layout.js';

	interface Props {
		slots: Record<string, SlotContent>;
		direction?: 'vertical' | 'horizontal';
		align?: keyof typeof ALIGN;
		weight?: number;
		ariaLabel?: string;
	}

	let { slots, direction = 'vertical', align = 'stretch', weight, ariaLabel }: Props = $props();
</script>

<div
	class="a2ui-list"
	role="list"
	style:flex-direction={direction === 'horizontal' ? 'row' : 'column'}
	style:align-items={ALIGN[align] ?? 'stretch'}
	style:flex-grow={weight}
	aria-label={ariaLabel}
>
	<Slot content={slots.children} />
</div>

<style>
	.a2ui-list {
		display: flex;
		min-width: 0;
		margin: 0;
		padding: 0;
		overflow: auto;
	}
</style>
