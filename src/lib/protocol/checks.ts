/**
 * `checks` evaluation.
 *
 * Validation is entirely renderer-side and never round-trips to the agent — a
 * failing check disables the submitting control locally. That is the whole point
 * of the design: form typing produces no network traffic.
 */

import { checkCondition, type CheckRule } from './types.js';
import { callFunction, type EvalContext } from './resolve.js';

export interface ValidationResult {
	valid: boolean;
	/** Messages for the rules that failed, in declaration order. */
	errors: readonly string[];
}

export const VALID: ValidationResult = Object.freeze({ valid: true, errors: Object.freeze([]) });

export function evaluateChecks(
	checks: CheckRule[] | undefined,
	ctx: EvalContext
): ValidationResult {
	if (!checks || checks.length === 0) return VALID;

	const errors: string[] = [];
	for (const rule of checks) {
		let passed: unknown;
		try {
			passed = callFunction(checkCondition(rule), ctx);
		} catch (err) {
			console.warn('[a2ui] check threw, treating as failed:', err);
			passed = false;
		}
		if (passed !== true) errors.push(rule.message);
	}

	return errors.length === 0 ? VALID : { valid: false, errors };
}
