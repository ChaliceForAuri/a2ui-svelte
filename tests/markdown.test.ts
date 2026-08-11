import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, isPlainText, renderMarkdown } from '../src/lib/catalog/basic/markdown.ts';
import { applyPatch, JsonPatchError } from '../src/lib/transport/json-patch.ts';
import { defaultExtract } from '../src/lib/transport/agui.ts';

/* ------------------------------- markdown -------------------------------- */

test('HTML in agent text is escaped, never executed', () => {
	const out = renderMarkdown('<script>alert(1)</script>');
	assert.equal(out.includes('<script'), false);
	assert.match(out, /&lt;script&gt;/);
	assert.equal(
		escapeHtml(`<img src=x onerror="alert(1)">`),
		'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
	);
});

test('headings, emphasis, code and lists render', () => {
	assert.equal(renderMarkdown('# Contact Us'), '<h1>Contact Us</h1>');
	assert.equal(
		renderMarkdown('**bold** and *italic*'),
		'<p><strong>bold</strong> and <em>italic</em></p>'
	);
	assert.equal(renderMarkdown('use `npm i`'), '<p>use <code>npm i</code></p>');
	assert.equal(renderMarkdown('- one\n- two'), '<ul><li>one</li><li>two</li></ul>');
});

test('links are allowlisted by scheme', () => {
	assert.match(renderMarkdown('[docs](https://a2ui.org)'), /<a href="https:\/\/a2ui\.org\/?"/);
	const dangerous = renderMarkdown('[click](javascript:alert(1))');
	assert.equal(dangerous.includes('<a '), false, 'javascript: must not become a link');
	assert.equal(renderMarkdown('[x](data:text/html,<b>)').includes('<a '), false);
});

test('rendered links carry noopener noreferrer', () => {
	assert.match(renderMarkdown('[x](https://example.com)'), /rel="noopener noreferrer"/);
});

test('emphasis inside code is not re-processed', () => {
	assert.equal(renderMarkdown('`**not bold**`'), '<p><code>**not bold**</code></p>');
});

test('isPlainText gates the markdown path', () => {
	assert.equal(isPlainText('Hello world'), true);
	assert.equal(isPlainText('# Heading'), false);
	assert.equal(isPlainText('two\nlines'), false);
	assert.equal(renderMarkdown(''), '');
});

/* ------------------------------ JSON Patch ------------------------------- */

test('replace, add and remove apply immutably', () => {
	const doc = { a: 1, keep: { x: 1 } };
	const next = applyPatch(doc, [
		{ op: 'replace', path: '/a', value: 2 },
		{ op: 'add', path: '/b', value: 3 }
	]);
	assert.deepEqual(next, { a: 2, keep: { x: 1 }, b: 3 });
	assert.deepEqual(doc, { a: 1, keep: { x: 1 } });
	assert.equal((next as typeof doc).keep, doc.keep);

	assert.deepEqual(applyPatch(next, [{ op: 'remove', path: '/b' }]), { a: 2, keep: { x: 1 } });
});

test('add on an array index inserts rather than overwrites', () => {
	const doc = { list: ['a', 'c'] };
	assert.deepEqual(applyPatch(doc, [{ op: 'add', path: '/list/1', value: 'b' }]).list, [
		'a',
		'b',
		'c'
	]);
	assert.deepEqual(applyPatch(doc, [{ op: 'add', path: '/list/-', value: 'd' }]).list, [
		'a',
		'c',
		'd'
	]);
});

test('move and copy relocate values', () => {
	const doc = { from: { v: 1 }, to: {} };
	const moved = applyPatch(doc, [{ op: 'move', from: '/from/v', path: '/to/v' }]);
	assert.deepEqual(moved, { from: {}, to: { v: 1 } });

	const copied = applyPatch(doc, [{ op: 'copy', from: '/from/v', path: '/to/v' }]);
	assert.deepEqual(copied, { from: { v: 1 }, to: { v: 1 } });
});

test('a failing test op throws so the caller can request a snapshot', () => {
	assert.throws(
		() => applyPatch({ a: 1 }, [{ op: 'test', path: '/a', value: 2 }]),
		(e: unknown) => e instanceof JsonPatchError
	);
	assert.doesNotThrow(() => applyPatch({ a: 1 }, [{ op: 'test', path: '/a', value: 1 }]));
});

/* ------------------------------- AG-UI ----------------------------------- */

test('A2UI envelopes are extracted from all three activity shapes', () => {
	const envelope = { version: 'v1.0', createSurface: { surfaceId: 's' } };

	assert.deepEqual(defaultExtract(envelope), [envelope]);
	assert.deepEqual(defaultExtract({ a2ui: envelope }), [envelope]);
	assert.deepEqual(defaultExtract({ messages: [envelope, envelope] }), [envelope, envelope]);
});

test('non-A2UI activity content extracts to nothing', () => {
	assert.deepEqual(defaultExtract({ someOtherActivity: true }), []);
	assert.deepEqual(defaultExtract(null), []);
	assert.deepEqual(defaultExtract('a string'), []);
	assert.deepEqual(defaultExtract({ messages: [{ notA2ui: 1 }] }), []);
});
