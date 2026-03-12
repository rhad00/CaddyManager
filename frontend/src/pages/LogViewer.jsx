import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const STATUS_COLORS = {
  2: 'bg-green-100 text-green-800',
  3: 'bg-blue-100 text-blue-800',
  4: 'bg-yellow-100 text-yellow-800',
  5: 'bg-red-100 text-red-800',
};

function statusColor(status) {
  const bucket = Math.floor(status / 100);
  return STATUS_COLORS[bucket] || 'bg-gray-100 text-gray-700';
}

function formatDuration(d) {
  if (!d) return '-';
  if (d < 0.001) return `${(d * 1_000_000).toFixed(0)}µs`;
  if (d < 1) return `${(d * 1000).toFixed(1)}ms`;
  return `${d.toFixed(2)}s`;
}

export default function LogViewer() {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [liveTail, setLiveTail] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    method: '',
    host: '',
    ip: '',
    search: '',
    from: '',
    to: '',
    limit: '200',
  });
  const eventSourceRef = useRef(null);
  const tableRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const res = await fetch(`${API_URL}/logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setLogs(data.logs);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  }, [token, filters]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/logs/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, []);

  // Start / stop live tail SSE
  useEffect(() => {
    if (!liveTail) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const url = `${API_URL}/logs/stream?token=${encodeURIComponent(token)}`;
    // SSE requires passing auth via query param since browsers can't set headers on EventSource
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (evt) => {
      try {
        const entry = JSON.parse(evt.data);
        setLogs((prev) => [entry, ...prev].slice(0, 1000)); // Keep newest 1000 in live mode
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      // Reconnect is automatic with EventSource
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [liveTail, token]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchLogs();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Access Log Viewer</h2>
          {stats && (
            <p className="text-xs text-gray-500 mt-0.5">
              Log file: {stats.path} &nbsp;|&nbsp;
              {stats.exists ? `${(stats.size / 1024).toFixed(1)} KB` : 'File not found — Caddy may not have written logs yet'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { fetchLogs(); fetchStats(); }}
            disabled={loading}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 text-indigo-600"
              checked={liveTail}
              onChange={(e) => setLiveTail(e.target.checked)}
            />
            Live Tail
          </label>
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="bg-white border rounded-lg p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <input
          type="text"
          placeholder="Search URI / host / IP"
          value={filters.search}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          className="col-span-2 sm:col-span-3 lg:col-span-2 border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500"
        />
        <select
          value={filters.method}
          onChange={(e) => handleFilterChange('method', e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">All Methods</option>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Status (e.g. 200)"
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500"
        />
        <input
          type="text"
          placeholder="Host"
          value={filters.host}
          onChange={(e) => handleFilterChange('host', e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500"
        />
        <div className="flex gap-2">
          <select
            value={filters.limit}
            onChange={(e) => handleFilterChange('limit', e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="50">50</option>
            <option value="200">200</option>
            <option value="500">500</option>
            <option value="2000">2000</option>
          </select>
          <button
            type="submit"
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 whitespace-nowrap"
          >
            Apply
          </button>
        </div>
      </form>

      {/* Log Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        {liveTail && (
          <div className="px-4 py-2 bg-green-50 border-b text-xs text-green-800 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live tail active — showing newest entries in real time
          </div>
        )}
        <div className="overflow-x-auto" ref={tableRef}>
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-gray-600 font-medium">Time</th>
                <th className="px-3 py-2 text-left text-gray-600 font-medium">Status</th>
                <th className="px-3 py-2 text-left text-gray-600 font-medium">Method</th>
                <th className="px-3 py-2 text-left text-gray-600 font-medium">Host</th>
                <th className="px-3 py-2 text-left text-gray-600 font-medium w-64">URI</th>
                <th className="px-3 py-2 text-left text-gray-600 font-medium">Remote IP</th>
                <th className="px-3 py-2 text-left text-gray-600 font-medium">Duration</th>
                <th className="px-3 py-2 text-left text-gray-600 font-medium">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    {loading ? 'Loading logs…' : 'No log entries found. Caddy writes access logs after the first request is proxied.'}
                  </td>
                </tr>
              )}
              {logs.map((entry, idx) => (
                <tr key={idx} className="hover:bg-gray-50 font-mono">
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '-'}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {entry.status ? (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${statusColor(entry.status)}`}>
                        {entry.status}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-1.5 font-semibold text-gray-700 whitespace-nowrap">{entry.method || '-'}</td>
                  <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{entry.host || '-'}</td>
                  <td className="px-3 py-1.5 text-gray-800 max-w-xs truncate" title={entry.uri}>{entry.uri || '-'}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{entry.remote_ip || '-'}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{formatDuration(entry.duration)}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                    {entry.size != null ? `${entry.size}B` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-500">
            Showing {logs.length} entries
          </div>
        )}
      </div>
    </div>
  );
}
