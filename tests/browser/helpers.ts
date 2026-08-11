import { A2uiClient } from '../../src/lib/client.svelte.js';
import { createCatalogRegistry } from '../../src/lib/catalog/registry.js';
import { basicCatalog } from '../../src/lib/catalog/basic/index.js';
import type { AgentToRenderer, ComponentSpec } from '../../src/lib/protocol/types.js';

export const SURFACE = 'test';

export const catalog = createCatalogRegistry([basicCatalog]);

/** A client with no transport: tests feed it messages directly via `ingest`. */
export function makeClient(): A2uiClient {
	return new A2uiClient();
}

export function createSurface(
	client: A2uiClient,
	components: ComponentSpec[],
	dataModel: Record<string, unknown> = {}
): void {
	client.ingest({
		version: 'v1.0',
		createSurface: { surfaceId: SURFACE, components, dataModel }
	});
}

export function updateComponents(client: A2uiClient, components: ComponentSpec[]): void {
	client.ingest({ version: 'v1.0', updateComponents: { surfaceId: SURFACE, components } });
}

export function updateDataModel(client: A2uiClient, path: string, value: unknown): void {
	client.ingest({ version: 'v1.0', updateDataModel: { surfaceId: SURFACE, path, value } });
}

export function ingest(client: A2uiClient, message: AgentToRenderer): void {
	client.ingest(message);
}
