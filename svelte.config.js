import adapterAuto from '@sveltejs/adapter-auto';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// STATIC_DEMO builds the demo for GitHub Pages: fully prerendered, no server.
// `strict: false` lets the /api/agent route (dev-only, unreachable statically)
// drop out of the build instead of failing it.
const isStatic = process.env.STATIC_DEMO === '1';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: isStatic ? adapterStatic({ strict: false }) : adapterAuto(),
		paths: isStatic ? { base: process.env.BASE_PATH ?? '' } : undefined
	}
};

export default config;
