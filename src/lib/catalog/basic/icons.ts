/**
 * Icon paths for the `Icon` component.
 *
 * The v1.0 basic catalog pins a 52-name enum. This ships the names that appear
 * across the spec's examples and the common UI verbs; anything unrecognised
 * falls back to a neutral glyph rather than rendering nothing, and an agent can
 * always send `{ svgPath: { path: "M…" } }` instead of a name.
 *
 * All paths are drawn on a 24x24 viewBox with `stroke="currentColor"`, so icons
 * inherit colour from their container — the spec is explicit that a renderer
 * must not hardcode icon colour.
 */

export const ICON_PATHS: Record<string, string> = {
	mail: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zM3.5 7l8.5 6 8.5-6',
	check: 'M4 12.5l5 5 11-11',
	close: 'M6 6l12 12M18 6L6 18',
	add: 'M12 5v14M5 12h14',
	remove: 'M5 12h14',
	search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
	settings:
		'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM4 12l-1.2-1 1.2-3 1.6.3 1.6-1.6L7 5l3-1.2L11 5h2l1-1.2L17 5l-.2 1.7L18.4 8l1.6-.3 1.2 3-1.2 1v0l1.2 1-1.2 3-1.6-.3-1.6 1.6L17 19l-3 1.2L13 19h-2l-1 1.2L7 19l.2-1.7L5.6 16l-1.6.3-1.2-3z',
	home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
	person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
	calendar:
		'M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 4v4M16 4v4',
	clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
	info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
	warning: 'M12 3l9.5 17H2.5zM12 9v5M12 17v.5',
	error: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v6M12 16v.5',
	star: 'M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z',
	heart: 'M12 20s-7.5-4.7-7.5-9.5A4 4 0 0 1 12 7.6 4 4 0 0 1 19.5 10.5C19.5 15.3 12 20 12 20z',
	edit: 'M4 20h4l10-10-4-4L4 16zM14 6l4 4',
	delete: 'M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13',
	download: 'M12 4v11M7.5 11L12 15.5 16.5 11M5 19h14',
	upload: 'M12 20V9M7.5 13.5L12 9l4.5 4.5M5 5h14',
	share:
		'M18 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.2 11.3l7.6-3.6M8.2 13.7l7.6 3.6',
	link: 'M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5L12.5 17',
	arrowBack: 'M20 12H4M10 6l-6 6 6 6',
	arrowForward: 'M4 12h16M14 6l6 6-6 6',
	expandMore: 'M6 9l6 6 6-6',
	expandLess: 'M6 15l6-6 6 6',
	menu: 'M4 7h16M4 12h16M4 17h16',
	refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4',
	lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
	visibility:
		'M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
	phone:
		'M7 3h3l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L21 14v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 5 5.2 2 2 0 0 1 7 3z',
	location:
		'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
	cart: 'M3 5h2l2.5 10h10L21 8H6M9.5 19.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17.5 19.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
	send: 'M4 12l16-8-6 16-2.5-6.5z',
	attachment:
		'M17 8l-6.5 6.5a2.5 2.5 0 0 0 3.5 3.5L20 12a4.5 4.5 0 0 0-6.4-6.4L6.5 12.6a6.5 6.5 0 0 0 9.2 9.2',
	filter: 'M4 5h16l-6.5 7.5V19l-3 1.5v-8z',
	sort: 'M7 5v14M7 19l-3-3M17 19V5M17 5l3 3',
	more: 'M6 12h.01M12 12h.01M18 12h.01',
	play: 'M8 5l11 7-11 7z',
	pause: 'M9 5v14M15 5v14',
	folder: 'M4 6h6l2 2h8v11H4z',
	document: 'M6 3h8l4 4v14H6zM14 3v4h4',
	image: 'M4 5h16v14H4zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4 16l5-4 4 3 3-2 4 4',
	help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5A2.5 2.5 0 1 1 12 12.5V14M12 17v.5'
};

export const FALLBACK_ICON = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z';

export function iconPath(name: string): string {
	return ICON_PATHS[name] ?? FALLBACK_ICON;
}
