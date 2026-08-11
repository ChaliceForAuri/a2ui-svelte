<script lang="ts">
	const SIZES: Record<string, string> = {
		icon: '24px',
		avatar: '40px',
		smallFeature: '100px',
		mediumFeature: '200px',
		largeFeature: '400px',
		header: '100%'
	};

	interface Props {
		url?: string;
		description?: string;
		fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scaleDown';
		variant?: keyof typeof SIZES;
		weight?: number;
	}

	let {
		url = '',
		description = '',
		fit = 'cover',
		variant = 'mediumFeature',
		weight
	}: Props = $props();

	const objectFit = $derived(fit === 'scaleDown' ? 'scale-down' : fit);
	const size = $derived(SIZES[variant] ?? SIZES.mediumFeature);
	const isHeader = $derived(variant === 'header');
</script>

<img
	class="a2ui-image {variant}"
	src={url}
	alt={description}
	loading="lazy"
	decoding="async"
	style:object-fit={objectFit}
	style:width={isHeader ? '100%' : variant === 'largeFeature' ? 'auto' : size}
	style:height={isHeader ? 'auto' : size}
	style:flex-grow={weight}
/>

<style>
	.a2ui-image {
		display: block;
		margin: var(--a2ui-space-leaf);
		border-radius: var(--a2ui-radius-small);
		max-width: calc(100% - 2 * var(--a2ui-space-leaf));
	}
	.avatar {
		border-radius: 50%;
	}
	.icon {
		margin: 0;
	}
</style>
