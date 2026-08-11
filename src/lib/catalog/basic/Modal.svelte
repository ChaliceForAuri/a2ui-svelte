<script lang="ts">
	import Slot from '../../render/Slot.svelte';
	import type { SlotContent } from '../types.js';

	interface Props {
		slots: Record<string, SlotContent>;
		weight?: number;
		ariaLabel?: string;
	}

	let { slots, weight, ariaLabel }: Props = $props();

	let open = $state(false);
	let dialog = $state<HTMLDialogElement | null>(null);

	// <dialog> owns focus trapping, Escape and the backdrop; keep it authoritative.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<div
	class="a2ui-modal-trigger"
	style:flex-grow={weight}
	role="button"
	tabindex="0"
	aria-haspopup="dialog"
	aria-expanded={open}
	aria-label={ariaLabel}
	onclick={() => (open = true)}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			open = true;
		}
	}}
>
	<Slot content={slots.trigger} />
</div>

<dialog bind:this={dialog} class="a2ui-modal" onclose={() => (open = false)}>
	<div class="body">
		{#if open}
			<Slot content={slots.content} />
		{/if}
	</div>
	<form method="dialog" class="dismiss">
		<button type="submit" aria-label="Close">Close</button>
	</form>
</dialog>

<style>
	.a2ui-modal-trigger {
		display: contents;
	}
	.a2ui-modal {
		border: 1px solid var(--a2ui-color-border);
		border-radius: var(--a2ui-radius);
		background: var(--a2ui-color-surface);
		color: var(--a2ui-color-text);
		padding: var(--a2ui-space-inset);
		max-width: min(90vw, 32rem);
		box-shadow: var(--a2ui-elevation);
	}
	.a2ui-modal::backdrop {
		background: rgb(0 0 0 / 0.45);
	}
	.body {
		display: flex;
		flex-direction: column;
	}
	.dismiss {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.75rem;
	}
	.dismiss button {
		font: inherit;
		color: inherit;
		background: none;
		border: 1px solid var(--a2ui-color-border);
		border-radius: var(--a2ui-radius-small);
		padding: 0.35rem 0.75rem;
		cursor: pointer;
	}

	/* On narrow screens present as a bottom sheet. */
	@media (max-width: 40rem) {
		.a2ui-modal {
			margin: auto auto 0;
			max-width: 100vw;
			width: 100%;
			border-radius: var(--a2ui-radius) var(--a2ui-radius) 0 0;
		}
	}
</style>
