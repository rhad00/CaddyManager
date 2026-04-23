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

const CONDITION_LABELS = {
  cert_expiry: 'Certificate Expiry',
  upstream_down: 'Upstream Down',
  error_rate: 'High Error Rate',
  no_traffic: 'No Traffic',
};

const CHANNEL_TYPE_ICONS = {
  email: '✉️',
  slack: '💬',
  discord: '🎮',
  webhook: '🔗',
};

// ── Channel Form ──────────────────────────────────────────────────────────────
function ChannelForm({ initial, onSave, onCancel }) {
  const { token, csrfToken } = useAuth();
  const [name, setName] = useState(initial?.name || '');
  const [type, setType] = useState(initial?.type || 'email');
  const [config, setConfig] = useState(initial?.config ? JSON.stringify(initial.config, null, 2) : '{}');
  const [enabled, setEnabled] = useState(initial?.enabled !== false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    let parsedConfig;
    try { parsedConfig = JSON.parse(config); } catch { return toast.error('Config must be valid JSON'); }
    setSaving(true);
    try {
      const url = initial ? `/alerts/channels/${initial.id}` : '/alerts/channels';
      const res = await apiFetch(url, token, {
        method: initial ? 'PUT' : 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: JSON.stringify({ name, type, config: parsedConfig, enabled }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success(initial ? 'Channel updated' : 'Channel created');
      onSave();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const configPlaceholders = {
    email: '{\n  "to": "admin@example.com",\n  "from": "alerts@example.com"\n}',
    slack: '{\n  "webhook_url": "https://hooks.slack.com/services/..."\n}',
    discord: '{\n  "webhook_url": "https://discord.com/api/webhooks/..."\n}',
    webhook: '{\n  "url": "https://example.com/webhook",\n  "method": "POST",\n  "headers": {}\n}',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Type</label>
          <select value={type} onChange={e => { setType(e.target.value); setConfig(configPlaceholders[e.target.value]); }}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500">
            {Object.entries(CHANNEL_TYPE_ICONS).map(([t, icon]) => (
              <option key={t} value={t}>{icon} {t}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Configuration (JSON)</label>
        <textarea value={config} onChange={e => setConfig(e.target.value)} rows={5}
          placeholder={configPlaceholders[type]}
          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-indigo-500 focus:border-indigo-500" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-4 w-4 text-indigo-600" />
        Enabled
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ── Rule Form ─────────────────────────────────────────────────────────────────
function RuleForm({ initial, channels, proxies, onSave, onCancel }) {
  const { token, csrfToken } = useAuth();
  const [name, setName] = useState(initial?.name || '');
  const [conditionType, setConditionType] = useState(initial?.condition_type || 'cert_expiry');
  const [threshold, setThreshold] = useState(initial?.threshold ?? '');
  const [proxyId, setProxyId] = useState(initial?.proxy_id || '');
  const [channelIds, setChannelIds] = useState(initial?.channel_ids || []);
  const [cooldown, setCooldown] = useState(initial?.cooldown_minutes ?? 60);
  const [enabled, setEnabled] = useState(initial?.enabled !== false);
  const [saving, setSaving] = useState(false);

  const thresholdLabel = {
    cert_expiry: 'Warn N days before expiry',
    error_rate: 'Error rate % threshold',
    no_traffic: 'No traffic for N minutes',
    upstream_down: null,
  }[conditionType];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = initial ? `/alerts/rules/${initial.id}` : '/alerts/rules';
      const res = await apiFetch(url, token, {
        method: initial ? 'PUT' : 'POST',
        headers: { 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          name, condition_type: conditionType,
          threshold: threshold !== '' ? parseFloat(threshold) : null,
          proxy_id: proxyId || null, channel_ids: channelIds,
          cooldown_minutes: parseInt(cooldown), enabled,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success(initial ? 'Rule updated' : 'Rule created');
      onSave();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Rule Name</label>
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Condition</label>
          <select value={conditionType} onChange={e => setConditionType(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500">
            {Object.entries(CONDITION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {thresholdLabel && (
          <div>
            <label className="block text-sm font-medium text-gray-700">{thresholdLabel}</label>
            <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} min="1"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700">Proxy (blank = all)</label>
          <select value={proxyId} onChange={e => setProxyId(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500">
            <option value="">All Proxies</option>
            {proxies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Cooldown (minutes)</label>
          <input type="number" value={cooldown} onChange={e => setCooldown(e.target.value)} min="1"
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Notification Channels</label>
        <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded p-2">
          {channels.length === 0 && <p className="text-sm text-gray-400">No channels configured yet.</p>}
          {channels.map(ch => (
            <label key={ch.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={channelIds.includes(ch.id)}
                onChange={e => setChannelIds(e.target.checked ? [...channelIds, ch.id] : channelIds.filter(id => id !== ch.id))}
                className="h-4 w-4 text-indigo-600" />
              {CHANNEL_TYPE_ICONS[ch.type]} {ch.name}
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-4 w-4 text-indigo-600" />
        Enabled
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AlertManagement() {
  const { token, csrfToken } = useAuth();
  const [channels, setChannels] = useState([]);
  const [rules, setRules] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [tab, setTab] = useState('rules');
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [editChannel, setEditChannel] = useState(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const [cr, rr, pr] = await Promise.all([
      apiFetch('/alerts/channels', token).then(r => r.json()),
      apiFetch('/alerts/rules', token).then(r => r.json()),
      apiFetch('/proxies', token).then(r => r.json()),
    ]);
    if (cr.success) setChannels(cr.channels);
    if (rr.success) setRules(rr.rules);
    if (pr.success) setProxies(pr.proxies || []);
  };

  useEffect(() => { load(); }, []);

  const deleteChannel = async (id) => {
    if (!confirm('Delete this channel?')) return;
    const res = await apiFetch(`/alerts/channels/${id}`, token, { method: 'DELETE', headers: { 'x-csrf-token': csrfToken } });
    const d = await res.json();
    if (d.success) { toast.success('Channel deleted'); load(); } else toast.error(d.message);
  };

  const deleteRule = async (id) => {
    if (!confirm('Delete this alert rule?')) return;
    const res = await apiFetch(`/alerts/rules/${id}`, token, { method: 'DELETE', headers: { 'x-csrf-token': csrfToken } });
    const d = await res.json();
    if (d.success) { toast.success('Rule deleted'); load(); } else toast.error(d.message);
  };

  const testChannel = async (id) => {
    const res = await apiFetch(`/alerts/channels/${id}/test`, token, { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
    const d = await res.json();
    if (d.success) toast.success('Test notification sent'); else toast.error(d.message);
  };

  const runNow = async () => {
    setRunning(true);
    const res = await apiFetch('/alerts/run', token, { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
    const d = await res.json();
    setRunning(false);
    if (d.success) toast.success('Alert checks completed'); else toast.error(d.message);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Alerting & Notifications</h2>
        <button onClick={runNow} disabled={running}
          className="px-3 py-1.5 text-sm bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-md hover:bg-yellow-100 disabled:opacity-50">
          {running ? 'Running checks…' : 'Run Checks Now'}
        </button>
      </div>

      {/* Tab selector */}
      <div className="border-b border-gray-200 flex gap-6">
        {['rules', 'channels'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-2 text-sm font-medium capitalize ${tab === t ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'rules' ? 'Alert Rules' : 'Notification Channels'}
          </button>
        ))}
      </div>

      {tab === 'channels' && (
        <div className="space-y-4">
          <button onClick={() => { setShowChannelForm(true); setEditChannel(null); }}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700">
            + Add Channel
          </button>
          {(showChannelForm || editChannel) && (
            <div className="bg-white border rounded-lg p-6">
              <h3 className="text-base font-medium mb-4">{editChannel ? 'Edit Channel' : 'New Notification Channel'}</h3>
              <ChannelForm initial={editChannel} onSave={() => { setShowChannelForm(false); setEditChannel(null); load(); }} onCancel={() => { setShowChannelForm(false); setEditChannel(null); }} />
            </div>
          )}
          <div className="bg-white border rounded-lg divide-y">
            {channels.length === 0 && <p className="p-6 text-sm text-gray-400">No notification channels configured.</p>}
            {channels.map(ch => (
              <div key={ch.id} className="flex items-center justify-between p-4">
                <div>
                  <span className="font-medium text-sm">{CHANNEL_TYPE_ICONS[ch.type]} {ch.name}</span>
                  <span className="ml-2 text-xs text-gray-400 capitalize">{ch.type}</span>
                  {!ch.enabled && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 rounded">disabled</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => testChannel(ch.id)} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Test</button>
                  <button onClick={() => { setEditChannel(ch); setShowChannelForm(false); }} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Edit</button>
                  <button onClick={() => deleteChannel(ch.id)} className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'rules' && (
        <div className="space-y-4">
          <button onClick={() => { setShowRuleForm(true); setEditRule(null); }}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700">
            + Add Alert Rule
          </button>
          {(showRuleForm || editRule) && (
            <div className="bg-white border rounded-lg p-6">
              <h3 className="text-base font-medium mb-4">{editRule ? 'Edit Rule' : 'New Alert Rule'}</h3>
              <RuleForm initial={editRule} channels={channels} proxies={proxies}
                onSave={() => { setShowRuleForm(false); setEditRule(null); load(); }}
                onCancel={() => { setShowRuleForm(false); setEditRule(null); }} />
            </div>
          )}
          <div className="bg-white border rounded-lg divide-y">
            {rules.length === 0 && <p className="p-6 text-sm text-gray-400">No alert rules configured.</p>}
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between p-4">
                <div>
                  <span className="font-medium text-sm">{rule.name}</span>
                  <span className="ml-2 text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                    {CONDITION_LABELS[rule.condition_type]}
                  </span>
                  {rule.threshold != null && (
                    <span className="ml-1 text-xs text-gray-500">threshold: {rule.threshold}</span>
                  )}
                  {!rule.enabled && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 rounded">disabled</span>}
                  {rule.last_triggered_at && (
                    <span className="ml-2 text-xs text-gray-400">
                      Last fired: {new Date(rule.last_triggered_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditRule(rule); setShowRuleForm(false); }} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Edit</button>
                  <button onClick={() => deleteRule(rule.id)} className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
