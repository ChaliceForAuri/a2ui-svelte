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

import type { AgentToRenderer, RendererAction } from '$lib/protocol/types.js';
import { BASIC_CATALOG_ID } from '$lib/protocol/types.js';
import { createEmitter, type Transport } from '$lib/transport/types.js';

const SURFACE = 'demo';

/** The bookable slots. The mock agent rewrites this list to mark a selection. */
const SLOTS = [
	{ time: '6:00 PM', table: 'Window' },
	{ time: '7:30 PM', table: 'Patio' },
	{ time: '9:00 PM', table: 'Bar' }
];

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
				selection: { time: '', table: '' },
				slots: SLOTS.map((slot) => ({ ...slot, selected: false }))
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
				{
					id: 'slots_label',
					component: 'Text',
					text: 'Available tonight — pick a time',
					variant: 'caption'
				},
				{
					id: 'slot_list',
					component: 'List',
					direction: 'horizontal',
					children: { path: '/slots', componentId: 'slot_card' }
				},
				{
					id: 'slot_card',
					component: 'Button',
					child: 'slot_body',
					// Relative paths and @index resolve against *this* item, so one
					// component definition reports whichever slot was pressed.
					action: {
						event: {
							name: 'select_slot',
							context: {
								time: { path: 'time' },
								table: { path: 'table' },
								index: { call: '@index' }
							}
						}
					}
				},
				{
					id: 'slot_body',
					component: 'Column',
					children: ['slot_time', 'slot_table', 'slot_mark']
				},
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
				{
					id: 'slot_mark',
					component: 'Text',
					variant: 'caption',
					text: 'Selected',
					// A2UI has no equality function; the agent marks the chosen item
					// in the data instead, and the template just reads it.
					visible: { path: 'selected' }
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
								subscribed: { path: '/contact/subscribe' },
								time: { path: '/selection/time' },
								table: { path: '/selection/table' }
							}
						}
					}
				}
			]
		}
	}
];

/**
 * What the agent streams back when the user books.
 *
 * An action is a request, not a submission: the agent decides what happens
 * next and answers with more UI. Here it replaces the form with a
 * confirmation, which is also the clearest demonstration that
 * `updateComponents` re-points `root` at a different tree — no page
 * navigation, no client-side routing, just data.
 */
function bookingResponse(action: RendererAction): (AgentToRenderer | { __pause: number })[] {
	const context = (action.context ?? {}) as {
		partySize?: unknown;
		email?: unknown;
		time?: unknown;
		table?: unknown;
	};
	// Display fields take the value only when it is actually a string: coercing
	// an unexpected payload would put "[object Object]" in front of the user.
	const text = (value: unknown, fallback: string) =>
		typeof value === 'string' && value.trim() !== '' ? value : fallback;
	const size = Number(context.partySize);
	const partySize = Number.isFinite(size) ? size : 2;
	const email = text(context.email, 'your inbox');
	const chosen = text(context.time, SLOTS[1]!.time);
	const table = text(context.table, SLOTS[1]!.table);
	const reference = `BV-${String(Math.floor(Math.random() * 9000) + 1000)}`;

	return [
		{ __pause: 550 },
		{
			version: 'v1.0',
			updateDataModel: {
				surfaceId: SURFACE,
				path: '/booking',
				value: { reference, partySize, email, time: chosen, table }
			}
		},
		{ __pause: 350 },
		{
			version: 'v1.0',
			updateComponents: {
				surfaceId: SURFACE,
				components: [
					// Re-pointing `root` swaps the whole surface. The form's components
					// still exist; they are simply no longer reachable from the root.
					{ id: 'root', component: 'Column', children: ['confirm_card'], align: 'stretch' },
					{ id: 'confirm_card', component: 'Card', child: 'confirm_body' },
					{
						id: 'confirm_body',
						component: 'Column',
						children: ['confirm_head', 'confirm_detail', 'confirm_note', 'confirm_actions']
					},
					{ id: 'confirm_head', component: 'Row', children: ['confirm_icon', 'confirm_title'] },
					{ id: 'confirm_icon', component: 'Icon', name: 'check' },
					{ id: 'confirm_title', component: 'Text', text: "You're booked" },
					{
						id: 'confirm_detail',
						component: 'Text',
						text: {
							call: 'formatString',
							args: {
								value:
									'Table for ${/booking/partySize} at ${/booking/time} — ${/booking/table}. ' +
									'Reference ${/booking/reference}.'
							}
						}
					},
					{
						id: 'confirm_note',
						component: 'Text',
						variant: 'caption',
						text: {
							call: 'formatString',
							args: { value: 'Confirmation sent to ${/booking/email}. See you tonight.' }
						}
					},
					{ id: 'confirm_actions', component: 'Row', children: ['confirm_again'] },
					{ id: 'confirm_again_label', component: 'Text', text: 'Book another table' },
					{
						id: 'confirm_again',
						component: 'Button',
						variant: 'primary',
						child: 'confirm_again_label',
						action: { event: { name: 'book_another' } }
					}
				]
			}
		}
	];
}

/**
 * Selecting a time is a round trip too — the agent decides what the choice
 * means and writes it back. Marking the item in data (rather than sending new
 * components) is what lets one template render three cards, one of them
 * showing "Selected".
 */
function selectionResponse(action: RendererAction): AgentToRenderer[] {
	const context = (action.context ?? {}) as { index?: unknown };
	const index = Number(context.index);
	// The index is the only part of the payload that decides anything; the slot
	// itself comes from the agent's own list, so the marker and the booking can
	// never disagree about which time was chosen.
	const slot = Number.isInteger(index) ? SLOTS[index] : undefined;
	if (!slot) return [];

	return [
		{
			version: 'v1.0',
			updateDataModel: {
				surfaceId: SURFACE,
				path: '/slots',
				value: SLOTS.map((each, i) => ({ ...each, selected: i === index }))
			}
		},
		{
			version: 'v1.0',
			updateDataModel: {
				surfaceId: SURFACE,
				path: '/selection',
				value: { time: slot.time, table: slot.table }
			}
		}
	];
}

/** How the mock agent answers each action the demo can produce. */
export function agentResponse(action: RendererAction): (AgentToRenderer | { __pause: number })[] {
	if (action.name === 'select_slot') return selectionResponse(action);
	if (action.name === 'book_another') return DEMO_SCRIPT.slice(1);
	return bookingResponse(action);
}

/**
 * Replays the script in the browser, honouring the pauses — the transport the
 * static demo runs on. Also a live example of how small a Transport is: it
 * answers actions the way the real agent does, so the round trip completes.
 */
export function createDemoReplayTransport(): Transport {
	const emitter = createEmitter();
	let cancelled = false;

	async function play(steps: (AgentToRenderer | { __pause: number })[]) {
		for (const step of steps) {
			if (cancelled) return;
			if ('__pause' in step) {
				await new Promise((resolve) => setTimeout(resolve, step.__pause));
				continue;
			}
			emitter.emit(step);
		}
	}

	return {
		start: () => play(DEMO_SCRIPT),
		subscribe: emitter.subscribe,
		send(message) {
			const action = message.action;
			if (!action) return;
			void play(agentResponse(action));
		},
		close() {
			cancelled = true;
			emitter.clear();
		}
	};
}
