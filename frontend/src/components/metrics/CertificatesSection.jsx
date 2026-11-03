import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, apiError, describeError } from '../../utils/api';
import { ageText } from '../../utils/metricsModel';
import { describeCertificate, needAttention, oldestCheck, dateText } from '../../utils/certificateModel';

const BAR = { ok: 'bg-indigo-600', warn: 'bg-amber-600', urgent: 'bg-red-600', none: 'bg-gray-300' };
const TEXT = { ok: 'text-gray-900', warn: 'text-amber-800', urgent: 'text-red-800', none: 'text-gray-700' };

/** When each proxy domain's certificate ends, from the stored TLS checks */
export default function CertificatesSection({ token }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await get('/metrics/certificates', token);
        if (!response.ok) throw await apiError(response, 'load the certificates');
        const data = await response.json();
        if (!cancelled) setRows(Array.isArray(data.certificates) ? data.certificates : []);
      } catch (err) {
        console.error('Error fetching certificates:', err);
        if (!cancelled) setError(describeError(err, 'load the certificates'));
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const attention = rows ? needAttention(rows) : 0;
  const checked = rows ? oldestCheck(rows) : null;

  return (
    <section aria-labelledby="certificates-title" className="space-y-4">
      <div>
        <h2 id="certificates-title" className="text-xl font-semibold text-gray-900">Certificates</h2>
        <p className="mt-1 text-sm text-gray-600">
          When each domain&apos;s TLS certificate ends. The bar shows the days left out of 90.
          {rows && rows.length > 0 && (
            <>
              {' '}
              {attention === 0
                ? 'None needs attention.'
                : `${attention} ${attention === 1 ? 'needs' : 'need'} attention.`}
            </>
          )}
        </p>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</p>}

      {rows && rows.length === 0 && (
        <p className="rounded-md border border-gray-300 bg-white p-4 text-sm text-gray-800">
          No proxy has a domain yet, so there are no certificates to show.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <ul className="divide-y divide-gray-200">
            {rows.map((row) => {
              const d = describeCertificate(row);
              return (
                <li key={`${row.proxyId}-${row.domain}`} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-gray-900" title={row.domain}>{row.domain}</p>
                    <p className="truncate text-sm text-gray-600">
                      <Link to={`/metrics?proxy=${encodeURIComponent(row.proxyId)}`} className="underline">{row.proxyName}</Link>
                      {row.issuer ? ` · ${row.issuer}` : ''}
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100" aria-hidden="true">
                    <div className={`h-2 rounded-full ${BAR[d.tone]}`} style={{ width: `${Math.round(d.fraction * 100)}%` }} />
                  </div>
                  <p className={`text-sm ${TEXT[d.tone]}`}>
                    <span className="font-medium">{d.text}</span>
                    {row.validTo && row.state !== 'failed' && (
                      <span className="block text-gray-600">Ends {dateText(row.validTo)}</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 border-t border-gray-200 pt-3 text-sm text-gray-600">
            {checked
              ? `Last checked ${ageText(checked)}. A proxy is checked when it is saved or rechecked, so recent changes may not show yet.`
              : 'Some domains have not been checked yet. A proxy is checked when it is saved or rechecked.'}
          </p>
        </div>
      )}
    </section>
  );
}
