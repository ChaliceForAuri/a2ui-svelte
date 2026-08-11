<script lang="ts">
	import type { Binding } from '../types.js';
	import type { ValidationResult } from '../../protocol/checks.js';
	import ValidationMessages from './ValidationMessages.svelte';

	interface Props {
		bindings: Record<string, Binding>;
		validation: ValidationResult;
		label?: string;
		disabled?: boolean;
		weight?: number;
		ariaLabel?: string;
	}

	let { bindings, validation, label = '', disabled = false, weight, ariaLabel }: Props = $props();

	const binding = $derived(bindings.value);
	const checked = $derived(binding?.value === true);
</script>

<div class="a2ui-checkbox-wrap" style:flex-grow={weight}>
	<label class="a2ui-checkbox">
		<input
			type="checkbox"
			{disabled}
			{checked}
			aria-label={ariaLabel ?? label}
			onchange={(e) => binding?.set(e.currentTarget.checked)}
		/>
		<span>{label}</span>
	</label>
	<ValidationMessages {validation} />
</div>

<style>
	.a2ui-checkbox-wrap {
		margin: var(--a2ui-space-leaf);
	}
	.a2ui-checkbox {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}
	input {
		width: 1rem;
		height: 1rem;
		accent-color: var(--a2ui-color-primary);
	}
</style>
