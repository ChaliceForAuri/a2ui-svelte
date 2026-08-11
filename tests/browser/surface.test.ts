import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Surface from '../../src/lib/render/Surface.svelte';
import Fallback from './fixtures/Fallback.svelte';
import {
	SURFACE,
	catalog,
	createSurface,
	makeClient,
	updateComponents,
	updateDataModel
} from './helpers.js';

test('components sent before root are buffered, then paint together', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(client, [{ id: 'greeting', component: 'Text', text: 'Hello' }]);
	const host = screen.container.querySelector('.a2ui-surface')!;
	await expect.poll(() => host.getAttribute('data-a2ui-ready')).toBe('false');
	expect(host.textContent).not.toContain('Hello');

	updateComponents(client, [{ id: 'root', component: 'Column', children: ['greeting'] } as never]);
	await expect.element(screen.getByText('Hello')).toBeInTheDocument();
	expect(host.getAttribute('data-a2ui-ready')).toBe('true');
});

test('a forward reference paints once the child arrives', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(client, [{ id: 'root', component: 'Column', children: ['late'] } as never]);
	const host = screen.container.querySelector('.a2ui-surface')!;
	await expect.poll(() => host.querySelector('[data-a2ui-pending="late"]')).not.toBeNull();

	updateComponents(client, [{ id: 'late', component: 'Text', text: 'Arrived' }]);
	await expect.element(screen.getByText('Arrived')).toBeInTheDocument();
	expect(host.querySelector('[data-a2ui-pending]')).toBeNull();
});

test('an unknown component type is skipped and its siblings still render', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(client, [
		{ id: 'root', component: 'Column', children: ['mystery', 'after'] } as never,
		{ id: 'mystery', component: 'HoloDeck' },
		{ id: 'after', component: 'Text', text: 'Still here' }
	]);

	await expect.element(screen.getByText('Still here')).toBeInTheDocument();
	const host = screen.container.querySelector('.a2ui-surface')!;
	expect(host.querySelector('[data-a2ui-unknown="HoloDeck"]')).not.toBeNull();
});

test('the fallback component renders in place of unknown types', async () => {
	const client = makeClient();
	const screen = await render(Surface, {
		props: { client, catalog, surfaceId: SURFACE, fallback: Fallback }
	});

	createSurface(client, [
		{ id: 'root', component: 'Column', children: ['mystery'] } as never,
		{ id: 'mystery', component: 'HoloDeck' }
	]);

	await expect.element(screen.getByTestId('fallback')).toHaveTextContent('HoloDeck:mystery');
});

test('a collection template renders one instance per item and tracks the data', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(
		client,
		[
			{ id: 'root', component: 'Column', children: ['list'] } as never,
			{
				id: 'list',
				component: 'List',
				children: { path: '/items', componentId: 'item' }
			} as never,
			{ id: 'item', component: 'Text', text: { path: 'name' } as never }
		],
		{ items: [{ name: 'Alpha' }, { name: 'Beta' }] }
	);

	await expect.element(screen.getByText('Alpha')).toBeInTheDocument();
	await expect.element(screen.getByText('Beta')).toBeInTheDocument();

	updateDataModel(client, '/items/2', { name: 'Gamma' });
	await expect.element(screen.getByText('Gamma')).toBeInTheDocument();

	// `null` deletes: /items/0 splices out, the survivors shift down.
	updateDataModel(client, '/items/0', null);
	await expect.poll(() => screen.container.textContent).not.toContain('Alpha');
	expect(screen.container.textContent).toContain('Beta');
	expect(screen.container.textContent).toContain('Gamma');
});

test('a cyclic component graph bottoms out at maxDepth instead of hanging', async () => {
	const client = makeClient();
	const screen = await render(Surface, {
		props: { client, catalog, surfaceId: SURFACE, maxDepth: 8 }
	});

	createSurface(client, [
		{ id: 'root', component: 'Column', children: ['a'] } as never,
		{ id: 'a', component: 'Column', children: ['b'] } as never,
		{ id: 'b', component: 'Column', children: ['a'] } as never
	]);

	const host = screen.container.querySelector('.a2ui-surface')!;
	await expect.poll(() => host.querySelector('[data-a2ui-error="max-depth"]')).not.toBeNull();
});
