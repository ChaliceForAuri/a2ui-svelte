/**
 * A mock A2UI agent.
 *
 * Streams the spec's contact-form fixture as JSONL with deliberate pauses, and
 * deliberately sends leaf components *before* `root` — that ordering is legal
 * and is exactly what the buffering rule exists for. Watching this endpoint is
 * the fastest way to see progressive rendering behave.
 */

import type { RequestHandler } from './$types';
import type { AgentToRenderer, RendererToAgent } from '$lib/protocol/types.js';
import { BASIC_CATALOG_ID } from '$lib/protocol/types.js';

const SURFACE = 'demo';

const script: (AgentToRenderer | { __pause: number })[] = [
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
				{ id: 'header_icon', component: 'Icon', name: 'calendar' },
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

export const POST: RequestHandler = async ({ request }) => {
	// Renderer -> agent messages arrive on the same URL, tagged by content type.
	if ((request.headers.get('content-type') ?? '').includes('a2ui')) {
		const message = (await request.json()) as RendererToAgent;
		console.log('[demo agent] received', JSON.stringify(message, null, 2));
		return new Response(null, { status: 204 });
	}

	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for (const step of script) {
					if (request.signal.aborted) break;
					if ('__pause' in step) {
						await new Promise((resolve) => setTimeout(resolve, step.__pause));
						continue;
					}
					controller.enqueue(encoder.encode(JSON.stringify(step) + '\n'));
				}
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'application/a2ui+json',
			'cache-control': 'no-store',
			// Stop reverse proxies buffering the stream into one chunk.
			'x-accel-buffering': 'no'
		}
	});
};
