<script lang="ts">
	import type { ValidationResult } from '../../protocol/checks.js';

	interface Props {
		validation: ValidationResult;
		/** Errors stay hidden until the user has interacted with the field. */
		show?: boolean;
		id?: string;
	}

	let { validation, show = true, id }: Props = $props();
</script>

{#if show && !validation.valid}
	<div class="a2ui-errors" {id} role="alert">
		{#each validation.errors as message (message)}
			<span>{message}</span>
		{/each}
	</div>
{/if}

<style>
	.a2ui-errors {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		color: var(--a2ui-color-danger);
		font-size: 0.8125rem;
		margin-top: 0.25rem;
	}
</style>
