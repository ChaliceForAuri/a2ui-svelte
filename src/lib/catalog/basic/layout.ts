/** Flexbox mappings for the catalog's `justify` / `align` semantic hints. */

export const JUSTIFY = {
	start: 'flex-start',
	center: 'center',
	end: 'flex-end',
	spaceBetween: 'space-between',
	spaceAround: 'space-around',
	spaceEvenly: 'space-evenly',
	stretch: 'stretch'
} as const;

export const ALIGN = {
	start: 'flex-start',
	center: 'center',
	end: 'flex-end',
	stretch: 'stretch'
} as const;
