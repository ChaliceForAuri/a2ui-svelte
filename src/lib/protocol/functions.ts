/**
 * The A2UI built-in function library.
 *
 * Every built-in is `callableFrom: "rendererOnly"` — an agent that tries to
 * invoke one via `callFunction` gets `INVALID_FUNCTION_CALL` back. Host apps
 * register their own remote-callable functions on top.
 */

import type { Scope } from './scope.js';
import type { FunctionRef } from './types.js';

export interface EvalContext {
	/** The surface data model root. */
	data: unknown;
	scope: Scope;
	functions: FunctionRegistry;
	/** Set when evaluating an agent-initiated `callFunction`. */
	remote?: boolean;
	/** Recursion guard, carried on the context so it survives re-entry. */
	depth?: number;
	/**
	 * Values the agent has already returned for functions this renderer does not
	 * implement, keyed by `agentCallKey`. Consulted before routing a call, so a
	 * resolved agent function is indistinguishable from a local one.
	 */
	agentValues?: Readonly<Record<string, unknown>>;
	/**
	 * The spec's fallback routing (a2ui_protocol.md, `callAgentFunction`): a
	 * function not registered locally is assumed to live on the agent and MUST
	 * be dispatched, not dropped. Called with the ref and its RESOLVED args.
	 *
	 * This fires during evaluation, which happens during render — so an
	 * implementation must not synchronously mutate reactive state here. The
	 * client queues and flushes in a microtask for exactly that reason.
	 */
	onUnresolvedFunction?: (ref: FunctionRef, key: string) => void;
}

export interface FunctionImpl {
	/** `rendererOnly` functions reject agent-initiated invocation. */
	callableFrom?: 'rendererOnly' | 'any';
	/**
	 * Arguments arrive already resolved: `{path}` bindings have been read and
	 * nested `{call}` refs have been evaluated. Raw args are never expressions.
	 */
	run(args: Record<string, unknown>, ctx: EvalContext): unknown;
}

export type FunctionRegistry = Record<string, FunctionImpl>;

/* -------------------------------------------------------------------------- */
/* Coercion helpers                                                           */
/* -------------------------------------------------------------------------- */

function toStr(v: unknown): string {
	if (v === null || v === undefined) return '';
	if (typeof v === 'string') return v;
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	return JSON.stringify(v);
}

function toNum(v: unknown): number {
	if (typeof v === 'number') return v;
	if (typeof v === 'string' && v.trim() !== '') return Number(v);
	return NaN;
}

export function isEmpty(v: unknown): boolean {
	if (v === null || v === undefined) return true;
	if (typeof v === 'string') return v.trim() === '';
	if (Array.isArray(v)) return v.length === 0;
	if (typeof v === 'object') return Object.keys(v as object).length === 0;
	return false;
}

function truthy(v: unknown): boolean {
	return v === true || (v !== false && !isEmpty(v));
}

/* -------------------------------------------------------------------------- */
/* Date formatting (Unicode TR35 subset)                                      */
/* -------------------------------------------------------------------------- */

const MONTHS_LONG = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * Supports the patterns the A2UI examples use: `yyyy yy MMMM MMM MM M dd d
 * EEEE EEE E HH H hh h mm ss a`, plus `'literal'` quoting. `YYYY` is treated as
 * `yyyy` (calendar year, not ISO week-year) because that is how it is used in
 * the spec's own fixtures.
 */
