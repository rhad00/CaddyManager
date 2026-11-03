import React from 'react';
import { SelectInput } from './fields';

const OPTION_NAME = { compression_enabled: 'compression', basic_auth: 'basic authentication' };

/** Chooses a template and says what it adds and which options it turns off */
export default function TemplatePicker({ templates, value, details, constraints, error, onChange }) {
  const locked = constraints.map((c) => OPTION_NAME[c.option] || c.option);
  const headers = details?.headers || [];
  const middleware = details?.middleware || [];

  return (
    <div className="space-y-3">
      <SelectInput
        id="template"
        label="Apply template"
        hint="Start from a ready-made setup for a known service. It is applied right after the proxy is saved."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
      >
        <option value="">No template</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </SelectInput>

      {details && (
        <div className="text-sm text-gray-700">
          {details.description && <p>{details.description}</p>}
          {locked.length > 0 && (
            <p className="mt-1 font-medium text-amber-900">Turns off {locked.join(' and ')} for this proxy.</p>
          )}
          {(headers.length > 0 || middleware.length > 0) && (
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-2 text-indigo-700">
                What it adds ({headers.length} headers, {middleware.length} middleware)
              </summary>
              <ul className="space-y-1 pb-2">
                {headers.map((h, i) => (
                  <li key={`h${i}`} className="font-mono text-xs break-all">
                    {h.header_name}: {h.header_value} <span className="font-sans text-gray-600">({h.header_type})</span>
                  </li>
                ))}
                {middleware.map((m, i) => (
                  <li key={`m${i}`} className="text-xs break-all">
                    <span className="font-medium">{m.middleware_type}</span>{' '}
                    <span className="font-mono">{JSON.stringify(m.configuration)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
