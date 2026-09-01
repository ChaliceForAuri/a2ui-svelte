import test from 'node:test';
import assert from 'node:assert/strict';
import {
	agentCallKey,
	createFunctionRegistry,
	resolveDynamic,
	evaluateExpression
} from '../src/lib/protocol/resolve.ts';
import { ROOT_SCOPE, absolutePath, childScope } from '../src/lib/protocol/scope.ts';
import type { EvalContext } from '../src/lib/protocol/functions.ts';

const data = {
	appName: 'Bistro',
	user: { firstName: 'Ada', lastName: 'Lovelace' },
	company: 'ACME',
	date: '2026-02-02T15:17:00Z',
	price: 1234.5,
	count: 3,
	employees: [
		{ name: 'Ada', title: 'Engineer' },
		{ name: 'Grace', title: 'Admiral' }
	]
};

const ctx = (scope = ROOT_SCOPE): EvalContext => ({
	data,
	scope,
	functions: createFunctionRegistry()
});

test('literals pass through untouched', () => {
	assert.equal(resolveDynamic('Welcome', ctx()), 'Welcome');
	assert.equal(resolveDynamic(42, ctx()), 42);
	assert.equal(resolveDynamic(true, ctx()), true);
});

test('path refs read the data model', () => {
	assert.equal(resolveDynamic({ path: '/user/firstName' }, ctx()), 'Ada');
	assert.equal(resolveDynamic({ path: '/missing' }, ctx()), undefined);
});

test('relative paths resolve against collection scope, absolute ones do not', () => {
	const scope = childScope(ROOT_SCOPE, '/employees', 1);
	assert.equal(absolutePath('name', scope), '/employees/1/name');
	assert.equal(absolutePath('/company', scope), '/company');

	assert.equal(resolveDynamic({ path: 'name' }, ctx(scope)), 'Grace');
	assert.equal(resolveDynamic({ path: '/company' }, ctx(scope)), 'ACME');
});

test('objects and arrays resolve member-wise', () => {
	const resolved = resolveDynamic(
		{ who: { path: '/user/firstName' }, list: [{ path: '/company' }, 'literal'] },
		ctx()
	);
	assert.deepEqual(resolved, { who: 'Ada', list: ['ACME', 'literal'] });
});

test('function refs evaluate with resolved arguments', () => {
	assert.equal(
		resolveDynamic({ call: 'required', args: { value: { path: '/company' } } }, ctx()),
		true
	);
	assert.equal(
		resolveDynamic({ call: 'required', args: { value: { path: '/nope' } } }, ctx()),
		false
	);
});

test('and/or/not compose nested function refs', () => {
	const expr = {
		call: 'and',
		args: {
			values: [
				{ call: 'required', args: { value: { path: '/company' } } },
				{
					call: 'or',
					args: {
						values: [
							{ call: 'required', args: { value: { path: '/nope' } } },
							{ call: 'required', args: { value: { path: '/appName' } } }
						]
					}
				}
			]
		}
	};
	assert.equal(resolveDynamic(expr, ctx()), true);
	assert.equal(resolveDynamic({ call: 'not', args: { value: true } }, ctx()), false);
});

test('unknown functions resolve to undefined rather than throwing', () => {
	assert.equal(resolveDynamic({ call: 'definitelyNotAFunction' }, ctx()), undefined);
});

test('formatString interpolates absolute paths', () => {
	const out = resolveDynamic(
		{ call: 'formatString', args: { value: 'Hello, ${/user/firstName}! Welcome to ${/appName}.' } },
		ctx()
	);
	assert.equal(out, 'Hello, Ada! Welcome to Bistro.');
});

test('formatString interpolates relative paths inside a template scope', () => {
	const scope = childScope(ROOT_SCOPE, '/employees', 0);
	const out = resolveDynamic(
		{ call: 'formatString', args: { value: '${name} — ${title} at ${/company}' } },
		ctx(scope)
	);
	assert.equal(out, 'Ada — Engineer at ACME');
});

test('formatString supports nested calls with quoted and ${} arguments', () => {
	const out = resolveDynamic(
		{
			call: 'formatString',
			args: { value: "on ${formatDate(value:${/date}, format:'yyyy-MM-dd')}" }
		},
		ctx()
	);
	assert.match(out as string, /^on 2026-02-0[23]$/); // local timezone may shift the day
});

