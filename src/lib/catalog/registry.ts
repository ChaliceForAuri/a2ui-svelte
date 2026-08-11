import { createFunctionRegistry } from '../protocol/resolve.js';
import type { Catalog, CatalogEntry, CatalogRegistry } from './types.js';

export interface CatalogRegistryOptions {
	/** Refuse to resolve a component whose catalogId isn't registered. */
	strict?: boolean;
	/** Host functions, merged last so they can override catalog ones. */
	functions?: import('../protocol/functions.js').FunctionRegistry;
}

export function createCatalogRegistry(
	catalogs: readonly Catalog[],
	options: CatalogRegistryOptions = {}
): CatalogRegistry {
	const byId = new Map<string, Catalog>();
	for (const catalog of catalogs) byId.set(catalog.id, catalog);

	const functions = createFunctionRegistry({
		...catalogs.reduce((acc, c) => Object.assign(acc, c.functions ?? {}), {}),
		...options.functions
	});

	return {
		functions,
		ids: [...byId.keys()],
		has: (catalogId) => byId.has(catalogId),

		resolve(catalogId, component): CatalogEntry | undefined {
			if (catalogId) {
				const entry = byId.get(catalogId)?.components[component];
				if (entry) return entry;
				if (options.strict) return undefined;
			} else if (options.strict) {
				return undefined;
			}

			for (const catalog of byId.values()) {
				const entry = catalog.components[component];
				if (entry) return entry;
			}
			return undefined;
		}
	};
}
