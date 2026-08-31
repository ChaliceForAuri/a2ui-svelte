/**
 * Dynamic value resolution: `{path}` bindings, `{call}` function refs, and the
 * `${...}` mini-expression grammar used inside `formatString` / `openUrl`.
 *
 * Nothing here evaluates agent-supplied *code*. The only callable names are the
 * ones already present in the function registry; an unknown name resolves to
 * `undefined` and is logged.
 */

import { getPointer } from './pointer.js';
import { absolutePath } from './scope.js';
import {
	BUILTIN_FUNCTIONS,
	setInterpolationEvaluator,
	type EvalContext,
	type FunctionRegistry
} from './functions.js';
import { isFunctionRef, isPathRef, type FunctionRef } from './types.js';

/**
 * Guards against a function registry that recurses into itself. The counter
 * lives on the context rather than being a parameter, because a custom function
 * can re-enter `resolveDynamic` with the context it was handed — a parameter
 * would reset to zero on every hop and never trip.
 */
const MAX_DEPTH = 32;

function deeper(ctx: EvalContext): EvalContext {
	return { ...ctx, depth: (ctx.depth ?? 0) + 1 };
}

export function createFunctionRegistry(extra?: FunctionRegistry): FunctionRegistry {
	return { ...BUILTIN_FUNCTIONS, ...extra };
}

/**
 * Resolve a wire value to a plain JS value.
 *
 * - `{ path }`      -> read from the data model (scope-aware)
 * - `{ call, args }`-> invoke a registered function with resolved arguments
 * - arrays/objects  -> resolved member-wise, so nested bindings work anywhere
 * - anything else   -> returned as-is
 */
export function resolveDynamic(value: unknown, ctx: EvalContext): unknown {
	if ((ctx.depth ?? 0) > MAX_DEPTH) {
		console.warn('[a2ui] dynamic resolution exceeded max depth');
		return undefined;
	}

	if (isPathRef(value)) {
		return getPointer(ctx.data, absolutePath(value.path, ctx.scope));
	}

	if (isFunctionRef(value)) {
		return callFunction(value, ctx);
	}

	if (Array.isArray(value)) {
		const next = deeper(ctx);
		return value.map((v) => resolveDynamic(v, next));
	}

	if (typeof value === 'object' && value !== null) {
		const out: Record<string, unknown> = {};
		const next = deeper(ctx);
		for (const [k, v] of Object.entries(value)) {
			out[k] = resolveDynamic(v, next);
		}
		return out;
	}

	return value;
}

/**
 * A stable identity for one agent-side call: same function, same catalog, same
 * RESOLVED arguments. Keys are canonical (object keys sorted) so two calls that
 * differ only in property order dedupe onto one round trip rather than two.
 */
export function agentCallKey(ref: FunctionRef): string {
	const canonical = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(canonical);
		if (value && typeof value === 'object') {
			const out: Record<string, unknown> = {};
			for (const k of Object.keys(value as Record<string, unknown>).sort()) {
				out[k] = canonical((value as Record<string, unknown>)[k]);
			}
			return out;
		}
		return value;
	};
	return JSON.stringify(
		canonical({ call: ref.call, catalogId: ref.catalogId, args: ref.args ?? {} })
	);
}

export function callFunction(ref: FunctionRef, ctx: EvalContext): unknown {
	if ((ctx.depth ?? 0) > MAX_DEPTH) {
		console.warn(`[a2ui] call depth exceeded resolving ${ref.call}`);
		return undefined;
	}

	const impl = ctx.functions[ref.call];
	if (!impl) {
		/*
		 * Spec fallback routing: a name this renderer does not implement is an
		 * AGENT function, not an error. Resolve its args here — the agent wants
		 * values, not `{path}` refs — then answer from cache if the agent has
		 * already replied, otherwise ask.
		 */
		const inner = { ...deeper(ctx), remote: false };
		const args = (resolveDynamic(ref.args ?? {}, inner) ?? {}) as Record<string, unknown>;
		const resolvedRef: FunctionRef = { call: ref.call, catalogId: ref.catalogId, args };
		const key = agentCallKey(resolvedRef);

		if (ctx.agentValues && key in ctx.agentValues) return ctx.agentValues[key];

		if (ctx.onUnresolvedFunction) {
			ctx.onUnresolvedFunction(resolvedRef, key);
		} else {
			// No route to an agent (a pure evaluation, or a host that opted out).
			console.warn(`[a2ui] unknown function: ${ref.call}`);
		}
		return undefined;
	}
	if (ctx.remote && (impl.callableFrom ?? 'rendererOnly') === 'rendererOnly') {
		throw new RendererOnlyFunctionError(ref.call);
	}

	// Nested calls are renderer-local even when the outer call came from the agent.
	const inner = { ...deeper(ctx), remote: false };
	const args = (resolveDynamic(ref.args ?? {}, inner) ?? {}) as Record<string, unknown>;

	return impl.run(args, inner);
}

