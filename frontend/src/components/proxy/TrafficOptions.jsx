import React from 'react';
import { TextInput, SelectInput, TextareaInput, Toggle } from './fields';

const SECURITY_HEADERS = [
  'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: SAMEORIGIN',
  "Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
];

/** Compression, security headers, rate limit, IP filtering and basic auth */
export default function TrafficOptions({ values, set, errors, lockReason, hadBasicAuth }) {
  return (
    <>
      <Toggle
        id="compression_enabled"
        label="Enable compression"
        description="Compress responses with gzip or zstd."
        lockedReason={lockReason('compression_enabled')}
        checked={values.compressionEnabled}
        onChange={(v) => set({ compressionEnabled: v })}
      />

      <Toggle
        id="security_headers_enabled"
        label="Enable security headers"
        description="Add the recommended response headers."
        checked={values.securityHeadersEnabled}
        onChange={(v) => set({ securityHeadersEnabled: v })}
      >
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm text-indigo-700">Show the headers</summary>
          <ul className="space-y-1 pb-2">
            {SECURITY_HEADERS.map((h) => (
              <li key={h} className="break-all font-mono text-xs text-gray-700">{h}</li>
            ))}
          </ul>
        </details>
      </Toggle>

      <Toggle
        id="rate_limit_enabled"
        label="Enable rate limiting"
        description="Cap how many requests each client can send."
        checked={values.rateLimitEnabled}
        onChange={(v) => set({ rateLimitEnabled: v })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            id="rate_limit_rps"
            label="Requests per second"
            type="number"
            min="1"
            mono
            value={values.requestsPerSecond}
            error={errors.rate_limit_rps}
            onChange={(e) => set({ requestsPerSecond: e.target.value })}
          />
          <TextInput
            id="rate_limit_burst"
            label="Burst"
            hint="Extra requests allowed at once."
            type="number"
            min="1"
            mono
            value={values.rateLimitBurst}
            error={errors.rate_limit_burst}
            onChange={(e) => set({ rateLimitBurst: e.target.value })}
          />
        </div>
      </Toggle>

      <Toggle
        id="ip_filtering_enabled"
        label="Enable IP filtering"
        description="Allow or block clients by address."
        checked={values.ipFilteringEnabled}
        onChange={(v) => set({ ipFilteringEnabled: v })}
      >
        <SelectInput
          id="ip_filtering_mode"
          label="Mode"
          value={values.ipFilteringMode}
          onChange={(e) => set({ ipFilteringMode: e.target.value })}
        >
          <option value="block">Block these addresses</option>
          <option value="allow">Only allow these addresses</option>
        </SelectInput>
        <TextareaInput
          id="ip_list"
          label="IP addresses or CIDR ranges"
          hint="One per line."
          rows={4}
          mono
          placeholder={'192.168.1.1\n10.0.0.0/24'}
          value={values.ipList}
          error={errors.ip_list}
          onChange={(e) => set({ ipList: e.target.value })}
        />
      </Toggle>

      <Toggle
        id="basic_auth_enabled"
        label="Enable basic authentication"
        description="Ask for a username and password before anything else."
        lockedReason={lockReason('basic_auth')}
        checked={values.basicAuthEnabled}
        onChange={(v) => set({ basicAuthEnabled: v })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            id="basic_auth_username"
            label="Username"
            mono
            autoComplete="off"
            value={values.basicAuthUsername}
            error={errors.basic_auth_username}
            onChange={(e) => set({ basicAuthUsername: e.target.value })}
          />
          <TextInput
            id="basic_auth_password"
            label="Password"
            type="password"
            autoComplete="new-password"
            hint={hadBasicAuth ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}
            value={values.basicAuthPassword}
            error={errors.basic_auth_password}
            onChange={(e) => set({ basicAuthPassword: e.target.value })}
          />
        </div>
      </Toggle>
    </>
  );
}
