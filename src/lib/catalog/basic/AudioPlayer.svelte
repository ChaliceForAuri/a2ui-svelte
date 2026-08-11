<script lang="ts">
	interface Props {
		url?: string;
		description?: string;
		weight?: number;
	}

	let { url = '', description, weight }: Props = $props();
</script>

<div class="a2ui-audio" style:flex-grow={weight}>
	<audio src={url} controls aria-label={description}></audio>
	{#if description}<span class="description">{description}</span>{/if}
</div>

<style>
	.a2ui-audio {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: var(--a2ui-space-leaf);
	}
	audio {
		width: 100%;
	}
	.description {
		font-size: 0.8125rem;
		color: var(--a2ui-color-text-muted);
	}
</style>