export class RendererOnlyFunctionError extends Error {
	readonly call: string;

	constructor(call: string) {
		super(`Function is rendererOnly and cannot be called remotely.`);
		this.name = 'RendererOnlyFunctionError';
		this.call = call;
	}
}

/* -------------------------------------------------------------------------- */
/* `${...}` expression grammar                                                */
/* -------------------------------------------------------------------------- */

const CALL_HEAD = /^(@?[A-Za-z_][A-Za-z0-9_]*)\s*\(/;

/**
 * Evaluate the body of a `${...}` hole: either a path, or `fn(a: x, b: y)`.
 */
export function evaluateExpression(expr: string, ctx: EvalContext): unknown {
	if ((ctx.depth ?? 0) > MAX_DEPTH) {
		console.warn('[a2ui] expression depth exceeded');
		return undefined;
	}

	const trimmed = expr.trim();
	if (trimmed === '') return undefined;

	const head = CALL_HEAD.exec(trimmed);
	if (head && trimmed.endsWith(')')) {
		const name = head[1]!;
		const argsSrc = trimmed.slice(head[0].length, -1);
		return callFunction({ call: name, args: parseArgs(argsSrc, ctx) }, ctx);
	}

	return getPointer(ctx.data, absolutePath(trimmed, ctx.scope));
}

function parseArgs(src: string, ctx: EvalContext): Record<string, unknown> {
	const args: Record<string, unknown> = {};
	for (const part of splitTopLevel(src, ',')) {
		if (part.trim() === '') continue;
		const colon = indexOfTopLevel(part, ':');
		if (colon === -1) continue;
		const key = part.slice(0, colon).trim();
		if (key === '') continue;
		args[key] = parseArgValue(part.slice(colon + 1).trim(), ctx);
	}
	return args;
}

function parseArgValue(src: string, ctx: EvalContext): unknown {
	if (src === '') return undefined;

	if (src.startsWith('${') && src.endsWith('}')) {
		return evaluateExpression(src.slice(2, -1), deeper(ctx));
	}
	if ((src.startsWith("'") && src.endsWith("'")) || (src.startsWith('"') && src.endsWith('"'))) {
		return src.slice(1, -1);
	}
	if (src === 'true') return true;
	if (src === 'false') return false;
	if (src === 'null') return null;
	if (/^-?\d+(?:\.\d+)?$/.test(src)) return Number(src);

	// Bare token: treat as a data path, matching how paths appear unquoted.
	return getPointer(ctx.data, absolutePath(src, ctx.scope));
}

/** Split on `sep`, ignoring separators inside quotes or `${}` / `()` nesting. */
function splitTopLevel(src: string, sep: string): string[] {
	const out: string[] = [];
	let start = 0;
	let depth = 0;
	let quote: string | null = null;

	for (let i = 0; i < src.length; i++) {
		const ch = src[i]!;
		if (quote) {
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === '"') quote = ch;
		else if (ch === '{' || ch === '(') depth += 1;
		else if (ch === '}' || ch === ')') depth -= 1;
		else if (ch === sep && depth === 0) {
			out.push(src.slice(start, i));
			start = i + 1;
		}
	}
	out.push(src.slice(start));
	return out;
}

function indexOfTopLevel(src: string, ch: string): number {
	let depth = 0;
	let quote: string | null = null;
	for (let i = 0; i < src.length; i++) {
		const c = src[i]!;
		if (quote) {
			if (c === quote) quote = null;
			continue;
		}
		if (c === "'" || c === '"') quote = c;
		else if (c === '{' || c === '(') depth += 1;
		else if (c === '}' || c === ')') depth -= 1;
		else if (c === ch && depth === 0) return i;
	}
	return -1;
}

// Close the loop with functions.ts without a hard circular dependency.
setInterpolationEvaluator((expr, ctx) => evaluateExpression(expr, ctx));

export type { EvalContext, FunctionRegistry };
