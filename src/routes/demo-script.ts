/**
 * The demo agent's script, shared by two delivery modes:
 *
 * - `api/agent/+server.ts` streams it as JSONL over HTTP (dev / server builds)
 * - `createDemoReplayTransport` replays it client-side (the static GitHub
 *   Pages build, where there is no server)
 *
 * It deliberately sends leaf components *before* `root` — that ordering is
 * legal, and watching the buffering rule handle it is the point of the demo.
 */

import type { AgentToRenderer } from '$lib/protocol/types.js';
import { BASIC_CATALOG_ID } from '$lib/protocol/types.js';
import { createEmitter, type Transport } from '$lib/transport/types.js';

const SURFACE = 'demo';

export const DEMO_SCRIPT: (AgentToRenderer | { __pause: number })[] = [
	{
		version: 'v1.0',
		createSurface: { surfaceId: SURFACE, catalogId: BASIC_CATALOG_ID, sendDataModel: true }
	},

	// Data arrives before anything can reference it — also legal.
	{
		version: 'v1.0',
		updateDataModel: {
			surfaceId: SURFACE,
			value: {
				company: 'Bistro Verde',
				contact: { firstName: '', lastName: '', email: '', preference: ['email'], subscribe: true },
				partySize: 2,
				slots: [
					{ time: '6:00 PM', table: 'Window' },
					{ time: '7:30 PM', table: 'Patio' },
					{ time: '9:00 PM', table: 'Bar' }
				]
			}
		}
	},
	{ __pause: 400 },

	// Leaves first. Nothing paints yet: `root` does not exist.
	{
		version: 'v1.0',
		updateComponents: {
			surfaceId: SURFACE,
			components: [
				{ id: 'header_icon', component: 'Icon', name: 'calendarToday' },
				{
					id: 'header_text',
					component: 'Text',
					text: {
						call: 'formatString',
						args: { value: '# Reserve at ${/company}' }
					}
				},
				{
					id: 'header_row',
					component: 'Row',
					children: ['header_icon', 'header_text'],
					align: 'center'
				}
			]
		}
	},
	{ __pause: 700 },

	// `root` lands — everything buffered so far paints at once.
	{
		version: 'v1.0',
		updateComponents: {
			surfaceId: SURFACE,
			components: [
				{ id: 'root', component: 'Card', child: 'form' },
				{
					id: 'form',
					component: 'Column',
					children: ['header_row', 'name_row', 'email_field', 'party_slider'],
					align: 'stretch'
				},
				{
					id: 'name_row',
					component: 'Row',
					children: ['first_group', 'last_group'],
					justify: 'spaceBetween'
				},
				{ id: 'first_group', component: 'Column', children: ['first_field'], weight: 1 },
				{
					id: 'first_field',
					component: 'TextField',
					label: 'First name',
					value: { path: '/contact/firstName' },
					variant: 'shortText',
					checks: [
						{
							call: 'required',
							args: { value: { path: '/contact/firstName' } },
							message: 'First name is required.'
						}
					]
				},
				{ id: 'last_group', component: 'Column', children: ['last_field'], weight: 1 },
				{
					id: 'last_field',
					component: 'TextField',
					label: 'Last name',
					value: { path: '/contact/lastName' },
					variant: 'shortText'
				},
				{
					id: 'email_field',
					component: 'TextField',
					label: 'Email',
					value: { path: '/contact/email' },
					variant: 'shortText',
					checks: [
						{
							call: 'required',
							args: { value: { path: '/contact/email' } },
							message: 'Email is required.'
						},
						{
							call: 'email',
							args: { value: { path: '/contact/email' } },
							message: 'Enter a valid email address.'
						}
					]
				},
				{
					id: 'party_slider',
					component: 'Slider',
					label: 'Party size',
					value: { path: '/partySize' },
					min: 1,
					max: 10,
					steps: 9
				}
			]
		}
	},
	{ __pause: 900 },

	// A collection template: one card per item, with scope-relative bindings.
	{
		version: 'v1.0',
		updateComponents: {
			surfaceId: SURFACE,
			components: [
				{
					id: 'form',
					component: 'Column',
					children: [
						'header_row',
						'name_row',
						'email_field',
						'party_slider',
						'slots_label',
						'slot_list',
						'divider',
						'newsletter',
						'submit'
					],
					align: 'stretch'
				},
				{ id: 'slots_label', component: 'Text', text: 'Available tonight', variant: 'caption' },
				{
					id: 'slot_list',
					component: 'List',
					direction: 'horizontal',
					children: { path: '/slots', componentId: 'slot_card' }
				},
				{ id: 'slot_card', component: 'Card', child: 'slot_body' },
				{ id: 'slot_body', component: 'Column', children: ['slot_time', 'slot_table'] },
				{
					id: 'slot_time',
					// Relative path — resolves against the current /slots/N item.
					component: 'Text',
					text: { path: 'time' }
				},
				{
					id: 'slot_table',
					component: 'Text',
					variant: 'caption',
					text: { call: 'formatString', args: { value: '#${@index(offset: 1)} · ${table}' } }
				},
				{ id: 'divider', component: 'Divider', axis: 'horizontal' },
				{
					id: 'newsletter',
					component: 'CheckBox',
					label: 'Email me about specials',
					value: { path: '/contact/subscribe' }
				},
				{ id: 'submit_label', component: 'Text', text: 'Book table' },
				{
					id: 'submit',
					component: 'Button',
					variant: 'primary',
					child: 'submit_label',
					// Disabled locally until both checks pass — no round trip.
					checks: [
						{
							condition: {
								call: 'and',
								args: {
									values: [
										{ call: 'required', args: { value: { path: '/contact/firstName' } } },
										{ call: 'email', args: { value: { path: '/contact/email' } } }
									]
								}
							},
							message: 'Enter your first name and a valid email.'
						}
					],
					action: {
						event: {
							name: 'book_table',
							context: {
								partySize: { path: '/partySize' },
								email: { path: '/contact/email' },
								subscribed: { path: '/contact/subscribe' }
							}
						}
					}
				}
			]
		}
	}
];

/**
 * Replays the script in the browser, honouring the pauses — the transport the
 * static demo runs on. Also a live example of how small a Transport is.
 */
export function createDemoReplayTransport(): Transport {
	const emitter = createEmitter();
	let cancelled = false;

	return {
		async start() {
			for (const step of DEMO_SCRIPT) {
				if (cancelled) return;
				if ('__pause' in step) {
					await new Promise((resolve) => setTimeout(resolve, step.__pause));
					continue;
				}
				emitter.emit(step);
			}
		},
		subscribe: emitter.subscribe,
		send(message) {
			// No agent on the other side of a static page; the demo's action log
			// (wired via onAction) is the visible result.
			console.log('[demo] action (static mode, not delivered):', message);
		},
		close() {
			cancelled = true;
			emitter.clear();
		}
	};
}
