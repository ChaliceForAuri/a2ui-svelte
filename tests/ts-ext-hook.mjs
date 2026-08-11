/**
 * Test-only resolver hook.
 *
 * `svelte-package` requires relative imports to be fully specified with a `.js`
 * extension even when the source file is `.ts`. Node's type-stripping loader
 * doesn't do that remapping, so for `node --test` we map `./x.js` -> `./x.ts`
 * when only the TypeScript source exists. Bundlers and svelte-package need no
 * such help; this file is never shipped.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
	if (specifier.startsWith('.') && specifier.endsWith('.js')) {
		try {
			const resolved = await nextResolve(specifier, context);
			if (existsSync(fileURLToPath(resolved.url))) return resolved;
		} catch {
			// fall through to the .ts candidate
		}
		return nextResolve(specifier.slice(0, -3) + '.ts', context);
	}
	return nextResolve(specifier, context);
}
