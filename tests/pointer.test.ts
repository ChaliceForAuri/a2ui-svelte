import test from 'node:test';
import assert from 'node:assert/strict';
import {
	deletePointer,
	escapeToken,
	getPointer,
	joinPointer,
	parsePointer,
	setPointer,
	unescapeToken
} from '../src/lib/protocol/pointer.ts';

test('parsePointer treats "" and "/" as the root', () => {
	assert.deepEqual(parsePointer(''), []);
	assert.deepEqual(parsePointer('/'), []);
});

test('parsePointer decodes ~1 then ~0 in the right order', () => {
	assert.deepEqual(parsePointer('/a~1b/c~0d'), ['a/b', 'c~d']);
	assert.equal(unescapeToken('~01'), '~1');
	assert.equal(escapeToken('a/b~c'), 'a~1b~0c');
});

test('parsePointer rejects relative pointers', () => {
	assert.throws(() => parsePointer('a/b'), /Not an absolute JSON Pointer/);
});

test('getPointer reads objects, arrays and missing paths', () => {
	const doc = { cart: { items: [{ name: 'Widget', price: 9.99 }] } };
	assert.equal(getPointer(doc, '/cart/items/0/name'), 'Widget');
	assert.equal(getPointer(doc, '/cart/items/1/name'), undefined);
	assert.equal(getPointer(doc, '/nope/deep'), undefined);
	assert.deepEqual(getPointer(doc, ''), doc);
});

test('getPointer does not walk the prototype chain', () => {
	assert.equal(getPointer({}, '/constructor'), undefined);
	assert.equal(getPointer({}, '/toString'), undefined);
});

test('setPointer is immutable and structurally shares untouched subtrees', () => {
	const doc = { a: { keep: 1 }, b: { change: 1 } };
	const next = setPointer(doc, '/b/change', 2);

	assert.notEqual(next, doc);
	assert.equal(next.a, doc.a, 'untouched subtree must keep referential identity');
	assert.equal(next.b.change, 2);
	assert.equal(doc.b.change, 1, 'original must not be mutated');
});

test('setPointer creates intermediate containers, arrays for numeric tokens', () => {
	const next = setPointer({}, '/users/0/name', 'Ada');
	assert.deepEqual(next, { users: [{ name: 'Ada' }] });
	assert.ok(Array.isArray((next as { users: unknown }).users));
});

test('setPointer with the root pointer replaces the whole document', () => {
	assert.deepEqual(setPointer({ a: 1 }, '', { b: 2 }), { b: 2 });
	assert.deepEqual(setPointer({ a: 1 }, '/', { b: 2 }), { b: 2 });
});

test('setPointer refuses prototype-polluting keys', () => {
	assert.throws(() => setPointer({}, '/__proto__/polluted', true), /unsafe key/);
	assert.throws(() => setPointer({}, '/a/constructor', true), /unsafe key/);
	assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('deletePointer removes keys and splices arrays, immutably', () => {
	const doc = { a: 1, list: [1, 2, 3], keep: { x: 1 } };
	const next = deletePointer(doc, '/a');
	assert.deepEqual(Object.keys(next), ['list', 'keep']);
	assert.equal(next.keep, doc.keep);

	const spliced = deletePointer(doc, '/list/1');
	assert.deepEqual(spliced.list, [1, 3]);
	assert.deepEqual(doc.list, [1, 2, 3]);
});

test('deletePointer is a no-op for missing paths', () => {
	const doc = { a: 1 };
	assert.equal(deletePointer(doc, '/missing'), doc);
});

test('joinPointer escapes and skips empties', () => {
	assert.equal(joinPointer('/employees', 0), '/~1employees/0');
	assert.equal(joinPointer('', 'a', 'b'), '/a/b');
	assert.equal(joinPointer(), '');
});
