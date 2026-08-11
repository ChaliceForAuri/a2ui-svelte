<script lang="ts">
	interface Props {
		url?: string;
		posterUrl?: string;
		weight?: number;
		ariaLabel?: string;
	}

	let { url = '', posterUrl, weight, ariaLabel }: Props = $props();
</script>

<!-- svelte-ignore a11y_media_has_caption -->
<video
	class="a2ui-video"
	src={url}
	poster={posterUrl}
	controls
	aria-label={ariaLabel}
	style:flex-grow={weight}
></video>

<style>
	.a2ui-video {
		display: block;
		width: 100%;
		margin: var(--a2ui-space-leaf);
		border-radius: var(--a2ui-radius-small);
		background: #000;
	}
</style>
