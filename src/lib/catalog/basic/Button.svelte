<script lang="ts">
	import Slot from '../../render/Slot.svelte';
	import type { SlotContent } from '../types.js';
	import type { ValidationResult } from '../../protocol/checks.js';

	interface Props {
		slots: Record<string, SlotContent>;
		actions: Record<string, () => void>;
		validation: ValidationResult;
		variant?: 'default' | 'primary' | 'borderless';
		disabled?: boolean;
		weight?: number;
		ariaLabel?: string;
	}

	let {
		slots,
		actions,
		validation,
		variant = 'default',
		disabled = false,
		weight,
		ariaLabel
	}: Props = $props();

	// Failing checks disable the control locally — no round trip to the agent.
	const blocked = $derived(disabled || !validation.valid);
</script>

<button
	type="button"
	class="a2ui-button {variant}"
	disabled={blocked}
	title={validation.valid ? undefined : validation.errors.join('\n')}
	aria-label={ariaLabel}
	style:flex-grow={weight}
	onclick={actions.action}
>
	<Slot content={slots.child} />
</button>

<style>
	.a2ui-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		min-height: var(--a2ui-control-height);
		margin: var(--a2ui-space-leaf);
		padding: 0 0.875rem;
		border: 1px solid var(--a2ui-color-border);
		border-radius: var(--a2ui-radius-small);
		background: var(--a2ui-color-surface);
		/* Inherit colour so nested Text picks up the right foreground. */
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.a2ui-button:hover:not(:disabled) {
		border-color: var(--a2ui-color-primary);
	}
	.a2ui-button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.primary {
		background: var(--a2ui-color-primary);
		border-color: var(--a2ui-color-primary);
		color: var(--a2ui-color-on-primary);
	}
	.borderless {
		background: transparent;
		border-color: transparent;
	}

	/* Buttons own their padding; the label inside shouldn't add more. */
	.a2ui-button :global(.a2ui-text) {
		margin: 0;
	}
</style>
