/**
 * The A2UI v1.0 basic catalog, rendered in Svelte.
 *
 * Property names track `catalogs/basic/catalog.json` exactly — including the
 * v1.0 renames that trip up implementations built against v0.9: `Modal` uses
 * `trigger`/`content` (not `entryPointChild`/`contentChild`), `Tabs` uses `tabs`
 * (not `tabItems`), `Slider` uses `min`/`max` (not `minValue`/`maxValue`),
 * `TextField` uses `value`/`variant` (not `text`/`textFieldType`), and
 * `ChoicePicker` replaces `MultipleChoice`.
 */

import { BASIC_CATALOG_ID } from '../../protocol/types.js';
import type { Catalog, CatalogEntry } from '../types.js';

import Text from './Text.svelte';
import Image from './Image.svelte';
import Icon from './Icon.svelte';
import Video from './Video.svelte';
import AudioPlayer from './AudioPlayer.svelte';
import Row from './Row.svelte';
import Column from './Column.svelte';
import List from './List.svelte';
import Card from './Card.svelte';
import Tabs from './Tabs.svelte';
import Modal from './Modal.svelte';
import Divider from './Divider.svelte';
import Button from './Button.svelte';
import TextField from './TextField.svelte';
import CheckBox from './CheckBox.svelte';
import ChoicePicker from './ChoicePicker.svelte';
import Slider from './Slider.svelte';
import DateTimeInput from './DateTimeInput.svelte';

const entry = (component: unknown, rest: Omit<CatalogEntry, 'component'> = {}): CatalogEntry =>
	({ component, ...rest }) as CatalogEntry;

export const BASIC_COMPONENTS: Record<string, CatalogEntry> = {
	/* --- display --- */
	Text: entry(Text),
	Image: entry(Image),
	Icon: entry(Icon),
	Video: entry(Video),
	AudioPlayer: entry(AudioPlayer),

	/* --- layout --- */
	Row: entry(Row, { slots: { children: 'children' } }),
	Column: entry(Column, { slots: { children: 'children' } }),
	List: entry(List, { slots: { children: 'children' } }),
	Card: entry(Card, { slots: { child: 'child' } }),
	Tabs: entry(Tabs, { slots: { tabs: 'tabs' } }),
	Modal: entry(Modal, { slots: { trigger: 'child', content: 'child' } }),
	Divider: entry(Divider),

	/* --- interaction --- */
	Button: entry(Button, { slots: { child: 'child' }, actions: ['action'] }),
	TextField: entry(TextField, { bindings: ['value'] }),
	CheckBox: entry(CheckBox, { bindings: ['value'] }),
	ChoicePicker: entry(ChoicePicker, { bindings: ['value'] }),
	Slider: entry(Slider, { bindings: ['value'] }),
	DateTimeInput: entry(DateTimeInput, { bindings: ['value'] })
};

export const basicCatalog: Catalog = {
	id: BASIC_CATALOG_ID,
	components: BASIC_COMPONENTS
};

export {
	Text,
	Image,
	Icon,
	Video,
	AudioPlayer,
	Row,
	Column,
	List,
	Card,
	Tabs,
	Modal,
	Divider,
	Button,
	TextField,
	CheckBox,
	ChoicePicker,
	Slider,
	DateTimeInput
};

export { renderMarkdown, escapeHtml, isPlainText } from './markdown.js';
export { ICON_PATHS, iconPath } from './icons.js';
export { JUSTIFY, ALIGN } from './layout.js';
