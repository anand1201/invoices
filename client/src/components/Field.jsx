/**
 * Form primitives.
 *
 * Accessibility contract that every input in the app inherits from here:
 *   - a real <label for> (never a placeholder standing in for a label)
 *   - aria-invalid when the field is in error
 *   - aria-describedby pointing at the hint and/or the error text, so a screen
 *     reader announces *why* a field is wrong, not just that it is
 *   - role="alert" on the error so it is announced when it appears
 */

import { IconAlert } from './icons.jsx';

export function Field({ id, label, error, hint, required, optional, children, className }) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="field__req" aria-hidden="true">
            *
          </span>
        ) : null}
        {optional ? <span className="field__optional">optional</span> : null}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field__error" id={errorId} role="alert">
          <IconAlert />
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Single-line text/date/email input wired to the Field contract. */
export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  optional,
  type = 'text',
  ...rest
}) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required} optional={optional}>
      {({ describedBy, invalid }) => (
        <input
          id={id}
          className="input"
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          {...rest}
        />
      )}
    </Field>
  );
}

export function TextAreaField({ id, label, value, onChange, error, hint, rows = 3, ...rest }) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      {({ describedBy, invalid }) => (
        <textarea
          id={id}
          className="textarea"
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </Field>
  );
}

/**
 * Numeric input with a currency or percent affix.
 *
 * `type="number"` with `min="0"` gives us the native mobile keypad and the
 * browser's own "no negatives" affordance, but the browser is not the guard —
 * the shared validator is, and it runs on every keystroke and again on the
 * server. `onKeyDown` additionally swallows the "-" key so a negative cannot
 * even be typed into a quantity, price, discount or rate.
 */
export function NumberInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  prefix,
  suffix,
  step = '0.01',
  max,
  ariaLabel,
  ...rest
}) {
  const field = (
    <input
      id={id}
      className="input input--num"
      type="number"
      inputMode="decimal"
      min="0"
      step={step}
      max={max}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === '-' || event.key === 'e' || event.key === 'E') event.preventDefault();
      }}
      onFocus={(event) => event.target.select()}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      aria-label={ariaLabel}
      {...rest}
    />
  );

  if (!prefix && !suffix) return field;

  return (
    <div className="input-affix" data-invalid={invalid ? 'true' : 'false'}>
      {prefix ? (
        <span className="input-affix__sign" aria-hidden="true">
          {prefix}
        </span>
      ) : null}
      {field}
      {suffix ? (
        <span className="input-affix__sign input-affix__sign--trail" aria-hidden="true">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

/** NumberInput inside a labelled Field. */
export function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  prefix,
  suffix,
  step,
  max,
  required,
}) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      {({ describedBy, invalid }) => (
        <NumberInput
          id={id}
          value={value}
          onChange={onChange}
          invalid={invalid}
          describedBy={describedBy}
          prefix={prefix}
          suffix={suffix}
          step={step}
          max={max}
        />
      )}
    </Field>
  );
}
