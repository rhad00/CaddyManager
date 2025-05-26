import { z } from 'zod';

export const domainConfigSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Domain name is required')
      .regex(
        /^(?!:\/\/)(?:[a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,11}$/,
        'Invalid domain format',
      )
      .refine(domain => !domain.startsWith('www.'), "Do not include 'www.' prefix"),
    ssl_type: z.enum(['acme', 'custom', 'none'], {
      errorMap: () => ({ message: 'Invalid SSL type' }),
    }),
    custom_cert_path: z
      .string()
      .optional()
      .refine(
        path => !path || path.endsWith('.pem') || path.endsWith('.crt'),
        'Certificate must be a .pem or .crt file',
      ),
    custom_key_path: z
      .string()
      .optional()
      .refine(
        path => !path || path.endsWith('.pem') || path.endsWith('.key'),
        'Private key must be a .pem or .key file',
      ),
  })
  .refine(
    data => {
      if (data.ssl_type === 'custom') {
        return data.custom_cert_path && data.custom_key_path;
      }
      return true;
    },
    {
      message: 'Certificate and private key paths are required for custom SSL',
      path: ['ssl_type'],
    },
  );

export const upstreamConfigSchema = z.object({
  url: z
    .string()
    .url('Invalid upstream URL')
    .regex(/^https?:\/\//, 'URL must start with http:// or https://'),
  headers: z.record(z.string()).optional(),
});

export const proxyConfigSchema = z.object({
  domains: z
    .array(domainConfigSchema)
    .min(1, 'At least one domain is required')
    .refine(domains => {
      const duplicates = domains.reduce((acc: string[], domain, idx) => {
        const duplicateIdx = domains.findIndex(
          (d, i) => i !== idx && d.name.toLowerCase() === domain.name.toLowerCase(),
        );
        if (duplicateIdx !== -1) acc.push(domain.name);
        return acc;
      }, []);
      if (duplicates.length) {
        throw new Error(`Duplicate domains found: ${duplicates.join(', ')}`);
      }
      return true;
    }, 'Duplicate domains are not allowed'),
  upstream: upstreamConfigSchema,
  http_to_https: z.boolean().default(true),
  compression: z.boolean().default(true),
  cache_enabled: z.boolean().default(false),
  cache_duration: z
    .string()
    .optional()
    .refine(
      duration => !duration || /^(\d+[smhdw])+$/.test(duration),
      'Invalid cache duration format (e.g. 1h30m)',
    ),
  custom_headers: z.record(z.string()).optional(),
});

export const createProxySchema = z.object({
  name: z
    .string()
    .min(3, 'Name must be at least 3 characters')
    .max(255, 'Name must be less than 255 characters')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Name can only contain letters, numbers, hyphens, and underscores'),
  config: proxyConfigSchema,
});

export const updateProxySchema = z.object({
  name: z
    .string()
    .min(3, 'Name must be at least 3 characters')
    .max(255, 'Name must be less than 255 characters')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Name can only contain letters, numbers, hyphens, and underscores')
    .optional(),
  config: proxyConfigSchema.optional(),
  isActive: z.boolean().optional(),
});

export type CreateProxyInput = z.infer<typeof createProxySchema>;
export type UpdateProxyInput = z.infer<typeof updateProxySchema>;
export type ProxyConfig = z.infer<typeof proxyConfigSchema>;
export type DomainConfig = z.infer<typeof domainConfigSchema>;
export type UpstreamConfig = z.infer<typeof upstreamConfigSchema>;