export function formatDatePattern(date: Date, pattern: string): string {
	if (Number.isNaN(date.getTime())) return '';
	let out = '';
	let i = 0;

	while (i < pattern.length) {
		const ch = pattern[i]!;

		if (ch === "'") {
			// '' is a literal apostrophe; otherwise quote until the next '
			if (pattern[i + 1] === "'") {
				out += "'";
				i += 2;
				continue;
			}
			const end = pattern.indexOf("'", i + 1);
			out += end === -1 ? pattern.slice(i + 1) : pattern.slice(i + 1, end);
			i = end === -1 ? pattern.length : end + 1;
			continue;
		}

		if (!/[a-zA-Z]/.test(ch)) {
			out += ch;
			i += 1;
			continue;
		}

		let run = 0;
		while (pattern[i + run] === ch) run += 1;
		const token = ch.repeat(run);
		i += run;

		const h12 = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12;

		switch (ch) {
			case 'y':
			case 'Y':
				out += run === 2 ? pad(date.getFullYear() % 100) : pad(date.getFullYear(), run);
				break;
			case 'M':
				out +=
					run >= 4
						? MONTHS_LONG[date.getMonth()]
						: run === 3
							? MONTHS_LONG[date.getMonth()]!.slice(0, 3)
							: pad(date.getMonth() + 1, run);
				break;
			case 'd':
				out += pad(date.getDate(), run);
				break;
			case 'E':
				out += run >= 4 ? DAYS_LONG[date.getDay()] : DAYS_LONG[date.getDay()]!.slice(0, 3);
				break;
			case 'H':
				out += pad(date.getHours(), run);
				break;
			case 'h':
				out += pad(h12, run);
				break;
			case 'm':
				out += pad(date.getMinutes(), run);
				break;
			case 's':
				out += pad(date.getSeconds(), run);
				break;
			case 'a':
				out += date.getHours() < 12 ? 'AM' : 'PM';
				break;
			default:
				out += token;
		}
	}

	return out;
}

/* -------------------------------------------------------------------------- */
/* URL safety                                                                 */
/* -------------------------------------------------------------------------- */

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Spec requires an http/https scheme allowlist before any navigation. */
export function isSafeUrl(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	try {
		const base =
			typeof globalThis.location === 'undefined'
				? 'https://a2ui.invalid'
				: globalThis.location.href;
		return SAFE_PROTOCOLS.has(new URL(value, base).protocol);
	} catch {
		return false;
	}
}

/* -------------------------------------------------------------------------- */
/* Built-ins                                                                  */
/* -------------------------------------------------------------------------- */

const rendererOnly = (run: FunctionImpl['run']): FunctionImpl => ({
	callableFrom: 'rendererOnly',
	run
});

