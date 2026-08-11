<script lang="ts">
	import type { Binding } from '../types.js';
	import type { ValidationResult } from '../../protocol/checks.js';
	import ValidationMessages from './ValidationMessages.svelte';

	interface Props {
		bindings: Record<string, Binding>;
		validation: ValidationResult;
		label?: string;
		placeholder?: string;
		variant?: 'shortText' | 'longText' | 'number' | 'obscured';
		disabled?: boolean;
		weight?: number;
		ariaLabel?: string;
		a2ui?: { id: string };
	}

	let {
		bindings,
		validation,
		label = '',
		placeholder,
		variant = 'shortText',
		disabled = false,
		weight,
		ariaLabel,
		a2ui
	}: Props = $props();

	const binding = $derived(bindings.value);
	const value = $derived(binding?.value ?? '');
	// Only surface errors after the field has been touched, not on first paint.
	let touched = $state(false);

	const inputType = $derived(
		variant === 'number' ? 'number' : variant === 'obscured' ? 'password' : 'text'
	);
	const errorId = $derived(a2ui ? `${a2ui.id}-error` : undefined);

	function write(raw: string) {
		binding?.set(variant === 'number' ? (raw === '' ? null : Number(raw)) : raw);
	}
</script>

<label class="a2ui-field" style:flex-grow={weight}>
	{#if label}<span class="label">{label}</span>{/if}

	{#if variant === 'longText'}
		<textarea
			class="control"
			rows="4"
			{placeholder}
			{disabled}
			aria-label={ariaLabel ?? label}
			aria-invalid={touched && !validation.valid}
			aria-describedby={touched && !validation.valid ? errorId : undefined}
			value={String(value ?? '')}
			oninput={(e) => write(e.currentTarget.value)}
			onblur={() => (touched = true)}
		></textarea>
	{:else}
		<input
			class="control"
			type={inputType}
			{placeholder}
			{disabled}
			aria-label={ariaLabel ?? label}
			aria-invalid={touched && !validation.valid}
			aria-describedby={touched && !validation.valid ? errorId : undefined}
			value={value === null || value === undefined ? '' : String(value)}
			oninput={(e) => write(e.currentTarget.value)}
			onblur={() => (touched = true)}
		/>
	{/if}

	<ValidationMessages {validation} show={touched} id={errorId} />
</label>

<style>
	.a2ui-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		margin: var(--a2ui-space-leaf);
	}
	.label {
		font-size: 0.8125rem;
		color: var(--a2ui-color-text-muted);
	}
	.control {
		font: inherit;
		color: inherit;
		background: var(--a2ui-color-surface);
		border: 1px solid var(--a2ui-color-border);
		border-radius: var(--a2ui-radius-small);
		padding: 0 0.625rem;
		min-height: var(--a2ui-control-height);
		width: 100%;
		box-sizing: border-box;
	}
	textarea.control {
		padding: 0.5rem 0.625rem;
		resize: vertical;
	}
	.control:focus-visible {
		outline: 2px solid var(--a2ui-color-primary);
		outline-offset: 1px;
	}
	.control[aria-invalid='true'] {
		border-color: var(--a2ui-color-danger);
	}
</style>
