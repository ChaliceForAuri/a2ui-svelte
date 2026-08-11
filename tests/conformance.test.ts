/**
 * End-to-end over the spec's own contact-form fixture (v1.0), replayed as JSONL.
 *
 * This walks the real component graph the way the renderer does — reducer, then
 * `buildNodeProps` per node, following slots — so it exercises the whole
 * pipeline without needing a Svelte compiler.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_STATE, reduce, type ClientState } from '../src/lib/protocol/reducer.ts';
import { createFunctionRegistry } from '../src/lib/protocol/resolve.ts';
import { ROOT_SCOPE, type Scope } from '../src/lib/protocol/scope.ts';
import { buildNodeProps } from '../src/lib/render/props.ts';
import { readJsonLines } from '../src/lib/transport/stream.ts';
import type { CatalogEntry } from '../src/lib/catalog/types.ts';
import type { AgentToRenderer, ComponentSpec } from '../src/lib/protocol/types.ts';

const functions = createFunctionRegistry();
const STUB = {} as CatalogEntry['component'];

/** Mirrors the real basic-catalog metadata, minus the Svelte components. */
const CATALOG: Record<string, CatalogEntry> = {
	Text: { component: STUB },
	Icon: { component: STUB },
	Row: { component: STUB, slots: { children: 'children' } },
	Column: { component: STUB, slots: { children: 'children' } },
	List: { component: STUB, slots: { children: 'children' } },
	Card: { component: STUB, slots: { child: 'child' } },
	Divider: { component: STUB },
	Button: { component: STUB, slots: { child: 'child' }, actions: ['action'] },
	TextField: { component: STUB, bindings: ['value'] },
	CheckBox: { component: STUB, bindings: ['value'] },
	ChoicePicker: { component: STUB, bindings: ['value'] }
};

const FIXTURE = [
	'{"version": "v1.0", "createSurface":{"surfaceId":"contact_form_1","catalogId":"https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json"}}',
	'{"version": "v1.0", "updateComponents":{"surfaceId":"contact_form_1","components":[{"id":"root","component":"Card","child":"form_container"},{"id":"form_container","component":"Column","children":["header_row","name_row","email_group","pref_group","divider_1","newsletter_checkbox","submit_button"],"justify":"start","align":"stretch"},{"id":"header_row","component":"Row","children":["header_icon","header_text"],"align":"center"},{"id":"header_icon","component":"Icon","name":"mail"},{"id":"header_text","component":"Text","text":"# Contact Us"},{"id":"name_row","component":"Row","children":["first_name_group","last_name_group"],"justify":"spaceBetween"},{"id":"first_name_group","component":"Column","children":["first_name_label","first_name_field"],"weight":1},{"id":"first_name_label","component":"Text","text":"First Name","variant":"caption"},{"id":"first_name_field","component":"TextField","label":"First Name","value":{"path":"/contact/firstName"},"variant":"shortText"},{"id":"last_name_group","component":"Column","children":["last_name_label","last_name_field"],"weight":1},{"id":"last_name_label","component":"Text","text":"Last Name","variant":"caption"},{"id":"last_name_field","component":"TextField","label":"Last Name","value":{"path":"/contact/lastName"},"variant":"shortText"},{"id":"email_group","component":"Column","children":["email_label","email_field"]},{"id":"email_label","component":"Text","text":"Email Address","variant":"caption"},{"id":"email_field","component":"TextField","label":"Email","value":{"path":"/contact/email"},"variant":"shortText","checks":[{"call":"required","args":{"value":{"path":"/contact/email"}},"message":"Email is required."},{"call":"email","args":{"value":{"path":"/contact/email"}},"message":"Please enter a valid email address."}]},{"id":"pref_group","component":"Column","children":["pref_label","pref_picker"]},{"id":"pref_label","component":"Text","text":"Preferred Contact Method","variant":"caption"},{"id":"pref_picker","component":"ChoicePicker","variant":"mutuallyExclusive","options":[{"label":"Email","value":"email"},{"label":"Phone","value":"phone"},{"label":"SMS","value":"sms"}],"value":{"path":"/contact/preference"}},{"id":"divider_1","component":"Divider","axis":"horizontal"},{"id":"newsletter_checkbox","component":"CheckBox","label":"Subscribe to our newsletter","value":{"path":"/contact/subscribe"}},{"id":"submit_button_label","component":"Text","text":"Send Message"},{"id":"submit_button","component":"Button","child":"submit_button_label","variant":"primary","action":{"event":{"name":"submitContactForm","context":{"formId":"contact_form_1","isNewsletterSubscribed":{"path":"/contact/subscribe"}}}}}]}}',
	'{"version": "v1.0", "updateDataModel":{"surfaceId":"contact_form_1","path":"/contact","value":{"firstName":"John","lastName":"Doe","email":"john.doe@example.com","phone":"1234567890","preference":["email"],"subscribe":true}}}'
].join('\n');

function replay(jsonl: string) {
	let state: ClientState = INITIAL_STATE;
	const outbound = [];
	for (const line of jsonl.split('\n')) {
		const result = reduce(state, JSON.parse(line) as AgentToRenderer, { functions });
		state = result.state;
		outbound.push(...result.outbound);
	}
	return { state, outbound };
}

