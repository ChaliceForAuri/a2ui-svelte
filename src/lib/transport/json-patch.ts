/**
 * RFC 6902 JSON Patch, applied immutably.
 *
 * Needed for AG-UI, whose `STATE_DELTA` and `ACTIVITY_DELTA` events carry patch
 * arrays. A2UI itself has no component-level patch format — `updateComponents`
 * is an id-keyed upsert — so this is transport-side only.
 */

import { deletePointer, getPointer, setPointer } from '../protocol/pointer.js';

export interface PatchOp {
	op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
	path: string;
	from?: string;
	value?: unknown;
}

export class JsonPatchError extends Error {
	readonly op: PatchOp;

	constructor(message: string, op: PatchOp) {
		super(message);
		this.name = 'JsonPatchError';
		this.op = op;
	}
}

/**
 * `add` on an array index inserts; `add` on an object key sets. `setPointer`
 * already overwrites, so array insertion is handled explicitly here.
 */
function addOp<T>(doc: T, path: string, value: unknown): T {
	const lastSlash = path.lastIndexOf('/');
	if (lastSlash <= 0) return setPointer(doc, path, value);

	const parentPath = path.slice(0, lastSlash);
	const token = path.slice(lastSlash + 1);
	const parent = getPointer(doc, parentPath);

	if (Array.isArray(parent)) {
		const next = parent.slice();
		const index = token === '-' ? next.length : Number(token);
		next.splice(index, 0, value);
		return setPointer(doc, parentPath, next);
	}

	return setPointer(doc, path, value);
}

export function applyPatch<T>(doc: T, ops: readonly PatchOp[]): T {
	let next = doc;

	for (const op of ops) {
		switch (op.op) {
			case 'add':
				next = addOp(next, op.path, op.value);
				break;
			case 'replace':
				next = setPointer(next, op.path, op.value);
				break;
			case 'remove':
				next = deletePointer(next, op.path);
				break;
			case 'move': {
				if (op.from === undefined) throw new JsonPatchError('move requires "from"', op);
				const moved = getPointer(next, op.from);
				next = addOp(deletePointer(next, op.from), op.path, moved);
				break;
			}
			case 'copy': {
				if (op.from === undefined) throw new JsonPatchError('copy requires "from"', op);
				next = addOp(next, op.path, structuredCloneSafe(getPointer(next, op.from)));
				break;
			}
			case 'test': {
				const actual = getPointer(next, op.path);
				if (JSON.stringify(actual) !== JSON.stringify(op.value)) {
					throw new JsonPatchError(`test failed at ${op.path}`, op);
				}
				break;
			}
			default:
				throw new JsonPatchError(`unsupported op: ${String(op.op)}`, op);
		}
	}

	return next;
}

function structuredCloneSafe<T>(value: T): T {
	if (value === null || typeof value !== 'object') return value;
	return JSON.parse(JSON.stringify(value)) as T;
}