test('@index is scope-aware and honours offset', () => {
	const scope = childScope(ROOT_SCOPE, '/employees', 1);
	assert.equal(evaluateExpression('@index()', ctx(scope)), 1);
	assert.equal(evaluateExpression('@index(offset: 1)', ctx(scope)), 2);
	assert.equal(evaluateExpression('@index()', ctx()), 0, 'outside a template @index is 0');

	const out = resolveDynamic(
		{ call: 'formatString', args: { value: '#${@index(offset: 1)}' } },
		ctx(scope)
	);
	assert.equal(out, '#2');
});

test('unbalanced interpolation degrades instead of throwing', () => {
	const out = resolveDynamic({ call: 'formatString', args: { value: 'a ${/appName b' } }, ctx());
	assert.equal(out, 'a ${/appName b');
});

test('text with no holes short-circuits', () => {
	assert.equal(resolveDynamic({ call: 'formatString', args: { value: 'plain' } }, ctx()), 'plain');
});

test('deeply self-referential registries bottom out instead of hanging', () => {
	const functions = createFunctionRegistry({
		loop: { callableFrom: 'rendererOnly', run: (_a, c) => resolveDynamic({ call: 'loop' }, c) }
	});
	assert.doesNotThrow(() =>
		resolveDynamic({ call: 'loop' }, { data, scope: ROOT_SCOPE, functions })
	);
});

/* --------------------------------------------- agent-side function routing */

test('an unregistered function is routed to the agent, not dropped', () => {
	/*
	 * The spec's fallback routing: local lookup first, and a name this renderer
	 * does not implement is assumed to be an AGENT function. Before this, the
	 * renderer warned and returned undefined, so any catalog declaring an
	 * agent-side function rendered a hole in silence.
	 */
	const routed: { call: string; args: unknown }[] = [];
	const ctx: EvalContext = {
		data: { order: { id: 'ord-7' } },
		scope: ROOT_SCOPE,
		functions: createFunctionRegistry({}),
		onUnresolvedFunction: (ref) => routed.push({ call: ref.call, args: ref.args })
	};

	const value = resolveDynamic(
		{ call: 'checkInventory', args: { id: { path: '/order/id' } } },
		ctx
	);

	assert.equal(value, undefined, 'nothing to show until the agent answers');
	assert.equal(routed.length, 1);
	assert.equal(routed[0]?.call, 'checkInventory');
	// Args reach the agent RESOLVED — it wants values, not our {path} refs.
	assert.deepEqual(routed[0]?.args, { id: 'ord-7' });
});

test('a value the agent already returned resolves like a local function', () => {
	const ref = { call: 'checkInventory', args: { id: 'ord-7' } };
	let asked = 0;
	const ctx: EvalContext = {
		data: {},
		scope: ROOT_SCOPE,
		functions: createFunctionRegistry({}),
		agentValues: { [agentCallKey(ref)]: { inStock: true } },
		onUnresolvedFunction: () => asked++
	};

	assert.deepEqual(resolveDynamic(ref, ctx), { inStock: true });
	assert.equal(asked, 0, 'a cached value must not re-ask the agent');
});

test('call identity ignores argument order, so one call is one round trip', () => {
	// Two objects, same meaning, different key order — they must dedupe.
	assert.equal(
		agentCallKey({ call: 'f', args: { b: 2, a: 1 } }),
		agentCallKey({ call: 'f', args: { a: 1, b: 2 } })
	);
	// But a different catalog is a different function.
	assert.notEqual(
		agentCallKey({ call: 'f', catalogId: 'x', args: {} }),
		agentCallKey({ call: 'f', catalogId: 'y', args: {} })
	);
});

test('without a route to an agent, an unknown function still just returns undefined', () => {
	// Pure evaluation (no client attached) must not throw.
	const ctx: EvalContext = { data: {}, scope: ROOT_SCOPE, functions: createFunctionRegistry({}) };
	assert.equal(resolveDynamic({ call: 'nope' }, ctx), undefined);
});
