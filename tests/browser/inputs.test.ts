import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Surface from '../../src/lib/render/Surface.svelte';
import { SURFACE, catalog, createSurface, makeClient, updateDataModel } from './helpers.js';

function data(client: ReturnType<typeof makeClient>): Record<string, unknown> {
	return client.surface(SURFACE)?.dataModel as Record<string, unknown>;
}

test('typing in a TextField writes to the data model; updateDataModel writes back', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(
		client,
		[
			{ id: 'root', component: 'Column', children: ['name'] } as never,
			{
				id: 'name',
				component: 'TextField',
				label: 'Name',
				value: { path: '/contact/name' } as never
			}
		],
		{ contact: { name: '' } }
	);

	const input = screen.getByLabelText('Name');
	await input.fill('Hugo');
	expect(data(client)).toEqual({ contact: { name: 'Hugo' } });

	updateDataModel(client, '/contact/name', 'Auri');
	await expect.element(input).toHaveValue('Auri');
});

test('a number TextField stores numbers, and null when cleared', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(client, [
		{ id: 'root', component: 'Column', children: ['qty'] } as never,
		{
			id: 'qty',
			component: 'TextField',
			label: 'Quantity',
			variant: 'number',
			value: { path: '/qty' } as never
		}
	]);

	const input = screen.getByLabelText('Quantity');
	await input.fill('42');
	expect(data(client).qty).toBe(42);

	await input.fill('');
	expect(data(client).qty).toBeNull();
});

test('a TextField inside a collection template writes to the scoped item', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(
		client,
		[
			{ id: 'root', component: 'Column', children: ['list'] } as never,
			{
				id: 'list',
				component: 'List',
				children: { path: '/people', componentId: 'row' }
			} as never,
			{ id: 'row', component: 'TextField', label: 'Person', value: { path: 'name' } as never }
		],
		{ people: [{ name: 'Alpha' }, { name: 'Beta' }] }
	);

	const inputs = screen.getByLabelText('Person');
	await expect.poll(() => inputs.all().length).toBe(2);
	await inputs.all()[1]!.fill('Betty');

	expect(data(client).people).toEqual([{ name: 'Alpha' }, { name: 'Betty' }]);
});

test('CheckBox round-trips through the data model', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(
		client,
		[
			{ id: 'root', component: 'Column', children: ['agree'] } as never,
			{
				id: 'agree',
				component: 'CheckBox',
				label: 'Agree',
				value: { path: '/agree' } as never
			}
		],
		{ agree: false }
	);

	const box = screen.getByRole('checkbox', { name: 'Agree' });
	await box.click();
	expect(data(client).agree).toBe(true);

	updateDataModel(client, '/agree', false);
	await expect.element(box).not.toBeChecked();
});

test('validation surfaces only after blur, and gates a submitting Button', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(
		client,
		[
			{ id: 'root', component: 'Column', children: ['email', 'send'] } as never,
			{
				id: 'email',
				component: 'TextField',
				label: 'Email',
				value: { path: '/email' } as never,
				checks: [
					{ call: 'email', args: { value: { path: '/email' } }, message: 'Bad email' }
				] as never
			},
			{
				id: 'send',
				component: 'Button',
				child: 'sendLabel',
				action: { event: { name: 'send' } } as never,
				checks: [
					{
						condition: { call: 'email', args: { value: { path: '/email' } } },
						message: 'Fix the form'
					}
				] as never
			},
			{ id: 'sendLabel', component: 'Text', text: 'Send' }
		],
		{ email: '' }
	);

	const button = screen.getByRole('button', { name: 'Send' });
	await expect.element(button).toBeDisabled();

	// Not touched yet: the error stays hidden even though the check fails.
	expect(screen.container.textContent).not.toContain('Bad email');

	const input = screen.getByLabelText('Email');
	await input.fill('not-an-email');
	await input.element().dispatchEvent(new FocusEvent('blur'));
	await expect.element(screen.getByText('Bad email')).toBeInTheDocument();

	await input.fill('hugo@example.com');
	await expect.element(button).not.toBeDisabled();
	await expect.poll(() => screen.container.textContent).not.toContain('Bad email');
});

test('ChoicePicker keeps an array value and mutuallyExclusive stays exclusive', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(
		client,
		[
			{ id: 'root', component: 'Column', children: ['pick'] } as never,
			{
				id: 'pick',
				component: 'ChoicePicker',
				label: 'Table',
				variant: 'mutuallyExclusive',
				options: [
					{ label: 'Window', value: 'window' },
					{ label: 'Patio', value: 'patio' }
				] as never,
				value: { path: '/table' } as never
			}
		],
		{ table: [] }
	);

	await screen.getByRole('radio', { name: 'Window' }).click();
	expect(data(client).table).toEqual(['window']);

	await screen.getByRole('radio', { name: 'Patio' }).click();
	expect(data(client).table).toEqual(['patio']);
});

test('a datetime-local DateTimeInput round-trips what the user typed', async () => {
	const client = makeClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	createSurface(client, [
		{ id: 'root', component: 'Column', children: ['when'] } as never,
		{
			id: 'when',
			component: 'DateTimeInput',
			label: 'When',
			enableDate: true,
			enableTime: true,
			value: { path: '/when' } as never
		}
	]);

	const input = screen.getByLabelText('When');
	await input.fill('2026-08-11T14:30');

	// The data model stores the instant the user meant, in ISO 8601...
	const stored = String(data(client).when);
	expect(new Date(stored).getTime()).toBe(new Date('2026-08-11T14:30').getTime());

	// ...and the input keeps displaying the local wall-clock time they typed,
	// whatever timezone the browser is in.
	await expect.element(input).toHaveValue('2026-08-11T14:30');
});
