<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		A2uiClient,
		Surface,
		createCatalogRegistry,
		basicCatalog,
		createHttpTransport,
		type AgentToRenderer,
		type RendererAction
	} from '$lib/index.js';
	import '$lib/catalog/basic/theme.css';
	import { createDemoReplayTransport } from './demo-script.js';
	import { highlightJson, messageKind } from './highlight.js';

	// The GitHub Pages build has no server, so the agent script replays
	// client-side; everywhere else it streams over HTTP as JSONL.
	const isStatic = import.meta.env.VITE_STATIC_DEMO === '1';

	const catalog = createCatalogRegistry([basicCatalog]);

	interface FeedEntry {
		seq: number;
		direction: 'in' | 'out';
		kind: string;
		json: string;
		bytes: number;
	}

	let feed = $state<FeedEntry[]>([]);
	let dark = $state(false);
	let streaming = $state(false);
	let seq = 0;
	let idleTimer: ReturnType<typeof setTimeout> | undefined;

	// Declared after the state it touches: makeClient() reads `seq`/`feed`, so
	// calling it any earlier hits the temporal dead zone during SSR.
	let client = $state(makeClient());

	/** The feed goes quiet 1.2s after the last message — that reads as "done". */
	function markActivity() {
		streaming = true;
		clearTimeout(idleTimer);
		idleTimer = setTimeout(() => (streaming = false), 1200);
	}

	function push(direction: 'in' | 'out', payload: object, kind: string) {
		seq += 1;
		feed = [
			{
				seq,
				direction,
				kind,
				json: highlightJson(payload),
				bytes: JSON.stringify(payload).length
			},
			...feed
		].slice(0, 40);
		markActivity();
	}

	function makeClient() {
		feed = [];
		seq = 0;
		const next = new A2uiClient({
			transport: isStatic
				? createDemoReplayTransport()
				: createHttpTransport({ url: '/api/agent' }),
			supportedCatalogIds: catalog.ids,
			// Every inbound envelope and every outbound action lands in the feed,
			// so the wire and the pixels it produces sit side by side.
			onMessage: (message: AgentToRenderer) => push('in', message, messageKind(message)),
			onAction: (action: RendererAction) => push('out', action, 'action')
		});
		next.start();
		return next;
	}

	function restart() {
		client.destroy();
		client = makeClient();
	}

	onDestroy(() => {
		clearTimeout(idleTimer);
		client.destroy();
	});

	const surface = $derived(client.surface('demo'));
	const componentCount = $derived(Object.keys(surface?.components ?? {}).length);
	const inboundCount = $derived(feed.filter((f) => f.direction === 'in').length);
	const sentBytes = $derived(
		feed.filter((f) => f.direction === 'out').reduce((n, f) => n + f.bytes, 0)
	);
</script>

