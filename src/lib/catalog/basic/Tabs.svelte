<script lang="ts">
	import Slot from '../../render/Slot.svelte';
	import type { SlotContent } from '../types.js';

	interface Props {
		slots: Record<string, SlotContent>;
		weight?: number;
		ariaLabel?: string;
	}

	let { slots, weight, ariaLabel }: Props = $props();

	// Selection is local component state — the spec keeps it off the data model.
	let selected = $state(0);

	const tabsSlot = $derived(slots.tabs);
	const titles = $derived(tabsSlot?.kind === 'tabs' ? tabsSlot.tabs.map((t) => t.title) : []);

	// A shrinking tab list must not strand the selection out of range.
	const active = $derived(Math.min(selected, Math.max(titles.length - 1, 0)));
</script>

<div class="a2ui-tabs" style:flex-grow={weight} aria-label={ariaLabel}>
	<div class="tablist" role="tablist">
		{#each titles as title, i (i)}
			<button
				type="button"
				role="tab"
				class="tab"
				class:active={i === active}
				aria-selected={i === active}
				onclick={() => (selected = i)}
			>
				{title}
			</button>
		{/each}
	</div>

	<div class="panel" role="tabpanel">
		<Slot content={tabsSlot} tab={active} />
	</div>
</div>

<style>
	.a2ui-tabs {
		display: flex;
		flex-direction: column;
		min-width: 0;
		margin: var(--a2ui-space-leaf);
	}
	.tablist {
		display: flex;
		gap: 0.25rem;
		border-bottom: 1px solid var(--a2ui-color-border);
		overflow-x: auto;
	}
	.tab {
		appearance: none;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--a2ui-color-text-muted);
		font: inherit;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.tab.active {
		color: var(--a2ui-color-text);
		border-bottom-color: var(--a2ui-color-primary);
	}
	.panel {
		display: flex;
		flex-direction: column;
		padding-top: 0.5rem;
	}
</style>
