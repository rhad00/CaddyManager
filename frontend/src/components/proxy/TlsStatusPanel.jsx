import React, { useState } from 'react';
import { post, apiError, describeError } from '../../utils/api';

/** Certificate check of an existing proxy, with a button to run it again */
export default function TlsStatusPanel({ proxy, token, csrfToken }) {
  const [status, setStatus] = useState(proxy.tls_status || null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const recheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const response = await post(`/proxies/${proxy.id}/recheck-tls`, {}, token, csrfToken);
      if (!response.ok) throw await apiError(response, 'recheck TLS');
      const data = await response.json();
      setStatus(data.tlsStatus || null);
    } catch (err) {
      console.error('TLS recheck failed:', err);
      setError(describeError(err, 'recheck TLS'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <section aria-labelledby="tls-status-title" className="border-t border-gray-200 pt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 id="tls-status-title" className="text-sm font-medium text-gray-900">Certificate status</h3>
        <button
          type="button"
          onClick={recheck}
          disabled={checking}
          className="inline-flex min-h-11 items-center rounded-md border border-edge bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
        >
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>

      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-800">{error}</p>}

      {!status ? (
        <p className="mt-2 text-sm text-gray-600">No certificate check has run yet. Select Check again to run one.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-gray-700">{status.ok ? 'All certificates are valid.' : 'Some certificates have problems.'}</p>
          <ul className="space-y-2">
            {(status.results || []).map((r) => (
              <li key={r.domain} className="flex items-start justify-between gap-3 rounded-md border border-gray-200 p-3">
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm text-gray-900">{r.domain}</p>
                  <p className="text-sm text-gray-600">
                    {r.ok ? `Valid from ${r.validFrom} to ${r.validTo}` : r.error}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${r.ok ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}
                >
                  {r.ok ? 'Valid' : 'Problem'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