/** Walk the graph exactly as `Node.svelte` -> `Slot.svelte` would. */
function walk(
	state: ClientState,
	surfaceId: string,
	id: string,
	scope: Scope = ROOT_SCOPE,
	visit: (spec: ComponentSpec, built: ReturnType<typeof buildNodeProps>, scope: Scope) => void,
	depth = 0
): number {
	if (depth > 64) return 0;
	const surface = state.surfaces[surfaceId]!;
	const spec = surface.components[id];
	if (!spec) return 0;

	const entry = CATALOG[spec.component];
	if (!entry) return 0;

	const built = buildNodeProps(
		spec,
		entry,
		{ data: surface.dataModel, scope, functions },
		{
			setData: () => {},
			dispatch: () => {}
		}
	);
	visit(spec, built, scope);

	let count = 1;
	for (const slot of Object.values(built.slots)) {
		const nodes = slot.kind === 'nodes' ? slot.nodes : slot.tabs.flatMap((t) => t.nodes);
		for (const node of nodes)
			count += walk(state, surfaceId, node.id, node.scope, visit, depth + 1);
	}
	return count;
}

test('the spec contact-form fixture replays with no protocol errors', () => {
	const { state, outbound } = replay(FIXTURE);
	assert.deepEqual(outbound, []);
	assert.equal(state.surfaces.contact_form_1?.ready, true);
});

test('the whole tree is reachable from root and every node resolves', () => {
	const { state } = replay(FIXTURE);
	const seen: string[] = [];
	const visited = walk(state, 'contact_form_1', 'root', ROOT_SCOPE, (spec) => seen.push(spec.id));

	assert.equal(visited, 22, 'every component in the fixture is reachable');
	assert.ok(
		seen.includes('submit_button_label'),
		'button labels are reached through the child slot'
	);
	assert.equal(new Set(seen).size, seen.length, 'no component is visited twice');
});

test('bindings read the values delivered by updateDataModel', () => {
	const { state } = replay(FIXTURE);
	const values = new Map<string, unknown>();
	walk(state, 'contact_form_1', 'root', ROOT_SCOPE, (spec, built) => {
		if (built.bindings.value) values.set(spec.id, built.bindings.value.value);
	});

	assert.equal(values.get('first_name_field'), 'John');
	assert.equal(values.get('email_field'), 'john.doe@example.com');
	assert.equal(values.get('newsletter_checkbox'), true);
	assert.deepEqual(values.get('pref_picker'), ['email'], 'single-select still stores an array');
});

test('checks pass against the delivered data and the submit button is enabled', () => {
	const { state } = replay(FIXTURE);
	const invalid: string[] = [];
	walk(state, 'contact_form_1', 'root', ROOT_SCOPE, (spec, built) => {
		if (!built.validation.valid) invalid.push(spec.id);
	});
	assert.deepEqual(invalid, []);
});

test('clearing a required field invalidates only that field', () => {
	const { state } = replay(FIXTURE);
	const cleared = reduce(
		state,
		{
			version: 'v1.0',
			updateDataModel: { surfaceId: 'contact_form_1', path: '/contact/email', value: '' }
		},
		{ functions }
	).state;

	const invalid: string[] = [];
	walk(cleared, 'contact_form_1', 'root', ROOT_SCOPE, (spec, built) => {
		if (!built.validation.valid) invalid.push(spec.id);
	});
	assert.deepEqual(invalid, ['email_field']);
});

test('leaf components sent before root are buffered, then paint together', () => {
	const lines = FIXTURE.split('\n');
	const partial = replay([lines[0]!, lines[2]!].join('\n'));
	assert.equal(partial.state.surfaces.contact_form_1?.ready, false);

	const full = replay(FIXTURE);
	assert.equal(full.state.surfaces.contact_form_1?.ready, true);
});

test('a JSONL byte stream split mid-message still parses cleanly', async () => {
	const bytes = new TextEncoder().encode(FIXTURE + '\n');
	// Chop into small chunks so messages straddle chunk boundaries.
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (let i = 0; i < bytes.length; i += 137) controller.enqueue(bytes.slice(i, i + 137));
			controller.close();
		}
	});

	const received: AgentToRenderer[] = [];
	for await (const message of readJsonLines<AgentToRenderer>(stream)) received.push(message);

	assert.equal(received.length, 3);
	assert.equal(received[0]?.createSurface?.surfaceId, 'contact_form_1');
	assert.equal(received[1]?.updateComponents?.components.length, 22);
});

test('unknown component types are skipped, not fatal', () => {
	const { state } = replay(FIXTURE);
	const withAlien = reduce(
		state,
		{
			version: 'v1.0',
			updateComponents: {
				surfaceId: 'contact_form_1',
				components: [
					{ id: 'form_container', component: 'Column', children: ['header_row', 'alien'] },
					{ id: 'alien', component: 'HolographicProjector', intensity: 11 }
				]
			}
		},
		{ functions }
	).state;

	const seen: string[] = [];
	assert.doesNotThrow(() =>
		walk(withAlien, 'contact_form_1', 'root', ROOT_SCOPE, (spec) => seen.push(spec.id))
	);
	assert.equal(seen.includes('alien'), false, 'the unknown type renders nothing');
	assert.ok(seen.includes('header_text'), 'its siblings still render');
});
