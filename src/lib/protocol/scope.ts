/**
 * Collection scope.
 *
 * Inside a template instantiation an *absolute* path (leading `/`) resolves
 * against the surface data model root, while a *relative* path resolves against
 * the current item. `index` backs the `@index` system function.
 */
export interface Scope {
	/** Absolute JSON Pointer to the current item, or `''` at the root. */
	base: string;
	/** 0-based iteration index, or `null` outside a template. */
	index: number | null;
}

export const ROOT_SCOPE: Scope = Object.freeze({ base: '', index: null });

/**
 * Enter one item of the collection at `collectionPath`. The collection path may
 * itself be relative, so it is resolved against the parent scope first — that is
 * what makes nested templates work.
 */
export function childScope(parent: Scope, collectionPath: string, index: number): Scope {
	return { base: `${absolutePath(collectionPath, parent)}/${index}`, index };
}

/** Resolve a possibly-relative path to an absolute JSON Pointer. */
export function absolutePath(path: string, scope: Scope): string {
	if (path.startsWith('/')) return path;
	if (path === '') return scope.base;
	return scope.base + '/' + path.split('/').map(encodeRelativeToken).join('/');
}

/**
 * Relative tokens arrive already decoded in practice, but `~` and `/` still need
 * to round-trip through the pointer grammar.
 */
function encodeRelativeToken(token: string): string {
	return token.replace(/~/g, '~0');
}