export const BUILTIN_FUNCTIONS: FunctionRegistry = {
	/* --- validation --- */

	required: rendererOnly((args) => !isEmpty(args.value)),

	regex: rendererOnly((args) => {
		const pattern = toStr(args.pattern);
		if (pattern === '') return true;
		try {
			return new RegExp(pattern).test(toStr(args.value));
		} catch {
			return false;
		}
	}),

	length: rendererOnly((args) => {
		const len = toStr(args.value).length;
		if (args.min !== undefined && len < toNum(args.min)) return false;
		if (args.max !== undefined && len > toNum(args.max)) return false;
		return true;
	}),

	numeric: rendererOnly((args) => {
		const n = toNum(args.value);
		if (Number.isNaN(n)) return false;
		if (args.min !== undefined && n < toNum(args.min)) return false;
		if (args.max !== undefined && n > toNum(args.max)) return false;
		return true;
	}),

	// Deliberately pragmatic, not RFC 5322: one @, no whitespace, a dotted host.
	email: rendererOnly((args) => {
		const v = toStr(args.value);
		return /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(v);
	}),

	/* --- formatting --- */

	formatString: rendererOnly((args, ctx) => interpolate(toStr(args.value), ctx)),

	formatNumber: rendererOnly((args) => {
		const n = toNum(args.value);
		if (Number.isNaN(n)) return '';
		const decimals = args.decimals === undefined ? undefined : toNum(args.decimals);
		return new Intl.NumberFormat(undefined, {
			useGrouping: args.grouping === undefined ? true : Boolean(args.grouping),
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals
		}).format(n);
	}),

	formatCurrency: rendererOnly((args) => {
		const n = toNum(args.value);
		if (Number.isNaN(n)) return '';
		const currency = toStr(args.currency) || 'USD';
		try {
			return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
		} catch {
			return `${currency} ${n}`;
		}
	}),

	formatDate: rendererOnly((args) => {
		const raw = args.value;
		const date = raw instanceof Date ? raw : new Date(toStr(raw));
		const pattern = toStr(args.format);
		if (Number.isNaN(date.getTime())) return '';
		return pattern ? formatDatePattern(date, pattern) : date.toISOString();
	}),

	pluralize: rendererOnly((args) => {
		const n = toNum(args.value);
		if (Number.isNaN(n)) return toStr(args.other);
		if (n === 0 && args.zero !== undefined) return toStr(args.zero);
		let category: Intl.LDMLPluralRule = 'other';
		try {
			category = new Intl.PluralRules().select(n);
		} catch {
			category = n === 1 ? 'one' : 'other';
		}
		const picked = (args as Record<string, unknown>)[category];
		return toStr(picked !== undefined ? picked : args.other);
	}),

	/* --- logic --- */

	and: rendererOnly((args) => {
		const values = Array.isArray(args.values) ? args.values : [];
		return values.every(truthy);
	}),

	or: rendererOnly((args) => {
		const values = Array.isArray(args.values) ? args.values : [];
		return values.some(truthy);
	}),

	not: rendererOnly((args) => !truthy(args.value)),

	/* --- side effects --- */

	openUrl: rendererOnly((args, ctx) => {
		const url = interpolate(toStr(args.url), ctx);
		if (!isSafeUrl(url)) {
			console.warn('[a2ui] openUrl blocked disallowed scheme:', url);
			return false;
		}
		if (typeof globalThis.window === 'undefined') return false;
		globalThis.window.open(url, '_blank', 'noopener,noreferrer');
		return true;
	}),

	/* --- system --- */

	'@index': rendererOnly((args, ctx) => {
		if (ctx.scope.index === null) return 0;
		const offset = args.offset === undefined ? 0 : toNum(args.offset);
		return ctx.scope.index + (Number.isNaN(offset) ? 0 : offset);
	})
};

/* -------------------------------------------------------------------------- */
/* String interpolation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Late-bound so `resolve.ts` can supply the evaluator without a circular import
 * at module-init time. Both modules are internal to the package.
 */
let evaluate: ((expr: string, ctx: EvalContext) => unknown) | null = null;

export function setInterpolationEvaluator(fn: (expr: string, ctx: EvalContext) => unknown): void {
	evaluate = fn;
}

/**
 * Expand `${...}` holes. A hole is either a JSON Pointer (`${/user/name}`), a
 * relative path (`${name}`), or a function call (`${formatDate(value:${/d},
 * format:'yyyy')}`). Nested `${}` inside call arguments is supported.
 */
export function interpolate(template: string, ctx: EvalContext): string {
	if (!template.includes('${')) return template;

	let out = '';
	let i = 0;

	while (i < template.length) {
		const start = template.indexOf('${', i);
		if (start === -1) {
			out += template.slice(i);
			break;
		}
		out += template.slice(i, start);

		const end = matchBrace(template, start + 1);
		if (end === -1) {
			// Unbalanced — emit the rest verbatim rather than throwing on agent output.
			out += template.slice(start);
			break;
		}

		const expr = template.slice(start + 2, end).trim();
		out += toStr(evaluate ? evaluate(expr, ctx) : '');
		i = end + 1;
	}

	return out;
}

/** Index of the `}` matching the `{` at `open`, honouring nesting and quotes. */
function matchBrace(s: string, open: number): number {
	let depth = 0;
	let quote: string | null = null;

	for (let i = open; i < s.length; i++) {
		const ch = s[i]!;
		if (quote) {
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === '"') quote = ch;
		else if (ch === '{') depth += 1;
		else if (ch === '}') {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return -1;
}
