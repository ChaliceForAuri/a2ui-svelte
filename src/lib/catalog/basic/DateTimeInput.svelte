<script lang="ts">
	import type { Binding } from '../types.js';
	import type { ValidationResult } from '../../protocol/checks.js';
	import ValidationMessages from './ValidationMessages.svelte';

	interface Props {
		bindings: Record<string, Binding>;
		validation: ValidationResult;
		enableDate?: boolean;
		enableTime?: boolean;
		min?: string;
		max?: string;
		label?: string;
		disabled?: boolean;
		weight?: number;
		ariaLabel?: string;
	}

	let {
		bindings,
		validation,
		enableDate = true,
		enableTime = false,
		min,
		max,
		label = '',
		disabled = false,
		weight,
		ariaLabel
	}: Props = $props();

	const binding = $derived(bindings.value);

	const type = $derived(enableDate && enableTime ? 'datetime-local' : enableTime ? 'time' : 'date');

	/**
	 * The data model holds ISO 8601; the input elements want their own truncated
	 * forms, so convert in both directions rather than storing what the DOM gives.
	 */
	const displayValue = $derived.by(() => {
		const raw = binding?.value;
		if (typeof raw !== 'string' || raw === '') return '';
		if (type === 'date') return raw.slice(0, 10);
		if (type === 'time') return raw.length > 10 ? raw.slice(11, 16) : raw.slice(0, 5);
		return raw.slice(0, 16);
	});

	function write(raw: string) {
		if (raw === '') {
			binding?.set('');
			return;
		}
		if (type === 'time') {
			binding?.set(raw);
			return;
		}
		const parsed = new Date(raw);
		binding?.set(Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString());
	}
</script>

<label class="a2ui-datetime" style:flex-grow={weight}>
	{#if label}<span class="label">{label}</span>{/if}
	<input
		{type}
		{min}
		{max}
		{disabled}
		value={displayValue}
		aria-label={ariaLabel ?? label}
		oninput={(e) => write(e.currentTarget.value)}
	/>
	<ValidationMessages {validation} />
</label>

<style>
	.a2ui-datetime {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: var(--a2ui-space-leaf);
		min-width: 0;
	}
	.label {
		font-size: 0.8125rem;
		color: var(--a2ui-color-text-muted);
	}
	input {
		font: inherit;
		color: inherit;
		background: var(--a2ui-color-surface);
		border: 1px solid var(--a2ui-color-border);
		border-radius: var(--a2ui-radius-small);
		padding: 0 0.625rem;
		min-height: var(--a2ui-control-height);
		box-sizing: border-box;
	}
</style>
