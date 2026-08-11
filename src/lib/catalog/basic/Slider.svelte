<script lang="ts">
	import type { Binding } from '../types.js';
	import type { ValidationResult } from '../../protocol/checks.js';
	import ValidationMessages from './ValidationMessages.svelte';

	interface Props {
		bindings: Record<string, Binding>;
		validation: ValidationResult;
		min?: number;
		max?: number;
		steps?: number;
		label?: string;
		disabled?: boolean;
		weight?: number;
		ariaLabel?: string;
	}

	let {
		bindings,
		validation,
		min = 0,
		max = 100,
		steps,
		label = '',
		disabled = false,
		weight,
		ariaLabel
	}: Props = $props();

	const binding = $derived(bindings.value);
	const current = $derived(Number(binding?.value ?? min));

	// `steps` is a count of intervals, not a step size.
	const step = $derived(steps && steps > 0 ? (max - min) / steps : undefined);
</script>

<label class="a2ui-slider" style:flex-grow={weight}>
	{#if label}
		<span class="label"
			>{label}<span class="value">{Number.isNaN(current) ? '' : current}</span></span
		>
	{/if}
	<input
		type="range"
		{min}
		{max}
		{step}
		{disabled}
		value={Number.isNaN(current) ? min : current}
		aria-label={ariaLabel ?? label}
		oninput={(e) => binding?.set(Number(e.currentTarget.value))}
	/>
	<ValidationMessages {validation} />
</label>

<style>
	.a2ui-slider {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: var(--a2ui-space-leaf);
		min-width: 0;
	}
	.label {
		display: flex;
		justify-content: space-between;
		font-size: 0.8125rem;
		color: var(--a2ui-color-text-muted);
	}
	.value {
		color: var(--a2ui-color-text);
		font-variant-numeric: tabular-nums;
	}
	input {
		accent-color: var(--a2ui-color-primary);
		width: 100%;
	}
</style>
