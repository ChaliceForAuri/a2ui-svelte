import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';

/**
 * Browser tests only. The protocol suite stays on `node --test` (no build step,
 * see CLAUDE.md); this config exists for the Svelte component layer, which needs
 * a real compiler and a real DOM.
 */
export default defineConfig({
	plugins: [svelte()],
	test: {
		include: ['tests/browser/**/*.test.ts'],
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
			screenshotFailures: false
		}
	}
});
