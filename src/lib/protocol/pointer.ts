/**
 * RFC 6901 JSON Pointer, plus the immutable set/delete used by the reducer.
 *
 * Every mutation returns a new root that structurally shares every untouched
 * subtree. That referential stability is what lets `$derived` short-circuit
 * downstream work in the renderer, so it is load-bearing, not stylistic.
 */

/** `~1` -> `/`, `~0` -> `~`. Order matters. */
export function unescapeToken(token: string): string {
	return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function escapeToken(token: string): string {
	return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Split a pointer into decoded tokens. `''` and `'/'` both mean "the root". */
export function parsePointer(pointer: string): string[] {
	if (pointer === '' || pointer === '/') return [];
	if (!pointer.startsWith('/')) {
		throw new Error(`Not an absolute JSON Pointer: ${JSON.stringify(pointer)}`);
	}
	return pointer.slice(1).split('/').map(unescapeToken);
}

export function joinPointer(...parts: (string | number)[]): string {
	const out = parts
		.filter((p) => p !== '' && p !== undefined && p !== null)
		.map((p) => escapeToken(String(p)));
	return out.length === 0 ? '' : '/' + out.join('/');
}

function isIndexable(v: unknown): v is Record<string, unknown> | unknown[] {
	return typeof v === 'object' && v !== null;
}

/** Read a pointer. Returns `undefined` for any unresolvable segment. */
export function getPointer(root: unknown, pointer: string): unknown {
	let node: unknown = root;
	for (const token of parsePointer(pointer)) {
		if (!isIndexable(node)) return undefined;
		if (Array.isArray(node)) {
			const i = token === '-' ? node.length : Number(token);
			if (!Number.isInteger(i) || i < 0 || i >= node.length) return undefined;
			node = node[i];
		} else {
			if (!Object.prototype.hasOwnProperty.call(node, token)) return undefined;
			node = (node as Record<string, unknown>)[token];
		}
	}
	return node;
}

/** Guard against `__proto__` / `constructor` / `prototype` keys arriving over the wire. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assertSafeKey(key: string, pointer: string): void {
	if (FORBIDDEN_KEYS.has(key)) {
		throw new Error(`Refusing to write unsafe key ${JSON.stringify(key)} in ${pointer}`);
	}
}

/**
 * Immutably write `value` at `pointer`, creating intermediate containers as
 * needed. A numeric token creates an array, anything else creates an object.
 */
export function setPointer<T>(root: T, pointer: string, value: unknown): T {
	const tokens = parsePointer(pointer);
	if (tokens.length === 0) return value as T;
	return write(root, tokens, 0, value, pointer) as T;
}

function write(
	node: unknown,
	tokens: string[],
	depth: number,
	value: unknown,
	pointer: string
): unknown {
	const token = tokens[depth]!;
	assertSafeKey(token, pointer);
	const last = depth === tokens.length - 1;

	const nextIsIndex = !last && /^(?:\d+|-)$/.test(tokens[depth + 1]!);

	if (/^(?:\d+|-)$/.test(token) && Array.isArray(node)) {
		const arr = node.slice();
		const i = token === '-' ? arr.length : Number(token);
		arr[i] = last ? value : write(arr[i], tokens, depth + 1, value, pointer);
		return arr;
	}

	if (/^(?:\d+|-)$/.test(token) && node === undefined) {
		const arr: unknown[] = [];
		const i = token === '-' ? 0 : Number(token);
		arr[i] = last ? value : write(undefined, tokens, depth + 1, value, pointer);
		return arr;
	}

	const obj: Record<string, unknown> =
		isIndexable(node) && !Array.isArray(node) ? { ...(node as Record<string, unknown>) } : {};

	obj[token] = last
		? value
		: write(obj[token] ?? (nextIsIndex ? undefined : {}), tokens, depth + 1, value, pointer);

	return obj;
}

/** Immutably remove the value at `pointer`. Missing paths are a no-op. */
export function deletePointer<T>(root: T, pointer: string): T {
	const tokens = parsePointer(pointer);
	if (tokens.length === 0) return undefined as T;
	return remove(root, tokens, 0) as T;
}

function remove(node: unknown, tokens: string[], depth: number): unknown {
	if (!isIndexable(node)) return node;
	const token = tokens[depth]!;
	const last = depth === tokens.length - 1;

	if (Array.isArray(node)) {
		const i = Number(token);
		if (!Number.isInteger(i) || i < 0 || i >= node.length) return node;
		const arr = node.slice();
		if (last) arr.splice(i, 1);
		else {
			const next = remove(arr[i], tokens, depth + 1);
			if (next === arr[i]) return node;
			arr[i] = next;
		}
		return arr;
	}

	const rec = node as Record<string, unknown>;
	if (!Object.prototype.hasOwnProperty.call(rec, token)) return node;
	const copy = { ...rec };
	if (last) delete copy[token];
	else {
		const next = remove(copy[token], tokens, depth + 1);
		if (next === copy[token]) return node;
		copy[token] = next;
	}
	return copy;
}
