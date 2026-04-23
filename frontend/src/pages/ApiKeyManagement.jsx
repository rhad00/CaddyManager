import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function apiFetch(path, token, opts = {}) {
  return fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
}

const PERMISSION_LABELS = { read: 'Read', write: 'Write', admin: 'Admin' };

export default function ApiKeyManagement() {
  const { token, csrfToken, currentUser } = useAuth();
  const [keys, setKeys] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState(null); // revealed raw key after creation

  // form state
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState(['read']);
  const [expiresAt, setExpiresAt] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const res = await apiFetch('/keys', token);
    const d = await res.json();
    if (d.success) setKeys(d.keys);
  };

  useEffect(() => { load(); }, []);

  const togglePerm = (p) => {
    setPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (permissions.length === 0) return toast.error('Select at least one permission');
    setCreating(true);
    try {
      const res = await apiFetch('/keys', token, {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: JSON.stringify({ name, permissions, expires_at: expiresAt || undefined }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message);
      setNewKey(d.raw_key);
      setShowForm(false);
      setName(''); setPermissions(['read']); setExpiresAt('');
      toast.success('API key created — copy it now, it won\'t be shown again!');
      load();
    } catch (err) { toast.error(err.message); } finally { setCreating(false); }
  };

  const revoke = async (id, keyName) => {
    if (!confirm(`Revoke key "${keyName}"? This cannot be undone.`)) return;
    const res = await apiFetch(`/keys/${id}`, token, { method: 'DELETE', headers: { 'x-csrf-token': csrfToken } });
    const d = await res.json();
    if (d.success) { toast.success('Key revoked'); load(); } else toast.error(d.message);
  };

  const toggleEnabled = async (id, enabled) => {
    const res = await apiFetch(`/keys/${id}`, token, {
      method: 'PUT',
      headers: { 'x-csrf-token': csrfToken },
      body: JSON.stringify({ enabled: !enabled }),
    });
    const d = await res.json();
    if (d.success) load(); else toast.error(d.message);
  };

  const availablePerms = currentUser?.role === 'admin' ? ['read', 'write', 'admin'] : ['read', 'write'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">API Keys</h2>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700">
          + New API Key
        </button>
      </div>

      {newKey && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-green-800">New API key created — copy it now. It will not be shown again.</p>
          <code className="block text-sm font-mono bg-white border rounded px-3 py-2 select-all break-all">{newKey}</code>
          <button onClick={() => { navigator.clipboard.writeText(newKey); toast.success('Copied!'); }}
            className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">Copy</button>
          <button onClick={() => setNewKey(null)} className="ml-2 text-xs text-green-700 hover:underline">Dismiss</button>
        </div>
      )}

      {showForm && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-base font-medium mb-4">Create API Key</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name / Description</label>
              <input value={name} onChange={e => setName(e.target.value)} required
                placeholder="e.g. CI/CD Pipeline, Monitoring Script"
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Permissions</label>
              <div className="flex gap-3">
                {availablePerms.map(p => (
                  <label key={p} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={permissions.includes(p)} onChange={() => togglePerm(p)} className="h-4 w-4 text-indigo-600" />
                    {PERMISSION_LABELS[p]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Read: GET requests only. Write: create/update. Admin: full access including user management.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Expiry Date (optional)</label>
              <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="mt-1 w-48 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={creating} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
                {creating ? 'Creating…' : 'Create Key'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border rounded-lg divide-y">
        {keys.length === 0 && <p className="p-6 text-sm text-gray-400">No API keys yet.</p>}
        {keys.map(k => (
          <div key={k.id} className="flex items-center justify-between p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{k.name}</span>
                {!k.enabled && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded">disabled</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <code className="text-xs text-gray-500">{k.key_prefix}…</code>
                <div className="flex gap-1">
                  {(k.permissions || []).map(p => (
                    <span key={p} className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded capitalize">{p}</span>
                  ))}
                </div>
                {k.expires_at && (
                  <span className={`text-xs ${new Date(k.expires_at) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                    expires {new Date(k.expires_at).toLocaleDateString()}
                  </span>
                )}
                {k.last_used_at && (
                  <span className="text-xs text-gray-400">last used {new Date(k.last_used_at).toLocaleString()}</span>
                )}
                {k.owner && <span className="text-xs text-gray-400">by {k.owner.email}</span>}
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              <button onClick={() => toggleEnabled(k.id, k.enabled)}
                className="text-xs px-2 py-1 border rounded hover:bg-gray-50">
                {k.enabled ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => revoke(k.id, k.name)}
                className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50">Revoke</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