<main class:a2ui-dark={dark}>
	<header>
		<div class="titles">
			<h1>svelte-a2ui</h1>
			<p class="tagline">
				An agent is building this interface right now — streaming <strong>data</strong>, not code.
				Every message it sends appears on the right as it arrives.
			</p>
			<p class="links">
				<a href="https://github.com/ChaliceForAuri/a2ui-svelte">GitHub</a>
				·
				<a href="https://www.npmjs.com/package/svelte-a2ui">npm</a>
				·
				<a href="https://a2ui.org">A2UI spec</a>
			</p>
		</div>
		<div class="controls">
			<span class="pill" class:live={streaming}>
				<span class="dot"></span>{streaming ? 'streaming' : 'idle'}
			</span>
			<button onclick={restart}>Replay stream</button>
			<label><input type="checkbox" bind:checked={dark} /> Dark</label>
		</div>
	</header>

	<div class="stats">
		<div class="stat"><b>{inboundCount}</b><span>messages received</span></div>
		<div class="stat"><b>{componentCount}</b><span>components defined</span></div>
		<div class="stat"><b>{sentBytes}</b><span>bytes sent back</span></div>
		<div class="stat"><b>0</b><span>lines of agent code run</span></div>
	</div>

	<div class="columns">
		<section class="panel stage">
			<div class="panel-head">Rendered surface</div>
			<div class="stage-body">
				<Surface {client} {catalog} surfaceId="demo">
					{#snippet pending()}
						<p class="waiting">
							<span class="spinner"></span>
							Buffering — nothing paints until the agent defines <code>root</code>.
						</p>
					{/snippet}
				</Surface>
			</div>
		</section>

		<div class="side">
			<section class="panel">
				<div class="panel-head">
					Wire feed
					<span class="hint">newest first</span>
				</div>
				<div class="feed">
					{#each feed as entry (entry.seq)}
						<article class="msg" class:out={entry.direction === 'out'}>
							<div class="msg-head">
								<span class="dir">{entry.direction === 'in' ? '↓ agent' : '↑ renderer'}</span>
								<span class="kind">{entry.kind}</span>
								<span class="bytes">{entry.bytes} B</span>
							</div>
							<pre><code>{@html entry.json}</code></pre>
						</article>
					{:else}
						<p class="muted">Waiting for the first message…</p>
					{/each}
				</div>
			</section>

			<section class="panel">
				<div class="panel-head">
					Data model
					<span class="hint">typing writes here, not to the network</span>
				</div>
				<pre class="model"><code>{@html highlightJson(surface?.dataModel ?? {})}</code></pre>
			</section>
		</div>
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
		max-width: 78rem;
		margin: 0 auto;
		padding: 2.5rem 1.25rem 4rem;
		background: var(--a2ui-color-surface);
		color: var(--a2ui-color-text);
		min-height: 100vh;
		box-sizing: border-box;
	}

	/* --- header ---------------------------------------------------------- */
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1.5rem;
		flex-wrap: wrap;
	}
	h1 {
		margin: 0 0 0.375rem;
		font-size: 1.75rem;
		letter-spacing: -0.02em;
	}
	.tagline {
		margin: 0;
		color: var(--a2ui-color-text-muted);
		max-width: 52ch;
		line-height: 1.5;
	}
	.tagline strong {
		color: var(--a2ui-color-text);
		font-weight: 600;
	}
	.links {
		margin: 0.5rem 0 0;
		font-size: 0.8125rem;
	}
	.links a {
		color: var(--a2ui-color-primary);
		text-decoration: none;
	}
	.links a:hover {
		text-decoration: underline;
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
		transition: border-color 120ms ease;
	}
	.controls button:hover {
		border-color: var(--a2ui-color-primary);
	}
	.controls label {
		display: inline-flex;
		gap: 0.375rem;
		align-items: center;
		color: var(--a2ui-color-text-muted);
		font-size: 0.875rem;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--a2ui-color-text-muted);
		border: 1px solid var(--a2ui-color-border);
		border-radius: 999px;
		padding: 0.25rem 0.6rem;
	}
	.pill .dot {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background: var(--a2ui-color-border);
	}
	.pill.live {
		color: var(--a2ui-color-primary);
		border-color: color-mix(in srgb, var(--a2ui-color-primary) 45%, transparent);
	}
	.pill.live .dot {
		background: var(--a2ui-color-primary);
		animation: pulse 1.1s ease-in-out infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.35;
			transform: scale(0.72);
		}
	}

	/* --- stat strip ------------------------------------------------------ */
	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.75rem;
		margin: 1.75rem 0 1.25rem;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.65rem 0.85rem;
		border: 1px solid var(--a2ui-color-border);
		border-radius: var(--a2ui-radius-small);
		background: var(--a2ui-color-surface-raised);
	}
	.stat b {
		font-size: 1.25rem;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
	}
	.stat span {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--a2ui-color-text-muted);
	}
	@media (max-width: 52rem) {
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	/* --- layout ---------------------------------------------------------- */
	.columns {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
		gap: 1.25rem;
		align-items: start;
	}
	@media (max-width: 62rem) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		min-width: 0;
	}
	.panel {
		border: 1px solid var(--a2ui-color-border);
		border-radius: var(--a2ui-radius);
		background: var(--a2ui-color-surface);
		overflow: hidden;
		min-width: 0;
	}
	.panel-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.6rem 0.9rem;
		border-bottom: 1px solid var(--a2ui-color-border);
		background: var(--a2ui-color-surface-raised);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--a2ui-color-text-muted);
	}
	.hint {
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.7rem;
		opacity: 0.75;
	}
	.stage-body {
		padding: 0.75rem;
	}

	/* Newly painted components settle in, so message → pixel is visible. */
	.stage-body :global(.a2ui-surface > *) {
		animation: settle 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	@keyframes settle {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	/* --- wire feed ------------------------------------------------------- */
	.feed {
		max-height: 40rem;
		overflow-y: auto;
		padding: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.msg {
		border: 1px solid var(--a2ui-color-border);
		border-left: 3px solid var(--a2ui-color-primary);
		border-radius: var(--a2ui-radius-small);
		background: var(--a2ui-color-surface-raised);
		animation: slide-in 300ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		overflow: hidden;
	}
	.msg.out {
		border-left-color: var(--a2ui-color-success, #16a34a);
	}
	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.msg-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.6rem;
		font-size: 0.7rem;
		border-bottom: 1px solid var(--a2ui-color-border);
	}
	.dir {
		color: var(--a2ui-color-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.kind {
		font-weight: 600;
		font-family: var(--a2ui-font-family-monospace);
	}
	.bytes {
		margin-left: auto;
		color: var(--a2ui-color-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.feed pre {
		margin: 0;
		padding: 0.55rem 0.7rem;
		font-size: 0.7rem;
		line-height: 1.45;
		/* Long envelopes scroll inside their own card rather than swallowing
		   the feed; short ones show whole. */
		max-height: 11rem;
		overflow: auto;
	}
	.model {
		margin: 0;
		padding: 0.75rem 0.9rem;
		font-size: 0.72rem;
		line-height: 1.5;
		max-height: 22rem;
		overflow: auto;
	}
	pre,
	code {
		font-family: var(--a2ui-font-family-monospace);
	}

	/* Token colours — same hues in both themes, tuned for contrast. */
	:global(.tok-key) {
		color: #7c3aed;
	}
	:global(.tok-str) {
		color: #0f766e;
	}
	:global(.tok-num) {
		color: #b45309;
	}
	:global(.tok-lit) {
		color: #be123c;
	}
	:global(.tok-punct) {
		color: var(--a2ui-color-text-muted);
	}
	:global(.a2ui-dark .tok-key) {
		color: #c4b5fd;
	}
	:global(.a2ui-dark .tok-str) {
		color: #5eead4;
	}
	:global(.a2ui-dark .tok-num) {
		color: #fcd34d;
	}
	:global(.a2ui-dark .tok-lit) {
		color: #fda4af;
	}

	/* --- misc ------------------------------------------------------------ */
	.waiting,
	.muted {
		color: var(--a2ui-color-text-muted);
		font-size: 0.875rem;
		margin: 0.5rem 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.spinner {
		width: 0.75rem;
		height: 0.75rem;
		border: 2px solid var(--a2ui-color-border);
		border-top-color: var(--a2ui-color-primary);
		border-radius: 50%;
		animation: spin 700ms linear infinite;
		flex: none;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.msg,
		.stage-body :global(.a2ui-surface > *) {
			animation: none;
		}
		.pill.live .dot,
		.spinner {
			animation: none;
		}
	}
</style>
