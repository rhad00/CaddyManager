import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { get, post, put, apiError, describeError } from '../utils/api';
import {
  valuesFromProxy,
  validateValues,
  buildPayload,
  groupOfField,
  lockValues,
  unlockValues,
} from './proxy/proxyFormModel';
import { TextInput, SelectInput, Toggle } from './proxy/fields';
import OptionGroup from './proxy/OptionGroup';
import TemplatePicker from './proxy/TemplatePicker';
import TrafficOptions from './proxy/TrafficOptions';
import RoutingOptions from './proxy/RoutingOptions';
import RoutePreview from './proxy/RoutePreview';
import TlsStatusPanel from './proxy/TlsStatusPanel';

const reportDns = (results) => {
  for (const r of results || []) {
    if (r.status === 'created') toast.success(`DNS: ${r.message}`);
    else if (r.status === 'conflict' || r.status === 'failed' || r.status === 'no_zone') {
      toast.error(`DNS ${r.domain}: ${r.message}`, { duration: 8000 });
    }
  }
};

const SectionTitle = ({ id, children }) => (
  <h3 id={id} className="text-base font-semibold text-gray-900">
    {children}
  </h3>
);

function FormAlert({ alertRef, error, summary, onJump }) {
  if (!error && summary.length === 0) return null;
  return (
    <div
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className="scroll-mt-20 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900"
    >
      {error && <p>{error}</p>}
      {summary.length > 0 && (
        <>
          <p className="font-medium">
            {summary.length === 1 ? 'One field needs attention before saving:' : `${summary.length} fields need attention before saving:`}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {summary.map(({ id, message }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="underline"
                  onClick={(e) => {
                    e.preventDefault();
                    onJump(id);
                  }}
                >
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const ProxyForm = ({ proxy = null, onSave, onCancel }) => {
  const { token, csrfToken, currentUser } = useAuth();
  const isEdit = Boolean(proxy);
  const hadBasicAuth = Boolean(proxy?.basic_auth?.enabled);

  const [values, setValues] = useState(() => valuesFromProxy(proxy));
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateDetails, setTemplateDetails] = useState(null);
  const [constraints, setConstraints] = useState([]);
  const [templateError, setTemplateError] = useState(null);
  const [features, setFeatures] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [summary, setSummary] = useState([]);
  const [open, setOpen] = useState({ traffic: false, routing: false });
  const [focusRequest, setFocusRequest] = useState(null);

  const alertRef = useRef(null);
  const valuesRef = useRef(values);
  const restoreRef = useRef({});
  const templateRequest = useRef(0);
  valuesRef.current = values;

  const set = useCallback(
    (patch) => setValues((v) => ({ ...v, ...(typeof patch === 'function' ? patch(v) : patch) })),
    [],
  );

  const rows = useMemo(
    () => ({
      update: (key, index, patch) => set((v) => ({ [key]: v[key].map((row, i) => (i === index ? { ...row, ...patch } : row)) })),
      add: (key, row) => set((v) => ({ [key]: [...v[key], row] })),
      remove: (key, index) => set((v) => ({ [key]: v[key].filter((_, i) => i !== index) })),
    }),
    [set],
  );

  // Errors are derived from the values once a save was tried, so a fixed field stops complaining at once
  const errors = useMemo(
    () => (attempted ? validateValues(values, { hadBasicAuth }).errors : {}),
    [attempted, values, hadBasicAuth],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await get('/templates', token);
        if (!response.ok) throw await apiError(response, 'load templates');
        const data = await response.json();
        if (!cancelled) setTemplates(data.templates || []);
      } catch (err) {
        console.error('Error fetching templates:', err);
        if (!cancelled) setTemplateError(describeError(err, 'load templates'));
      }
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/features`);
        if (res.ok && !cancelled) setFeatures((await res.json()).features || {});
      } catch (err) {
        console.error('Failed to fetch features:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Move focus to the first problem, or to the failure banner, once the DOM shows it
  useEffect(() => {
    if (!focusRequest) return;
    const el = document.getElementById(focusRequest.id);
    if (el) {
      el.focus();
      el.scrollIntoView?.({ block: 'center' });
    }
  }, [focusRequest]);

  useEffect(() => {
    if (submitError && alertRef.current) {
      alertRef.current.focus();
      alertRef.current.scrollIntoView?.({ block: 'nearest' });
    }
  }, [submitError]);

  const jumpTo = useCallback((id) => {
    const group = groupOfField(id);
    if (group) setOpen((o) => ({ ...o, [group]: true }));
    setFocusRequest((r) => ({ id, n: (r?.n || 0) + 1 }));
  }, []);

  const lockReason = (option) => constraints.find((c) => c.option === option)?.reason;

  // A template can forbid options: switch them off while it is chosen, give them back when it is not
  const applyLocks = (template) => {
    const list = template?.constraints || [];
    const base = unlockValues(valuesRef.current, restoreRef.current);
    const { values: next, restore } = lockValues(base, list);
    restoreRef.current = restore;
    setValues(next);
    setConstraints(list);
    setTemplateDetails(template || null);
    if (list.length > 0) setOpen((o) => ({ ...o, traffic: true }));
  };

  const handleTemplateChange = async (templateId) => {
    const request = ++templateRequest.current;
    setSelectedTemplate(templateId);
    setTemplateError(null);
    if (!templateId) {
      applyLocks(null);
      return;
    }
    try {
      const response = await get(`/templates/${templateId}`, token);
      if (!response.ok) throw await apiError(response, 'load the template');
      const data = await response.json();
      if (request === templateRequest.current) applyLocks(data.template);
    } catch (err) {
      console.error('Error fetching template details:', err);
      if (request === templateRequest.current) {
        applyLocks(null);
        setTemplateError(describeError(err, 'load the template'));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    const { messages } = validateValues(values, { hadBasicAuth });
    setAttempted(true);
    setSummary(messages);
    if (messages.length > 0) {
      jumpTo(messages[0].id);
      return;
    }

    setLoading(true);
    try {
      const payload = buildPayload(values, currentUser.id);
      const response = isEdit
        ? await put(`/proxies/${proxy.id}`, payload, token, csrfToken)
        : await post('/proxies', payload, token, csrfToken);
      if (!response.ok) throw await apiError(response, 'save the proxy');

      const data = await response.json();
      reportDns(data.dns);

      if (selectedTemplate) {
        const proxyId = data.proxy?.id ?? data.id;
        const applied = await post(`/templates/${selectedTemplate}/apply/${proxyId}`, {}, token, csrfToken);
        if (!applied.ok) {
          // The proxy exists; only the template is missing, and the person has to know
          const reason = await apiError(applied, 'apply the template');
          toast.error(`The proxy was saved, but ${reason.message.replace(/^Couldn't/, "couldn't")}`, { duration: 8000 });
        }
      }

      toast.success(isEdit ? 'Proxy updated' : 'Proxy created');
      onSave(data.proxy);
    } catch (err) {
      console.error('Error saving proxy:', err);
      // The message stays in the form, next to the fields it is about; a toast would vanish
      setSubmitError(describeError(err, 'save the proxy'));
      setSummary([]);
    } finally {
      setLoading(false);
    }
  };

  const trafficOn = [values.compressionEnabled, values.securityHeadersEnabled, values.rateLimitEnabled, values.ipFilteringEnabled, values.basicAuthEnabled].filter(Boolean).length;
  const routingOn = [values.pathRoutingEnabled, values.lbEnabled, values.healthCheckEnabled].filter(Boolean).length;
  const templateName = templates.find((t) => t.id === selectedTemplate)?.name;

  return (
    <div className="rounded-lg bg-white shadow-sm">
      <div className="px-4 py-5 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit proxy' : 'New proxy'}</h2>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <form noValidate onSubmit={handleSubmit} className="min-w-0 space-y-8">
            <FormAlert alertRef={alertRef} error={submitError} summary={summary} onJump={jumpTo} />

            <TemplatePicker
              templates={templates}
              value={selectedTemplate}
              details={templateDetails}
              constraints={constraints}
              error={templateError}
              onChange={handleTemplateChange}
            />

            <section aria-labelledby="route-title" className="space-y-5 border-t border-gray-200 pt-6">
              <SectionTitle id="route-title">Route</SectionTitle>
              <TextInput
                id="name"
                label="Name"
                placeholder="Grafana"
                aria-required="true"
                value={values.name}
                error={errors.name}
                onChange={(e) => set({ name: e.target.value })}
              />
              <TextInput
                id="domains"
                label="Domains"
                hint="Separate several with commas. Wildcards like *.example.com work."
                placeholder="example.com, www.example.com"
                mono
                aria-required="true"
                value={values.domains}
                error={errors.domains}
                onChange={(e) => set({ domains: e.target.value })}
              />
              <TextInput
                id="upstream_url"
                label="Upstream"
                hint="Where the traffic goes: a host and port, or a full URL."
                placeholder="http://app:8080"
                mono
                aria-required="true"
                value={values.upstreamUrl}
                error={errors.upstream_url}
                onChange={(e) => set({ upstreamUrl: e.target.value })}
              />
            </section>

            <section aria-labelledby="tls-title" className="space-y-5 border-t border-gray-200 pt-6">
              <SectionTitle id="tls-title">TLS</SectionTitle>
              <SelectInput
                id="ssl_type"
                label="TLS certificate"
                hint={
                  values.sslType === 'cloudflare'
                    ? 'Caddy proves domain ownership through Cloudflare DNS. The zone is detected from the domain, and a missing A record is added when you save.'
                    : undefined
                }
                value={values.sslType}
                onChange={(e) => set({ sslType: e.target.value })}
              >
                <option value="acme">Let's Encrypt (ACME)</option>
                <option value="cloudflare">
                  Let's Encrypt via Cloudflare DNS{!features.cloudflare ? ' (needs CF_API_TOKEN)' : ''}
                </option>
                <option value="custom">Custom certificate</option>
                <option value="none">None (plain HTTP)</option>
              </SelectInput>
              {values.sslType === 'cloudflare' && !features.cloudflare && (
                <p className="text-sm font-medium text-amber-900">
                  The backend has no CF_API_TOKEN. Set it for the Caddy service, or the certificate cannot be issued.
                </p>
              )}
              <Toggle
                id="skip_tls_verify"
                label="Skip upstream certificate verification"
                description="Trust a self-signed or internal certificate on an HTTPS upstream."
                checked={values.skipTlsVerify}
                onChange={(v) => set({ skipTlsVerify: v })}
              />
            </section>

            <section aria-labelledby="more-title" className="border-t border-gray-200 pt-6">
              <SectionTitle id="more-title">More options</SectionTitle>
              <div className="mt-2">
                <OptionGroup
                  title="Traffic and access"
                  summary="Compression, security headers, rate limit, IP filtering, basic authentication"
                  open={open.traffic}
                  onToggle={(o) => setOpen((s) => ({ ...s, traffic: o }))}
                  enabledCount={trafficOn}
                >
                  <TrafficOptions values={values} set={set} errors={errors} lockReason={lockReason} hadBasicAuth={hadBasicAuth} />
                </OptionGroup>
                <OptionGroup
                  title="Routing and health"
                  summary="Path routing, load balancing, health checks"
                  open={open.routing}
                  onToggle={(o) => setOpen((s) => ({ ...s, routing: o }))}
                  enabledCount={routingOn}
                >
                  <RoutingOptions values={values} set={set} errors={errors} rows={rows} />
                </OptionGroup>
              </div>
            </section>

            {isEdit && (proxy.ssl_type === 'acme' || proxy.ssl_type === 'cloudflare') && (
              <TlsStatusPanel proxy={proxy} token={token} csrfToken={csrfToken} />
            )}

            <div className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-gray-200 bg-white py-3">
              <button
                type="button"
                onClick={onCancel}
                className="min-h-11 rounded-md border border-edge bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="min-h-11 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create proxy'}
              </button>
            </div>
          </form>

          <RoutePreview values={values} templateName={templateName} isEdit={isEdit} />
        </div>
      </div>
    </div>
  );
};

export default ProxyForm;
