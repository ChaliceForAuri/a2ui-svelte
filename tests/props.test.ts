import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNodeProps } from '../src/lib/render/props.ts';
import { createFunctionRegistry } from '../src/lib/protocol/resolve.ts';
import { ROOT_SCOPE, childScope } from '../src/lib/protocol/scope.ts';
import type { EvalContext } from '../src/lib/protocol/functions.ts';
import type { CatalogEntry } from '../src/lib/catalog/types.ts';
import type { Action, ComponentSpec } from '../src/lib/protocol/types.ts';

const STUB = {} as CatalogEntry['component'];

const data = {
	contact: { email: '', firstName: 'Ada' },
	company: 'ACME',
	employees: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Katherine' }]
};

function harness(overrides: Partial<EvalContext> = {}) {
	const writes: { pointer: string; value: unknown }[] = [];
	const dispatched: { action: Action; source: string }[] = [];
	const ctx: EvalContext = {
		data,
		scope: ROOT_SCOPE,
		functions: createFunctionRegistry(),
		...overrides
	};
	const handlers = {
		setData: (pointer: string, value: unknown) => writes.push({ pointer, value }),
		dispatch: (action: Action, source: string) => dispatched.push({ action, source })
	};
	return { ctx, handlers, writes, dispatched };
}

test('scalar properties are resolved, structural keys are stripped', () => {
	const { ctx, handlers } = harness();
	const spec: ComponentSpec = {
		id: 'greeting',
		component: 'Text',
		catalogId: 'ignored',
		text: { path: '/contact/firstName' },
		variant: 'caption'
	};
	const built = buildNodeProps(spec, { component: STUB }, ctx, handlers);

	assert.deepEqual(built.props, { text: 'Ada', variant: 'caption' });
	assert.equal('id' in built.props, false);
	assert.equal('component' in built.props, false);
	assert.equal('catalogId' in built.props, false);
});

test('event-handler-shaped keys and function values are dropped', () => {
	const { ctx, handlers } = harness();
	const spec = {
		id: 'x',
		component: 'Text',
		text: 'hi',
		onclick: 'alert(1)',
		onClick: 'alert(1)',
		sneaky: () => 'nope'
	} as unknown as ComponentSpec;

	const built = buildNodeProps(spec, { component: STUB }, ctx, handlers);
	assert.deepEqual(Object.keys(built.props), ['text']);
});

test('a static child list becomes keyed slot nodes in the parent scope', () => {
	const { ctx, handlers } = harness();
	const entry: CatalogEntry = { component: STUB, slots: { children: 'children' } };
	const built = buildNodeProps(
		{ id: 'col', component: 'Column', children: ['a', 'b'] },
		entry,
		ctx,
		handlers
	);

	assert.equal(built.slots.children?.kind, 'nodes');
	const nodes = built.slots.children!.kind === 'nodes' ? built.slots.children.nodes : [];
	assert.deepEqual(
		nodes.map((n) => n.id),
		['a', 'b']
	);
	assert.equal(new Set(nodes.map((n) => n.key)).size, 2, 'keys must be unique');
});

test('a child template instantiates once per collection item with item scope', () => {
	const { ctx, handlers } = harness();
	const entry: CatalogEntry = { component: STUB, slots: { children: 'children' } };
	const built = buildNodeProps(
		{
			id: 'list',
			component: 'List',
			children: { path: '/employees', componentId: 'card' }
		},
		entry,
		ctx,
		handlers
	);

	const nodes = built.slots.children!.kind === 'nodes' ? built.slots.children.nodes : [];
	assert.equal(nodes.length, 3);
	assert.deepEqual(
		nodes.map((n) => n.id),
		['card', 'card', 'card']
	);
	assert.deepEqual(
		nodes.map((n) => n.scope.base),
		['/employees/0', '/employees/1', '/employees/2']
	);
	assert.deepEqual(
		nodes.map((n) => n.scope.index),
		[0, 1, 2]
	);
	assert.equal(new Set(nodes.map((n) => n.key)).size, 3, 'repeated template needs distinct keys');
});

