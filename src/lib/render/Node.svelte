<!--
	Renders one A2UI component by id.

	Recursion happens by self-import (`<svelte:self>` is obsolete in Svelte 5).
	Unresolvable ids render a placeholder rather than throwing: the spec requires
	renderers to tolerate forward references, because a streaming agent routinely
	names a child before it defines it.
-->
<script lang="ts">
	import { getContext, setContext } from 'svelte';
	import type { Scope } from '../protocol/scope.js';
	import { ROOT_SCOPE } from '../protocol/scope.js';
	import type { EvalContext } from '../protocol/resolve.js';
	import type { Action } from '../protocol/types.js';
	import { buildNodeProps } from './props.js';
	import { getRenderContext, DEPTH_KEY } from './context.js';

	interface Props {
		id: string;
		scope?: Scope;
	}

	let { id, scope = ROOT_SCOPE }: Props = $props();

	const rc = getRenderContext();

	// Depth rides on context so slots don't have to thread it through every
	// catalog component's prop list.
	const depth = getContext<number>(DEPTH_KEY) ?? 0;
	setContext(DEPTH_KEY, depth + 1);

	const surface = $derived(rc.client.surface(rc.surfaceId));
	const spec = $derived(surface?.components[id]);

	const entry = $derived(
		spec ? rc.catalog.resolve(spec.catalogId ?? surface?.catalogId, spec.component) : undefined
	);

	const ctx: EvalContext = $derived({
		data: surface?.dataModel,
		scope,
		functions: rc.catalog.functions
	});

	const handlers = {
		setData(pointer: string, value: unknown) {
			rc.client.setData(rc.surfaceId, pointer, value);
		},
		dispatch(action: Action, sourceComponentId: string, actionScope: Scope) {
			rc.client.dispatch(rc.surfaceId, action, sourceComponentId, actionScope);
		}
	};

	const built = $derived(spec && entry ? buildNodeProps(spec, entry, ctx, handlers) : null);

	const Resolved = $derived(entry?.component);
	const Fallback = $derived(rc.fallback);
</script>

{#if depth > rc.maxDepth}
	<!-- Bounded: a cyclic component graph would otherwise recurse forever. -->
	<span data-a2ui-error="max-depth" hidden></span>
{:else if !spec}
	<!-- Forward reference: the agent named this child before defining it. -->
	<span data-a2ui-pending={id} hidden></span>
{:else if !Resolved}
	{#if Fallback}
		<Fallback component={spec.component} {id} />
	{:else}
		<span data-a2ui-unknown={spec.component} hidden></span>
	{/if}
{:else if built?.visible}
	<Resolved
		{...built.props}
		slots={built.slots}
		bindings={built.bindings}
		actions={built.actions}
		validation={built.validation}
		a2ui={{ id, component: spec.component, spec, scope }}
	/>
{/if}
