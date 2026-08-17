/**
 * Minimal JSON syntax highlighter for the demo's wire feed.
 *
 * Same posture as the library's markdown renderer: escape first, then wrap
 * tokens in spans, so the markup handed to `{@html}` is only ever what this
 * function emitted — never agent-supplied text.
 */

const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

function escapeHtml(input: string): string {
	return input.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/**
 * Token classes: keys, strings, numbers, literals, punctuation. The regex runs
 * over already-escaped text, so `&quot;` is what delimits strings.
 */
const TOKEN =
	/(&quot;(?:[^&\\]|\\.|&(?!quot;))*?&quot;)(\s*:)?|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false|null)\b/g;

export function highlightJson(value: unknown): string {
	const json = JSON.stringify(value, null, 2) ?? '';
	return escapeHtml(json).replace(TOKEN, (match, str, colon, num, lit) => {
		if (str) {
			return colon
				? `<span class="tok-key">${str}</span><span class="tok-punct">${colon}</span>`
				: `<span class="tok-str">${str}</span>`;
		}
		if (num) return `<span class="tok-num">${num}</span>`;
		if (lit) return `<span class="tok-lit">${lit}</span>`;
		return match;
	});
}

/** The A2UI message type carried by an envelope, for the feed's badge. */
export function messageKind(message: object): string {
	for (const key of Object.keys(message)) {
		if (key !== 'version' && key !== 'metadata') return key;
	}
	return 'message';
}
