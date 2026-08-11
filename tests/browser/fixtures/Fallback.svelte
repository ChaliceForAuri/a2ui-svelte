<script lang="ts">
	let { component, id }: { component: string; id: string } = $props();
</script>

<div data-testid="fallback">{component}:{id}</div>
