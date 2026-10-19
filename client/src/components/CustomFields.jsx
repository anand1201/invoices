/**
 * Custom fields.
 *
 * Label + value pairs the user invents (PO number, project code, contract ref).
 * Three rules, enforced here and in the shared validator:
 *   1. they are editable and removable like any other row;
 *   2. hiding one keeps it in the database but removes it from the invoice
 *      sheet entirely — so it is not in the preview and cannot be printed;
 *   3. they never participate in arithmetic. Their values are strings as far
 *      as the totals calculator is concerned; a field called "Surcharge" with
 *      value "500" changes nothing.
 */

import { IconPlus, IconTrash, IconEye, IconEyeOff, IconAlert } from './icons.jsx';

export function CustomFields({ fields, errors, onChange, onAdd, onRemove }) {
  const visibleCount = fields.filter((field) => field.visible).length;

  return (
    <section className="card" aria-labelledby="cf-heading">
      <header className="card__head">
        <h2 className="card__title" id="cf-heading">
          Custom fields
        </h2>
        <span className="card__hint">
          {visibleCount} of {fields.length} shown on the invoice
        </span>
      </header>

      <div className="card__body card__body--flush">
        {fields.length === 0 ? (
          <p className="empty">
            No custom fields. Add one for a PO number, project code or contract reference.
          </p>
        ) : (
          fields.map((field, index) => {
            const labelError = errors[`customFields.${field.id}.label`];
            return (
              <div className="cfield" key={field.id} data-hidden={!field.visible}>
                <div className="field">
                  <label className="visually-hidden" htmlFor={`${field.id}-label`}>
                    Label for custom field {index + 1}
                  </label>
                  <input
                    id={`${field.id}-label`}
                    className="input"
                    value={field.label}
                    placeholder="Label (e.g. Purchase order)"
                    onChange={(event) => onChange(field.id, { label: event.target.value })}
                    aria-invalid={labelError ? true : undefined}
                    aria-describedby={labelError ? `${field.id}-error` : undefined}
                  />
                  {labelError ? (
                    <span className="field__error" id={`${field.id}-error`} role="alert">
                      <IconAlert />
                      {labelError}
                    </span>
                  ) : null}
                </div>

                <div className="field cfield__value">
                  <label className="visually-hidden" htmlFor={`${field.id}-value`}>
                    Value for custom field {index + 1}
                  </label>
                  <input
                    id={`${field.id}-value`}
                    className="input"
                    value={field.value}
                    placeholder="Value"
                    onChange={(event) => onChange(field.id, { value: event.target.value })}
                  />
                </div>

                <button
                  type="button"
                  className="cfield__toggle"
                  aria-pressed={field.visible}
                  onClick={() => onChange(field.id, { visible: !field.visible })}
                  // The button's own text changes, so the state is announced
                  // without relying on aria-pressed alone.
                  aria-label={`${field.visible ? 'Hide' : 'Show'} "${
                    field.label || `custom field ${index + 1}`
                  }" on the invoice`}
                >
                  {field.visible ? (
                    <IconEye width="14" height="14" />
                  ) : (
                    <IconEyeOff width="14" height="14" />
                  )}
                  {field.visible ? 'Shown' : 'Hidden'}
                </button>

                <button
                  type="button"
                  className="btn btn--icon btn--danger-ghost cfield__rm"
                  onClick={() => onRemove(field.id)}
                  aria-label={`Remove custom field ${field.label || index + 1}`}
                >
                  <IconTrash className="btn__icon" />
                </button>
              </div>
            );
          })
        )}

        <div className="items__foot">
          <button type="button" className="btn btn--sm" onClick={onAdd}>
            <IconPlus className="btn__icon" />
            Add custom field
          </button>
          <span className="items__foot-note">
            Hidden fields are saved but never shown or printed. Custom fields never affect totals.
          </span>
        </div>
      </div>
    </section>
  );
}
