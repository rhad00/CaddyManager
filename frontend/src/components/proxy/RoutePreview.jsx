import React from 'react';
import { parseDomains } from './proxyFormModel';

const TLS_LABEL = {
  acme: "Let's Encrypt certificate",
  cloudflare: "Let's Encrypt certificate via Cloudflare DNS",
  custom: 'Your own certificate',
  none: 'No HTTPS: plain HTTP',
};

function Node({ title, children }) {
  return (
    <li className="relative pl-6">
      <span aria-hidden="true" className="absolute -left-[7px] top-1 size-3 rounded-full border-2 border-indigo-600 bg-white" />
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <div className="mt-0.5 break-words text-sm text-gray-700">{children}</div>
    </li>
  );
}

const Placeholder = ({ children }) => <span className="font-mono text-gray-600">{children}</span>;

/** What saving will do, written from the values on screen */
export function whatSavingDoes(values, { templateName, hadProxy }) {
  const items = [];
  if (values.sslType === 'cloudflare') {
    items.push('Adds a Cloudflare A record for each domain that has none: orange cloud on for public addresses, off for private ones.');
  }
  if (templateName) items.push(`Applies the ${templateName} template.`);
  if (values.compressionEnabled) items.push('Compresses responses.');
  if (values.securityHeadersEnabled) items.push('Adds security headers.');
  if (values.rateLimitEnabled) items.push(`Limits each client to ${values.requestsPerSecond} requests per second.`);
  if (values.ipFilteringEnabled) items.push(values.ipFilteringMode === 'allow' ? 'Only allows the listed IP addresses.' : 'Blocks the listed IP addresses.');
  if (values.basicAuthEnabled) items.push('Asks for a username and password.');
  if (values.healthCheckEnabled) items.push(`Checks ${values.healthCheckPath || '/health'} every ${values.healthCheckInterval}.`);
  items.push(hadProxy ? 'Reloads this route in Caddy.' : 'Creates the route in Caddy.');
  return items;
}

export default function RoutePreview({ values, templateName, isEdit }) {
  const domains = parseDomains(values.domains);
  const upstreams = values.lbEnabled ? values.lbUpstreams.filter((u) => u.url.trim()) : [];
  const extraRoutes = values.pathRoutingEnabled ? values.pathRoutes.filter((r) => r.path.trim() && r.upstream_url.trim()).length : 0;
  const scheme = values.sslType === 'none' ? 'http' : 'https';
  const items = whatSavingDoes(values, { templateName, hadProxy: isEdit });

  return (
    <aside aria-label="Route preview" className="rounded-lg border border-gray-200 bg-white p-5 lg:sticky lg:top-6 lg:self-start">
      <h3 className="text-sm font-medium text-gray-900">Route preview</h3>

      <ol className="ml-1.5 mt-4 space-y-5 border-l-2 border-indigo-600">
        <Node title="Visitors open">
          {domains.length === 0 ? (
            <Placeholder>{scheme}://your-domain.com</Placeholder>
          ) : (
            <ul className="space-y-0.5">
              {domains.slice(0, 3).map((d) => (
                <li key={d} className="font-mono">{scheme}://{d}</li>
              ))}
              {domains.length > 3 && <li className="text-gray-600">and {domains.length - 3} more</li>}
            </ul>
          )}
        </Node>
        <Node title="Caddy answers">{TLS_LABEL[values.sslType] || TLS_LABEL.acme}</Node>
        <Node title="and forwards to">
          {values.lbEnabled && upstreams.length > 0 ? (
            <span>
              {upstreams.length} upstreams, {values.lbPolicy.replace(/_/g, ' ')}:{' '}
              <span className="font-mono">{upstreams.map((u) => u.url.trim()).join(', ')}</span>
            </span>
          ) : values.upstreamUrl.trim() ? (
            <span className="font-mono">{values.upstreamUrl.trim()}</span>
          ) : (
            <Placeholder>app:3000</Placeholder>
          )}
          {extraRoutes > 0 && <span className="block text-gray-600">plus {extraRoutes} path {extraRoutes === 1 ? 'route' : 'routes'}</span>}
        </Node>
      </ol>

      <h4 className="mt-6 text-sm font-medium text-gray-900">When you save</h4>
      <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
        {items.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </aside>
  );
}
