/**
 * Money primitives.
 *
 * Rule for the whole codebase: **money never lives in a float**. Every amount
 * is an integer number of cents, every quantity is an integer number of
 * thousandths ("milli-units"), and every tax rate is an integer number of
 * thousandths of a percent. Floats only appear at the edges — when a human
 * types into an input, and when we render a string back out.
 *
 * Why: `0.1 + 0.2 !== 0.3`. Summing float dollars drifts, and an invoice that
 * is one cent off is a broken invoice. Parsing is done on the *digit string*
 * rather than via `parseFloat(x) * 100` so that even inputs like "1.005" round
 * deterministically instead of inheriting binary-float error.
 */

/** Largest amount we accept, in cents ($1,000,000,000.00). Guards overflow. */
export const MAX_CENTS = 100_000_000_000;
/** Largest quantity we accept, in milli-units (1,000,000.000). */
export const MAX_QTY_MILLI = 1_000_000_000;
/** Largest tax rate we accept, in milli-percent (100.000%). */
export const MAX_RATE_MILLI = 100_000;

/**
 * Divide two integers and round half-up to the nearest integer.
 * Both arguments must be non-negative integers (we reject negatives upstream),
 * which keeps "half-up" and "half-away-from-zero" the same thing.
 */
export function roundedDiv(numerator, denominator) {
  return Math.floor(numerator / denominator + 0.5);
}

/**
 * Parse a user-typed decimal into a scaled integer.
 *
 * @param {string|number|null|undefined} input raw value, e.g. " $1,234.56 "
 * @param {number} decimals how many decimal places the scale keeps (2 for
 *   dollars -> cents, 3 for quantities and tax rates)
 * @returns {{ ok: true, value: number } | { ok: false, reason: string }}
 */
function parseScaled(input, decimals) {
  if (input === null || input === undefined) return { ok: false, reason: 'empty' };

  // Tolerate what people actually paste: currency symbols, thousands
  // separators, stray spaces, a trailing percent sign.
  const cleaned = String(input).trim().replace(/[$,\s%]/g, '');
  if (cleaned === '') return { ok: false, reason: 'empty' };

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return { ok: false, reason: 'not-a-number' };

  const [, sign, wholeDigits, fracDigits = ''] = match;
  if (wholeDigits === '' && fracDigits === '') return { ok: false, reason: 'not-a-number' };

  const scale = 10 ** decimals;
  const whole = wholeDigits === '' ? 0 : Number(wholeDigits);
  if (!Number.isSafeInteger(whole) || whole > MAX_CENTS) {
    return { ok: false, reason: 'too-large' };
  }

  // Keep `decimals` digits, then round half-up on the next digit.
  const kept = fracDigits.slice(0, decimals).padEnd(decimals, '0');
  let value = whole * scale + Number(kept);
  const nextDigit = fracDigits.charCodeAt(decimals) - 48;
  if (fracDigits.length > decimals && nextDigit >= 5) value += 1;

  return { ok: true, value: sign === '-' ? -value : value };
}

/** Parse dollars -> integer cents. */
export function parseCents(input) {
  return parseScaled(input, 2);
}

/** Parse a quantity -> integer thousandths (so 2.5 becomes 2500). */
export function parseQuantityMilli(input) {
  return parseScaled(input, 3);
}

/** Parse a percentage -> integer thousandths of a percent (10% becomes 10000). */
export function parseRateMilli(input) {
  return parseScaled(input, 3);
}

/** Render integer cents as "1,234.56" (no currency symbol). */
export function centsToAmountString(cents) {
  const n = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  const negative = n < 0;
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toLocaleString('en-US')}.${frac}`;
}

/** Render integer cents as "$1,234.56" / "-$1,234.56". */
export function formatUSD(cents) {
  const n = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  return `${n < 0 ? '-' : ''}$${centsToAmountString(Math.abs(n))}`;
}

/** Render a scaled integer back to a plain editable string, e.g. 2500 -> "2.5". */
export function scaledToInputString(value, decimals) {
  if (!Number.isFinite(value)) return '';
  const scale = 10 ** decimals;
  const negative = value < 0;
  const abs = Math.abs(Math.trunc(value));
  const whole = Math.floor(abs / scale);
  const frac = String(abs % scale)
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** 2500 -> "2.5" */
export const quantityMilliToInput = (v) => scaledToInputString(v, 3);
/** 10000 -> "10" */
export const rateMilliToInput = (v) => scaledToInputString(v, 3);
/** 5000 -> "50.00" (always two decimals, for price/amount inputs) */
export const centsToInput = (v) =>
  Number.isFinite(v) ? centsToAmountString(v).replace(/,/g, '') : '';
