import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** Shared look of every text-like control: a 3:1 edge, 44px tall, data in mono */
const controlClass = ({ invalid = false, mono = false } = {}) =>
  cx(
    'block w-full min-h-11 rounded-md border bg-white px-3 py-2 text-base md:text-sm text-gray-900',
    'placeholder:text-gray-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-600',
    invalid ? 'border-red-700' : 'border-edge',
    mono && 'font-mono',
  );

/**
 * A labelled field. The label, hint and error are tied to the control by id, so a screen
 * reader announces all three. `children` receives the props to spread on the control.
 */
export function Field({ id, label, hint, error, optional = false, className, children }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">
        {label}
        {optional && <span className="font-normal text-gray-600"> (optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="mt-0.5 text-sm text-gray-600">
          {hint}
        </p>
      )}
      <div className="mt-1.5">
        {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm font-medium text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ id, label, hint, error, optional, mono, className, type = 'text', ...rest }) {
  return (
    <Field id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      {(aria) => <input {...aria} {...rest} type={type} className={controlClass({ invalid: Boolean(error), mono })} />}
    </Field>
  );
}

export function SelectInput({ id, label, hint, error, mono, className, children, ...rest }) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      {(aria) => (
        <select {...aria} {...rest} className={controlClass({ invalid: Boolean(error), mono })}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextareaInput({ id, label, hint, error, mono, className, ...rest }) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      {(aria) => <textarea {...aria} {...rest} className={controlClass({ invalid: Boolean(error), mono })} />}
    </Field>
  );
}

/**
 * One switchable feature: a checkbox, what it does, why it is locked (if it is) and, when on,
 * its settings. The group is a fieldset so assistive tech announces the settings as belonging to it.
 */
export function Toggle({ id, label, description, lockedReason, checked, onChange, children }) {
  const descId = description ? `${id}-desc` : undefined;
  const lockId = lockedReason ? `${id}-lock` : undefined;
  const describedBy = [descId, lockId].filter(Boolean).join(' ') || undefined;
  const locked = Boolean(lockedReason);

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={locked}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-2.5 size-5 shrink-0 accent-indigo-600 disabled:cursor-not-allowed"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block py-2.5 text-sm font-medium leading-5 text-gray-900">
            {label}
          </label>
          {description && (
            <p id={descId} className="-mt-1.5 text-sm text-gray-600">
              {description}
            </p>
          )}
          {locked && (
            <p id={lockId} className="mt-1 text-sm text-amber-900">
              Unavailable with this template: {lockedReason}
            </p>
          )}
        </div>
      </div>
      {checked && !locked && children && <div className="ml-8 mt-3 space-y-4">{children}</div>}
    </fieldset>
  );
}

/** A small secondary button used inside a form (add / remove rows) */
export function RowButton({ onClick, children, label, tone = 'default' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium',
        tone === 'danger' ? 'text-red-800 hover:bg-red-50' : 'text-indigo-700 hover:bg-indigo-50',
      )}
    >
      {children}
    </button>
  );
}