test('a template over a missing or non-array path renders nothing', () => {
	const { ctx, handlers } = harness();
	const entry: CatalogEntry = { component: STUB, slots: { children: 'children' } };
	const built = buildNodeProps(
		{ id: 'l', component: 'List', children: { path: '/nope', componentId: 'card' } },
		entry,
		ctx,
		handlers
	);
	assert.deepEqual(built.slots.children, { kind: 'nodes', nodes: [] });
});

test('tabs resolve their titles and carry one child each', () => {
	const { ctx, handlers } = harness();
	const entry: CatalogEntry = { component: STUB, slots: { tabs: 'tabs' } };
	const built = buildNodeProps(
		{
			id: 't',
			component: 'Tabs',
			tabs: [
				{ title: { path: '/company' }, child: 'pane1' },
				{ title: 'Static', child: 'pane2' }
			]
		},
		entry,
		ctx,
		handlers
	);

	assert.equal(built.slots.tabs?.kind, 'tabs');
	const tabs = built.slots.tabs!.kind === 'tabs' ? built.slots.tabs.tabs : [];
	assert.deepEqual(
		tabs.map((t) => t.title),
		['ACME', 'Static']
	);
	assert.deepEqual(
		tabs.map((t) => t.nodes[0]?.id),
		['pane1', 'pane2']
	);
});

test('a bound input reads through and writes to the resolved pointer', () => {
	const { ctx, handlers, writes } = harness();
	const entry: CatalogEntry = { component: STUB, bindings: ['value'] };
	const built = buildNodeProps(
		{ id: 'field', component: 'TextField', label: 'Email', value: { path: '/contact/email' } },
		entry,
		ctx,
		handlers
	);

	assert.equal(built.bindings.value?.path, '/contact/email');
	assert.equal(built.bindings.value?.value, '');
	assert.equal(built.props.value, '', 'current value is also exposed positionally');

	built.bindings.value!.set('ada@example.com');
	assert.deepEqual(writes, [{ pointer: '/contact/email', value: 'ada@example.com' }]);
});

test('a bound input inside a template writes to the scoped pointer', () => {
	const scope = childScope(ROOT_SCOPE, '/employees', 2);
	const { ctx, handlers, writes } = harness({ scope });
	const entry: CatalogEntry = { component: STUB, bindings: ['value'] };
	const built = buildNodeProps(
		{ id: 'field', component: 'TextField', value: { path: 'name' } },
		entry,
		ctx,
		handlers
	);

	assert.equal(built.bindings.value?.value, 'Katherine');
	built.bindings.value!.set('Katherine J.');
	assert.deepEqual(writes, [{ pointer: '/employees/2/name', value: 'Katherine J.' }]);
});

test('an unbound literal value is read-only and warns instead of writing', () => {
	const { ctx, handlers, writes } = harness();
	const entry: CatalogEntry = { component: STUB, bindings: ['value'] };
	const built = buildNodeProps(
		{ id: 'f', component: 'TextField', value: 'literal' },
		entry,
		ctx,
		handlers
	);

	assert.equal(built.bindings.value?.path, null);
	built.bindings.value!.set('x');
	assert.deepEqual(writes, []);
});

test('action properties become handlers that dispatch the original action', () => {
	const { ctx, handlers, dispatched } = harness();
	const entry: CatalogEntry = { component: STUB, slots: { child: 'child' }, actions: ['action'] };
	const action: Action = { event: { name: 'submit', context: { who: { path: '/company' } } } };
	const built = buildNodeProps(
		{ id: 'btn', component: 'Button', child: 'label', action },
		entry,
		ctx,
		handlers
	);

	assert.equal(typeof built.actions.action, 'function');
	assert.equal('action' in built.props, false, 'the raw action must not leak as a prop');

	built.actions.action!();
	assert.equal(dispatched.length, 1);
	assert.equal(dispatched[0]?.source, 'btn');
	assert.deepEqual(dispatched[0]?.action, action);
});

