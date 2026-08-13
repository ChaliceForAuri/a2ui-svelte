<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		A2uiClient,
		Surface,
		createCatalogRegistry,
		basicCatalog,
		createHttpTransport,
		type RendererAction
	} from '$lib/index.js';
	import '$lib/catalog/basic/theme.css';

	const catalog = createCatalogRegistry([basicCatalog]);

	let log = $state<RendererAction[]>([]);
	let client = $state(makeClient());
	let dark = $state(false);

	function makeClient() {
		log = [];
		const next = new A2uiClient({
			transport: createHttpTransport({ url: '/api/agent' }),
			supportedCatalogIds: catalog.ids,
			onAction: (action) => (log = [action, ...log])
		});
		next.start();
		return next;
	}

	function restart() {
		client.destroy();
		client = makeClient();
	}

	onDestroy(() => client.destroy());

	const surface = $derived(client.surface('demo'));
</script>

<main class:a2ui-dark={dark}>
	<header>
		<div>
			<h1>svelte-a2ui</h1>
			<p>
				A2UI v1.0 rendered by Svelte 5. The agent below streams JSONL; nothing here is generated
				code.
			</p>
		</div>
		<div class="controls">
			<button onclick={restart}>Replay stream</button>
			<label><input type="checkbox" bind:checked={dark} /> Dark</label>
		</div>
	</header>

	<div class="columns">
		<section class="stage">
			<Surface {client} {catalog} surfaceId="demo">
				{#snippet pending()}
					<p class="waiting">Waiting for the agent to define <code>root</code>…</p>
				{/snippet}
			</Surface>
		</section>

		<aside>
			<h2>Data model</h2>
			<pre>{JSON.stringify(surface?.dataModel ?? {}, null, 2)}</pre>

			<h2>Actions sent to the agent</h2>
			{#if log.length === 0}
				<p class="muted">Fill the form and press <em>Book table</em>. Typing sends nothing.</p>
			{:else}
				{#each log as action (action.timestamp + action.name)}
					<pre>{JSON.stringify(action, null, 2)}</pre>
				{/each}
			{/if}
		</aside>
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
		background: var(--a2ui-color-surface);
		color: var(--a2ui-color-text);
		font-family: var(--a2ui-font-family);
	}
	main {
		max-width: 68rem;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
		background: var(--a2ui-color-surface);
		color: var(--a2ui-color-text);
		min-height: 100vh;
		box-sizing: border-box;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		flex-wrap: wrap;
	}
	h1 {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
	}
	header p {
		margin: 0;
		color: var(--a2ui-color-text-muted);
		max-width: 46ch;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.controls button {
		font: inherit;
		color: inherit;
		background: var(--a2ui-color-surface-raised);
		border: 1px solid var(--a2ui-color-border);
		border-radius: var(--a2ui-radius-small);
		padding: 0.4rem 0.8rem;
		cursor: pointer;
	}
	.controls label {
		display: inline-flex;
		gap: 0.375rem;
		align-items: center;
		color: var(--a2ui-color-text-muted);
		font-size: 0.875rem;
	}
	.columns {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		gap: 1.5rem;
		margin-top: 1.5rem;
	}
	@media (max-width: 52rem) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
	aside h2 {
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--a2ui-color-text-muted);
		margin: 1.25rem 0 0.5rem;
	}
	pre {
		background: var(--a2ui-color-surface-raised);
		border: 1px solid var(--a2ui-color-border);
		border-radius: var(--a2ui-radius-small);
		padding: 0.75rem;
		font-size: 0.75rem;
		overflow: auto;
		margin: 0 0 0.75rem;
	}
	.waiting,
	.muted {
		color: var(--a2ui-color-text-muted);
		font-size: 0.875rem;
	}
</style>
