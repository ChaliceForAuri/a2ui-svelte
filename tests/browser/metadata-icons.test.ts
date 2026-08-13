import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Surface from '../../src/lib/render/Surface.svelte';
import { A2uiClient } from '../../src/lib/client.svelte.js';
import { ICON_PATHS, FALLBACK_ICON } from '../../src/lib/catalog/basic/icons.js';
import { BASIC_CATALOG_ID, type RendererToAgent } from '../../src/lib/protocol/types.js';
import { SURFACE, catalog } from './helpers.js';

/** The Icon.name enum from specification/v1_0/catalogs/basic/catalog.json. */
const SPEC_ICON_NAMES = [
	'accountCircle',
	'add',
	'arrowBack',
	'arrowForward',
	'attachFile',
	'calendarToday',
	'call',
	'camera',
	'check',
	'close',
	'delete',
	'download',
	'edit',
	'event',
	'error',
	'fastForward',
	'favorite',
	'favoriteOff',
	'folder',
	'help',
	'home',
	'info',
	'locationOn',
	'lock',
	'lockOpen',
	'mail',
	'menu',
	'moreVert',
	'moreHoriz',
	'notificationsOff',
	'notifications',
	'pause',
	'payment',
	'person',
	'phone',
	'photo',
	'play',
	'print',
	'refresh',
	'rewind',
	'search',
	'send',
	'settings',
	'share',
	'shoppingCart',
	'skipNext',
	'skipPrevious',
	'star',
	'starHalf',
	'starOff',
	'stop',
	'upload',
	'visibility',
	'visibilityOff',
	'volumeDown',
	'volumeMute',
	'volumeOff',
	'volumeUp',
	'warning'
];

test('ICON_PATHS covers exactly the 59 spec names', () => {
	expect(SPEC_ICON_NAMES).toHaveLength(59);
	expect(Object.keys(ICON_PATHS).sort()).toEqual([...SPEC_ICON_NAMES].sort());
});

test('every outbound message advertises capabilities; sendDataModel surfaces attach their data', async () => {
	const sent: RendererToAgent[] = [];
	const client = new A2uiClient({
		transport: { send: (m) => void sent.push(m), subscribe: () => () => {} },
		supportedCatalogIds: [BASIC_CATALOG_ID]
	});
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	client.ingest({
		version: 'v1.0',
		createSurface: {
			surfaceId: SURFACE,
			sendDataModel: true,
			dataModel: { n: 1 },
			components: [
				{ id: 'root', component: 'Column', children: ['go'] } as never,
				{
					id: 'go',
					component: 'Button',
					child: 'label',
					action: { event: { name: 'ping' } } as never
				},
				{ id: 'label', component: 'Text', text: 'Go' }
			]
		}
	});

	await screen.getByRole('button', { name: 'Go' }).click();

	expect(sent).toHaveLength(1);
	expect(sent[0]!.metadata?.a2uiRendererCapabilities).toEqual({
		'v1.0': { supportedCatalogIds: [BASIC_CATALOG_ID] }
	});
	expect(sent[0]!.metadata?.a2uiRendererDataModel?.surfaces).toEqual({ [SURFACE]: { n: 1 } });

	// Reducer-generated replies (errors included) carry the capabilities too.
	client.ingest({ version: 'v1.0', updateDataModel: { surfaceId: 'nope', value: 1 } });
	expect(sent).toHaveLength(2);
	expect(sent[1]!.error?.code).toBe('VALIDATION_FAILED');
	expect(sent[1]!.metadata?.a2uiRendererCapabilities).toEqual({
		'v1.0': { supportedCatalogIds: [BASIC_CATALOG_ID] }
	});
});

test('Icon renders named glyphs stroked, svgPath glyphs filled, unknown names as fallback', async () => {
	const client = new A2uiClient();
	const screen = await render(Surface, { props: { client, catalog, surfaceId: SURFACE } });

	client.ingest({
		version: 'v1.0',
		createSurface: {
			surfaceId: SURFACE,
			components: [
				{ id: 'root', component: 'Column', children: ['named', 'custom', 'mystery'] } as never,
				{ id: 'named', component: 'Icon', name: 'favorite', ariaLabel: 'named' },
				{
					id: 'custom',
					component: 'Icon',
					name: { svgPath: 'M2 2h20v20H2z' } as never,
					ariaLabel: 'custom'
				},
				{ id: 'mystery', component: 'Icon', name: 'definitelyUnknown', ariaLabel: 'mystery' }
			]
		}
	});

	const svg = (label: string) => screen.container.querySelector(`svg[aria-label="${label}"]`)!;
	await expect.poll(() => svg('named')).not.toBeNull();

	expect(svg('named').getAttribute('stroke')).toBe('currentColor');
	expect(svg('named').querySelector('path')?.getAttribute('d')).toBe(ICON_PATHS.favorite);

	expect(svg('custom').getAttribute('fill')).toBe('currentColor');
	expect(svg('custom').getAttribute('stroke')).toBeNull();
	expect(svg('custom').querySelector('path')?.getAttribute('d')).toBe('M2 2h20v20H2z');

	expect(svg('mystery').querySelector('path')?.getAttribute('d')).toBe(FALLBACK_ICON);
});
