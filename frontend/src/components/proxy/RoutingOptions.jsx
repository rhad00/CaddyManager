import React from 'react';
import { TextInput, SelectInput, Toggle, RowButton } from './fields';

/** Path routing, load balancing and health checks */
export default function RoutingOptions({ values, set, errors, rows }) {
  return (
    <>
      <Toggle
        id="path_routing_enabled"
        label="Enable path-based routing"
        description="Send some paths to a different upstream."
        checked={values.pathRoutingEnabled}
        onChange={(v) => set({ pathRoutingEnabled: v })}
      >
        {values.pathRoutes.map((route, i) => (
          <fieldset key={i} className="border-l-2 border-gray-200 pl-4">
            <legend className="sr-only">Route {i + 1}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                id={`route_${i}_path`}
                label={`Path ${i + 1}`}
                mono
                placeholder="/api/*"
                value={route.path}
                error={errors[`route_${i}_path`]}
                onChange={(e) => rows.update('pathRoutes', i, { path: e.target.value })}
              />
              <TextInput
                id={`route_${i}_upstream`}
                label={`Upstream ${i + 1}`}
                mono
                placeholder="localhost:8080"
                value={route.upstream_url}
                error={errors[`route_${i}_upstream`]}
                onChange={(e) => rows.update('pathRoutes', i, { upstream_url: e.target.value })}
              />
            </div>
            {values.pathRoutes.length > 1 && (
              <RowButton tone="danger" label={`Remove route ${i + 1}`} onClick={() => rows.remove('pathRoutes', i)}>
                Remove route {i + 1}
              </RowButton>
            )}
          </fieldset>
        ))}
        <RowButton onClick={() => rows.add('pathRoutes', { path: '', upstream_url: '' })}>Add a route</RowButton>
      </Toggle>

      <Toggle
        id="lb_enabled"
        label="Enable load balancing"
        description="Spread traffic across several upstreams."
        checked={values.lbEnabled}
        onChange={(v) => set({ lbEnabled: v })}
      >
        <SelectInput id="lb_policy" label="Policy" value={values.lbPolicy} onChange={(e) => set({ lbPolicy: e.target.value })}>
          <option value="round_robin">Round robin (weighted when weights are set)</option>
          <option value="weighted_round_robin">Weighted round robin</option>
          <option value="least_conn">Least connections</option>
          <option value="ip_hash">IP hash</option>
          <option value="random">Random</option>
          <option value="first">First available</option>
        </SelectInput>
        {values.lbUpstreams.map((upstream, i) => (
          <fieldset key={i} className="border-l-2 border-gray-200 pl-4">
            <legend className="sr-only">Upstream {i + 1}</legend>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <TextInput
                id={`lb_upstream_${i}`}
                label={`Upstream ${i + 1}`}
                mono
                placeholder="backend1:8080"
                value={upstream.url}
                error={errors[`lb_upstream_${i}`]}
                onChange={(e) => rows.update('lbUpstreams', i, { url: e.target.value })}
              />
              <TextInput
                id={`lb_weight_${i}`}
                label="Weight"
                optional
                type="number"
                min="1"
                mono
                value={upstream.weight}
                error={errors[`lb_weight_${i}`]}
                onChange={(e) => rows.update('lbUpstreams', i, { weight: e.target.value })}
              />
            </div>
            {values.lbUpstreams.length > 1 && (
              <RowButton tone="danger" label={`Remove upstream ${i + 1}`} onClick={() => rows.remove('lbUpstreams', i)}>
                Remove upstream {i + 1}
              </RowButton>
            )}
          </fieldset>
        ))}
        <RowButton onClick={() => rows.add('lbUpstreams', { url: '', weight: '' })}>Add an upstream</RowButton>
      </Toggle>

      <Toggle
        id="health_check_enabled"
        label="Enable active health checks"
        description="Caddy probes the upstreams and drops unhealthy ones from the pool."
        checked={values.healthCheckEnabled}
        onChange={(v) => set({ healthCheckEnabled: v })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            id="health_path"
            label="Path"
            className="sm:col-span-2"
            mono
            placeholder="/health"
            value={values.healthCheckPath}
            error={errors.health_path}
            onChange={(e) => set({ healthCheckPath: e.target.value })}
          />
          <TextInput
            id="health_interval"
            label="Interval"
            hint="For example 30s or 1m."
            mono
            value={values.healthCheckInterval}
            error={errors.health_interval}
            onChange={(e) => set({ healthCheckInterval: e.target.value })}
          />
          <TextInput
            id="health_timeout"
            label="Timeout"
            hint="For example 5s."
            mono
            value={values.healthCheckTimeout}
            error={errors.health_timeout}
            onChange={(e) => set({ healthCheckTimeout: e.target.value })}
          />
          <TextInput
            id="health_max_fails"
            label="Failures before removal"
            type="number"
            min="1"
            mono
            value={values.healthCheckMaxFails}
            error={errors.health_max_fails}
            onChange={(e) => set({ healthCheckMaxFails: e.target.value })}
          />
        </div>
      </Toggle>
    </>
  );
}
