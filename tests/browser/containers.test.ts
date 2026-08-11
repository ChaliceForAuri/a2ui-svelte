import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Surface from '../../src/lib/render/Surface.svelte';
import { A2uiClient } from '../../src/lib/client.svelte.js';
import type { RendererAction } from '../../src/lib/protocol/types.js';
import { SURFACE, catalog, createSurface, makeClient, updateComponents } from './helpers.js';

test('Tabs switch panels and clamp the selection when the tab list shrinks', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	const tabs = (titles: string[]) => ({
		id: 'tabs',
		component: 'Tabs',
		tabs: titles.map((title, i) => ({ title, child: `panel${i}` })) as never
	});

	createSurface(client, [
		{ id: 'root', component: 'Column', children: ['tabs'] } as never,
		tabs(['One', 'Two', 'Three']),
		{ id: 'panel0', component: 'Text', text: 'First panel' },
		{ id: 'panel1', component: 'Text', text: 'Second panel' },
		{ id: 'panel2', component: 'Text', text: 'Third panel' }
	]);

	await expect.element(screen.getByText('First panel')).toBeInTheDocument();
	expect(screen.container.textContent).not.toContain('Third panel');

	await screen.getByRole('tab', { name: 'Three' }).click();
	await expect.element(screen.getByText('Third panel')).toBeInTheDocument();
	expect(screen.container.textContent).not.toContain('First panel');

	// The agent shrinks the tab list out from under the selection.
	updateComponents(client, [tabs(['One'])]);
	await expect.element(screen.getByText('First panel')).toBeInTheDocument();
	expect(screen.container.textContent).not.toContain('Third panel');
	await expect
		.element(screen.getByRole('tab', { name: 'One' }))
		.toHaveAttribute('aria-selected', 'true');
});

test('Modal opens on trigger, renders content only while open, and closes', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(client, [
		{ id: 'root', component: 'Column', children: ['modal'] } as never,
		{ id: 'modal', component: 'Modal', trigger: 'openLabel', content: 'secret' } as never,
		{ id: 'openLabel', component: 'Text', text: 'Open details' },
		{ id: 'secret', component: 'Text', text: 'Hidden until opened' }
	]);

	const dialog = () => screen.container.querySelector('dialog')!;
	await expect.element(screen.getByText('Open details')).toBeInTheDocument();
	expect(screen.container.textContent).not.toContain('Hidden until opened');
	expect(dialog().open).toBe(false);

	await screen.getByText('Open details').click();
	await expect.element(screen.getByText('Hidden until opened')).toBeInTheDocument();
	expect(dialog().open).toBe(true);

	await screen.getByRole('button', { name: 'Close' }).click();
	await expect.poll(() => dialog().open).toBe(false);
	expect(screen.container.textContent).not.toContain('Hidden until opened');
});

test('a Button action dispatches with resolved context from the data model', async () => {
	const sent: RendererAction[] = [];
	const client = new A2uiClient({ onAction: (action) => sent.push(action) });
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(
		client,
		[
			{ id: 'root', component: 'Column', children: ['go'] } as never,
			{
				id: 'go',
				component: 'Button',
				child: 'goLabel',
				action: {
					event: { name: 'book', context: { size: { path: '/partySize' } } }
				} as never
			},
			{ id: 'goLabel', component: 'Text', text: 'Book' }
		],
		{ partySize: 4 }
	);

	await screen.getByRole('button', { name: 'Book' }).click();

	expect(sent).toHaveLength(1);
	expect(sent[0]).toMatchObject({
		name: 'book',
		surfaceId: SURFACE,
		sourceComponentId: 'go',
		context: { size: 4 }
	});
});