test('checks are evaluated, not forwarded, and gate validity', () => {
	const { ctx, handlers } = harness();
	const entry: CatalogEntry = { component: STUB, bindings: ['value'] };
	const built = buildNodeProps(
		{
			id: 'email',
			component: 'TextField',
			value: { path: '/contact/email' },
			checks: [
				{
					call: 'required',
					args: { value: { path: '/contact/email' } },
					message: 'Email is required.'
				},
				{
					call: 'email',
					args: { value: { path: '/contact/email' } },
					message: 'Enter a valid email.'
				}
			]
		},
		entry,
		ctx,
		handlers
	);

	assert.equal(built.validation.valid, false);
	assert.deepEqual(built.validation.errors, ['Email is required.', 'Enter a valid email.']);
	assert.equal('checks' in built.props, false);
});

test('the composite {condition, message} check shape is supported', () => {
	const { ctx, handlers } = harness();
	const built = buildNodeProps(
		{
			id: 'b',
			component: 'Button',
			checks: [
				{
					condition: {
						call: 'and',
						args: {
							values: [
								{ call: 'required', args: { value: { path: '/company' } } },
								{ call: 'required', args: { value: { path: '/contact/email' } } }
							]
						}
					},
					message: 'Company and email are both required'
				}
			]
		},
		{ component: STUB },
		ctx,
		handlers
	);

	assert.equal(built.validation.valid, false);
	assert.deepEqual(built.validation.errors, ['Company and email are both required']);
});

test('visible defaults to true and only an explicit false hides the node', () => {
	const { ctx, handlers } = harness();
	const base = { id: 'n', component: 'Text', text: 'x' };

	assert.equal(buildNodeProps(base, { component: STUB }, ctx, handlers).visible, true);
	assert.equal(
		buildNodeProps({ ...base, visible: false }, { component: STUB }, ctx, handlers).visible,
		false
	);
	assert.equal(
		buildNodeProps(
			{ ...base, visible: { call: 'required', args: { value: { path: '/contact/email' } } } },
			{ component: STUB },
			ctx,
			handlers
		).visible,
		false,
		'a check that fails hides the node'
	);
	assert.equal(
		buildNodeProps({ ...base, visible: { path: '/nope' } }, { component: STUB }, ctx, handlers)
			.visible,
		true,
		'undefined is not an explicit false'
	);
});

/* ------------------------------------------- pending agent-backed values */

test('a prop waiting on the agent is named, and only that prop', () => {
	/*
	 * A value routed to the agent is a third state: not absent, not resolved.
	 * Without naming it, an agent-backed prop renders empty and then pops, and
	 * the component cannot tell that apart from "the agent sent nothing". The
	 * attribution has to be per-PROP — a skeleton over the whole node when one
	 * field is late is nearly as bad as no skeleton at all.
	 */
	const ctx: EvalContext = {
		data: { known: 'here' },
		scope: ROOT_SCOPE,
		functions: createFunctionRegistry({}),
		onUnresolvedFunction: () => {}
	};
	const spec = {
		id: 'n1',
		component: 'Stat',
		label: 'Stock',
		caption: { path: '/known' },
		value: { call: 'stockLevel', args: { sku: 'A-1' } }
	} as unknown as ComponentSpec;

	const built = buildNodeProps(spec, { component: STUB }, ctx, {
		setData: () => {},
		dispatch: () => {}
	});

	assert.deepEqual([...built.pending], ['value']);
	assert.equal(built.props.caption, 'here', 'resolved props are untouched');
	assert.equal(built.props.label, 'Stock', 'literal props are untouched');
});

test('nothing is pending when there is no route to an agent', () => {
	// A pure evaluation must not claim to be waiting on anything.
	const ctx: EvalContext = {
		data: {},
		scope: ROOT_SCOPE,
		functions: createFunctionRegistry({})
	};
	const spec = {
		id: 'n1',
		component: 'Stat',
		value: { call: 'stockLevel' }
	} as unknown as ComponentSpec;

	const built = buildNodeProps(spec, { component: STUB }, ctx, {
		setData: () => {},
		dispatch: () => {}
	});
	assert.equal(built.pending.size, 0);
});
