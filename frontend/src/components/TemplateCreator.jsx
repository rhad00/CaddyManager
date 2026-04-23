import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const EMPTY_HEADER = () => ({ type: 'request', name: '', value: '' });

const HEADER_PRESETS = [
  { label: 'X-Forwarded-For', name: 'X-Forwarded-For', value: '{http.request.remote.host}', type: 'request' },
  { label: 'X-Forwarded-Proto', name: 'X-Forwarded-Proto', value: '{http.request.scheme}', type: 'request' },
  { label: 'X-Forwarded-Host', name: 'X-Forwarded-Host', value: '{http.request.host}', type: 'request' },
  { label: 'X-Original-URI', name: 'X-Original-URI', value: '{http.request.uri}', type: 'request' },
  { label: 'X-Real-IP', name: 'X-Real-IP', value: '{http.request.remote}', type: 'request' },
  { label: 'HSTS (response)', name: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains', type: 'response' },
  { label: 'X-Frame-Options', name: 'X-Frame-Options', value: 'SAMEORIGIN', type: 'response' },
  { label: 'X-Content-Type-Options', name: 'X-Content-Type-Options', value: 'nosniff', type: 'response' },
];

export default function TemplateCreator({ initial, onSave, onCancel }) {
  const { token, csrfToken } = useAuth();

  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [headers, setHeaders] = useState(
    initial?.headers?.length > 0
      ? initial.headers.map(h => ({ type: h.type || 'request', name: h.name, value: h.value }))
      : [EMPTY_HEADER()]
  );
  const [middlewareConfig, setMiddlewareConfig] = useState(
    initial?.middleware_config ? JSON.stringify(initial.middleware_config, null, 2) : '{}'
  );
  const [saving, setSaving] = useState(false);

  const updateHeader = (idx, field, value) => {
    setHeaders(prev => prev.map((h, i) => i === idx ? { ...h, [field]: value } : h));
  };
  const addHeader = () => setHeaders(prev => [...prev, EMPTY_HEADER()]);
  const removeHeader = (idx) => setHeaders(prev => prev.filter((_, i) => i !== idx));
  const addPreset = (preset) => setHeaders(prev => [...prev, { ...preset }]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Template name is required');

    let parsedMiddleware;
    try { parsedMiddleware = JSON.parse(middlewareConfig); } catch { return toast.error('Middleware config must be valid JSON'); }

    const validHeaders = headers.filter(h => h.name.trim() && h.value.trim());

    setSaving(true);
    try {
      const url = initial ? `${API_URL}/templates/${initial.id}` : `${API_URL}/templates`;
      const res = await fetch(url, {
        method: initial ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          headers: validHeaders,
          middleware_config: parsedMiddleware,
        }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message);
      toast.success(initial ? 'Template updated' : 'Template created');
      onSave(d.template);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name & Description */}
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Template Name <span className="text-red-500">*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} required
            placeholder="e.g. My Auth Service"
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            placeholder="What this template is for…"
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
      </div>

      {/* Header builder */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">HTTP Headers</label>
          <div className="flex gap-2">
            <div className="relative group">
              <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50">+ Preset ▾</button>
              <div className="absolute right-0 mt-1 w-64 bg-white border rounded-md shadow-lg z-10 hidden group-hover:block">
                {HEADER_PRESETS.map((p, i) => (
                  <button key={i} type="button" onClick={() => addPreset(p)}
                    className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50">
                    <span className={`mr-1 text-xs ${p.type === 'request' ? 'text-blue-500' : 'text-green-500'}`}>[{p.type}]</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={addHeader} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100">+ Add Header</button>
          </div>
        </div>

        <div className="space-y-2">
          {headers.map((h, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <select value={h.type} onChange={e => updateHeader(idx, 'type', e.target.value)}
                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-xs">
                <option value="request">request</option>
                <option value="response">response</option>
              </select>
              <input value={h.name} onChange={e => updateHeader(idx, 'name', e.target.value)}
                placeholder="Header-Name"
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs font-mono" />
              <input value={h.value} onChange={e => updateHeader(idx, 'value', e.target.value)}
                placeholder="value or {placeholder}"
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs font-mono" />
              <button type="button" onClick={() => removeHeader(idx)}
                className="text-gray-400 hover:text-red-500 px-1 text-lg leading-none">&times;</button>
            </div>
          ))}
          {headers.length === 0 && (
            <p className="text-xs text-gray-400 italic">No headers — click "Add Header" to begin.</p>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Caddy placeholders: <code className="bg-gray-100 px-1 rounded">{'{http.request.host}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{http.request.uri}'}</code>, etc.
        </p>
      </div>

      {/* Middleware JSON */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Middleware Config (JSON)</label>
        <p className="text-xs text-gray-400 mt-0.5">Advanced: rate limiting, IP filtering, or basic auth config as JSON object.</p>
        <textarea value={middlewareConfig} onChange={e => setMiddlewareConfig(e.target.value)} rows={4}
          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-indigo-500 focus:border-indigo-500" />
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end border-t pt-4">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
        )}
        <button type="submit" disabled={saving}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : (initial ? 'Update Template' : 'Create Template')}
        </button>
      </div>
    </form>
  );
}
