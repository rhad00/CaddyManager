import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import { Form, FormField, FormInput, FormSwitch, FormSubmit } from '../../components/ui/Form';
import DomainFields from '../../components/ui/DomainFields';
import { CreateProxyInput, createProxySchema } from '../../validations/proxySchema';
import { useCreateProxy, useUpdateProxy, Proxy } from '../../services/proxyService';

interface ProxyFormProps {
  proxy?: Proxy;
}

interface HeaderFormData {
  name: string;
  value: string;
}

type HeadersFormData = Record<string, HeaderFormData>;

interface FormData extends Omit<CreateProxyInput, 'config'> {
  config: Omit<CreateProxyInput['config'], 'upstream' | 'custom_headers'> & {
    upstream: {
      url: string;
      headers: HeadersFormData;
    };
    custom_headers: HeadersFormData;
  };
}

export default function ProxyForm({ proxy }: ProxyFormProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createProxy = useCreateProxy();
  const updateProxy = useUpdateProxy(proxy?.id ?? '');

  // Transform API data to form format
  const transformApiData = (data: Proxy | undefined): FormData | undefined => {
    if (!data) return undefined;

    // Transform headers from {name: value} to {key: {name, value}}
    const transformHeaders = (headers: Record<string, string> = {}) => {
      return Object.entries(headers).reduce((acc, [name, value], index) => {
        acc[`header${index}`] = { name, value };
        return acc;
      }, {} as HeadersFormData);
    };

    return {
      name: data.name,
      config: {
        ...data.config,
        upstream: {
          ...data.config.upstream,
          headers: transformHeaders(data.config.upstream.headers),
        },
        custom_headers: transformHeaders(data.config.custom_headers),
      },
    };
  };

  const form = useForm<FormData>({
    resolver: zodResolver(createProxySchema),
    defaultValues: transformApiData(proxy) ?? {
      name: '',
      config: {
        domains: [{ name: '', ssl_type: 'acme' }],
        upstream: { url: '', headers: {} },
        http_to_https: true,
        compression: true,
        cache_enabled: false,
        custom_headers: {},
      },
    },
  });

  // Transform form data to API format
  const transformFormData = (data: FormData): CreateProxyInput => {
    // Transform headers from {key: {name, value}} to {name: value}
    const transformHeaders = (headers: HeadersFormData) => {
      const transformed: Record<string, string> = {};
      Object.values(headers).forEach(({name, value}) => {
        if (name) transformed[name] = value;
      });
      return transformed;
    };

    return {
      name: data.name,
      config: {
        ...data.config,
        upstream: {
          ...data.config.upstream,
          headers: transformHeaders(data.config.upstream.headers),
        },
        custom_headers: transformHeaders(data.config.custom_headers),
      },
    };
  };

  const onSubmit = async (formData: FormData) => {
    const data = transformFormData(formData);
    try {
      if (proxy) {
        await updateProxy.mutateAsync(data);
      } else {
        await createProxy.mutateAsync(data);
      }
      toast(
        proxy
          ? `Successfully updated proxy "${data.name}"`
          : `Successfully created proxy "${data.name}"`,
        'success',
      );
      navigate('/proxies');
    } catch (error) {
      toast(
        `Failed to ${proxy ? 'update' : 'create'} proxy: ${
          error instanceof Error ? error.message : 'Unknown error occurred'
        }`,
        'error',
      );
    }
  };

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">{proxy ? 'Edit Proxy' : 'Create New Proxy'}</h1>

      <div className="bg-card rounded-lg p-6 shadow">
        <FormProvider {...form}>
          <Form form={form} onSubmit={onSubmit}>
            <FormField 
              name="name" 
              label="Proxy Name"
              helperText="A unique identifier for your proxy. Use lowercase letters, numbers, hyphens, and underscores."
            >
              <FormInput type="text" name="name" placeholder="my-awesome-proxy" />
            </FormField>

            <div className="space-y-6">
              <FormField 
                name="config.upstream.url" 
                label="Upstream URL"
                helperText="The target URL where requests will be forwarded. Must start with http:// or https://"
              >
                <FormInput
                  type="text"
                  name="config.upstream.url"
                  placeholder="http://localhost:3000"
                />
              </FormField>

              <FormField
                name="service_template"
                label="Service Template"
                helperText="Select a predefined template to automatically configure appropriate headers for your service"
              >
                <select
                  className="w-full p-2 border rounded"
                  onChange={(e) => {
                    const template = e.target.value;
                    if (template === 'custom') {
                      return;
                    }
                    
                    const headers: HeadersFormData = {};
                    // Common web app / auth platform headers
                    const addGenericHeaders = () => {
                      headers['header1'] = { name: 'X-Forwarded-For', value: '{http.request.remote.host}' };
                      headers['header2'] = { name: 'X-Forwarded-Proto', value: '{http.request.scheme}' };
                      headers['header3'] = { name: 'X-Forwarded-Host', value: '{http.request.host}' };
                      headers['header4'] = { name: 'X-Real-IP', value: '{http.request.remote.host}' };
                    };

                    // Templates
                    switch (template) {
                      // Generic Web App / Auth Platforms
                      // Web Apps & Auth Platforms
                      case 'generic_webapp':
                        addGenericHeaders();
                        break;

                      case 'nextcloud':
                        addGenericHeaders();
                        headers['header5'] = { name: 'X-Forwarded-Server', value: '{http.request.host}' };
                        break;

                      case 'gitea':
                      case 'gitlab':
                        addGenericHeaders();
                        headers['header5'] = { name: 'X-Forwarded-Method', value: '{http.request.method}' };
                        headers['header6'] = { name: 'X-Forwarded-Uri', value: '{http.request.uri}' };
                        break;

                      case 'hashicorp_vault':
                        addGenericHeaders();
                        // Ensure headers are preserved for Vault's request signing
                        headers['header5'] = { name: 'X-Vault-Request', value: 'true' };
                        break;

                      case 'matrix_synapse':
                        addGenericHeaders();
                        headers['header5'] = { name: 'X-Forwarded-Method', value: '{http.request.method}' };
                        headers['header6'] = { name: 'X-Forwarded-Uri', value: '{http.request.uri}' };
                        headers['header7'] = { name: 'X-Forwarded-Port', value: '{http.request.port}' };
                        break;

                      case 'jupyter':
                        addGenericHeaders();
                        // Jupyter needs original host for WebSocket connections
                        headers['header5'] = { name: 'X-Forwarded-Port', value: '{http.request.port}' };
                        break;

                      case 'portainer':
                        addGenericHeaders();
                        // Portainer needs these for container management
                        headers['header5'] = { name: 'X-Forwarded-Uri', value: '{http.request.uri}' };
                        break;

                      case 'grafana':
                        addGenericHeaders();
                        headers['header5'] = { name: 'X-Grafana-User', value: '' }; // For auth proxy setup
                        break;

                      case 'home_assistant':
                        addGenericHeaders();
                        // Home Assistant needs original URL for webhook functionality
                        headers['header5'] = { name: 'X-Script-Name', value: '' };
                        headers['header6'] = { name: 'X-Ingress-Path', value: '' };
                        break;

                      case 'cloudflare':
                        headers['header1'] = { name: 'CF-Connecting-IP', value: '{http.request.remote.host}' };
                        headers['header2'] = { name: 'X-Forwarded-For', value: '{http.request.remote.host}' };
                        headers['header3'] = { name: 'X-Forwarded-Proto', value: '{http.request.scheme}' };
                        headers['header4'] = { name: 'Host', value: '{http.request.host}' };
                        headers['header5'] = { name: 'CF-IPCountry', value: '' }; // Cloudflare will populate
                        headers['header6'] = { name: 'CF-Ray', value: '' }; // Cloudflare will populate
                        headers['header7'] = { name: 'CF-Visitor', value: '' }; // Cloudflare will populate
                        break;

                      case 'oauth2_proxy':
                        addGenericHeaders();
                        headers['header5'] = { name: 'X-Auth-Request-Access-Token', value: '' };
                        headers['header6'] = { name: 'X-Auth-Request-User', value: '' };
                        break;

                      case 'authentik':
                        addGenericHeaders();
                        headers['header5'] = { name: 'X-Forwarded-Method', value: '{http.request.method}' };
                        headers['header6'] = { name: 'X-Forwarded-Uri', value: '{http.request.uri}' };
                        break;

                      case 'jellyfin':
                        addGenericHeaders();
                        headers['header5'] = { name: 'X-Emby-Authorization', value: '' };
                        break;

                      case 'object_storage':
                        headers['header1'] = { name: 'Host', value: '{http.request.host}' };
                        headers['header2'] = { name: 'Authorization', value: '' };
                        // Note: Do not strip any x-amz-* headers
                        break;

                      case 'static_site':
                        headers['header1'] = { name: 'X-Forwarded-Host', value: '{http.request.host}' };
                        headers['header2'] = { name: 'X-Forwarded-Proto', value: '{http.request.scheme}' };
                        break;

                      case 'security_tracking':
                        headers['header1'] = { name: 'X-Forwarded-For', value: '{http.request.remote.host}' };
                        headers['header2'] = { name: 'X-Real-IP', value: '{http.request.remote.host}' };
                        break;
                    }
                    form.setValue('config.upstream.headers', headers);
                  }}
                  defaultValue="custom"
                >
                  <optgroup label="Common Templates" title="Basic header configurations for general use cases">
                    <option value="custom">Custom</option>
                    <option value="generic_webapp">Generic Web App / Auth Platform</option>
                    <option value="static_site">Basic Static Site</option>
                  </optgroup>
                  <optgroup label="Auth & Security" title="Headers required for authentication and security services">
                    <option value="oauth2_proxy">OAuth2 Proxy</option>
                    <option value="authentik">Authentik</option>
                    <option value="security_tracking">Security Tracking</option>
                    <option value="hashicorp_vault">HashiCorp Vault</option>
                  </optgroup>
                  <optgroup label="Development & Collaboration" title="Headers for development tools and collaboration platforms">
                    <option value="gitea">Gitea</option>
                    <option value="gitlab">GitLab</option>
                    <option value="jupyter">Jupyter</option>
                    <option value="portainer">Portainer</option>
                    <option value="grafana">Grafana</option>
                  </optgroup>
                  <optgroup label="Apps & Services" title="Headers for specific applications and services">
                    <option value="nextcloud">Nextcloud</option>
                    <option value="jellyfin">Jellyfin</option>
                    <option value="matrix_synapse">Matrix Synapse</option>
                    <option value="home_assistant">Home Assistant</option>
                  </optgroup>
                  <optgroup label="Cloud Services" title="Headers needed for cloud providers and CDNs. Note: Some services require preserving authorization headers">
                    <option value="cloudflare">Cloudflare</option>
                    <option value="object_storage">Object Storage (S3/B2)</option>
                  </optgroup>
                </select>
              </FormField>

              <FormField
                name="config.upstream.headers"
                label="Upstream Headers"
                helperText="Headers to be sent to the upstream service"
              >
                <div className="space-y-2">
                  {Object.entries(form.watch('config.upstream.headers') || {}).map(([key, value], index) => (
                    <div key={index} className="flex gap-2">
                      <FormInput
                        type="text"
                        name={`config.upstream.headers.${key}.name`}
                        defaultValue={value.name}
                        onChange={(e) => {
                          const headers = { ...form.watch('config.upstream.headers') } as HeadersFormData;
                          const oldKey = key;
                          const newKey = `header${Object.keys(headers).length}`;
                          const updatedValue = { ...headers[oldKey], name: e.target.value };
                          delete headers[oldKey];
                          headers[newKey] = updatedValue;
                          form.setValue('config.upstream.headers', headers);
                        }}
                        placeholder="Header name"
                      />
                      <FormInput
                        type="text"
                        name={`config.upstream.headers.${key}.value`}
                        defaultValue={value.value}
                        onChange={(e) => {
                          const headers = { ...form.watch('config.upstream.headers') } as HeadersFormData;
                          headers[key] = { ...headers[key], value: e.target.value };
                          form.setValue('config.upstream.headers', headers);
                        }}
                        placeholder="Header value"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const headers = { ...form.watch('config.upstream.headers') } as HeadersFormData;
                          delete headers[key];
                          form.setValue('config.upstream.headers', headers);
                        }}
                        className="px-2 py-1 text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const headers = { ...form.watch('config.upstream.headers') } as HeadersFormData;
                      const newKey = `header${Object.keys(headers).length}`;
                      headers[newKey] = { name: '', value: '' };
                      form.setValue('config.upstream.headers', headers);
                    }}
                    className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                  >
                    Add Header
                  </button>
                </div>
              </FormField>

              <FormField
                name="config.custom_headers"
                label="Additional Headers"
                helperText="Custom headers to be added to all requests"
              >
                <div className="space-y-2">
                  {Object.entries(form.watch('config.custom_headers') || {}).map(([key, value], index) => (
                    <div key={index} className="flex gap-2">
                      <FormInput
                        type="text"
                        name={`config.custom_headers.${key}.name`}
                        defaultValue={value.name}
                        onChange={(e) => {
                          const headers = { ...form.watch('config.custom_headers') } as HeadersFormData;
                          const oldKey = key;
                          const newKey = `header${Object.keys(headers).length}`;
                          const updatedValue = { ...headers[oldKey], name: e.target.value };
                          delete headers[oldKey];
                          headers[newKey] = updatedValue;
                          form.setValue('config.custom_headers', headers);
                        }}
                        placeholder="Header name"
                      />
                      <FormInput
                        type="text"
                        name={`config.custom_headers.${key}.value`}
                        defaultValue={value.value}
                        onChange={(e) => {
                          const headers = { ...form.watch('config.custom_headers') } as HeadersFormData;
                          headers[key] = { ...headers[key], value: e.target.value };
                          form.setValue('config.custom_headers', headers);
                        }}
                        placeholder="Header value"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const headers = { ...form.watch('config.custom_headers') } as HeadersFormData;
                          delete headers[key];
                          form.setValue('config.custom_headers', headers);
                        }}
                        className="px-2 py-1 text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const headers = { ...form.watch('config.custom_headers') } as HeadersFormData;
                      const newKey = `header${Object.keys(headers).length}`;
                      headers[newKey] = { name: '', value: '' };
                      form.setValue('config.custom_headers', headers);
                    }}
                    className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                  >
                    Add Header
                  </button>
                </div>
              </FormField>
            </div>

            <FormField 
              name="config.domains" 
              label="Domains"
              helperText="Add one or more domains to handle. Each domain can be a hostname (e.g., api.example.com) or a wildcard domain (e.g., *.example.com)"
            >
              <DomainFields name="config.domains" />
            </FormField>

            <div className="flex items-center gap-8">
              <FormField 
                name="config.http_to_https" 
                label="HTTP to HTTPS Redirect"
                helperText="Automatically redirect HTTP traffic to HTTPS when SSL is enabled"
              >
                <FormSwitch name="config.http_to_https" />
              </FormField>

              <FormField 
                name="config.compression" 
                label="Enable Compression"
                helperText="Compress responses using gzip and Zstandard to reduce bandwidth"
              >
                <FormSwitch name="config.compression" />
              </FormField>

              <FormField 
                name="config.cache_enabled" 
                label="Enable Caching"
                helperText="Cache responses to improve performance and reduce upstream load"
              >
                <FormSwitch name="config.cache_enabled" />
              </FormField>
            </div>

            <div className="flex justify-end gap-4 mt-8">
              <button
                type="button"
                onClick={() => navigate('/proxies')}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <FormSubmit>{proxy ? 'Update' : 'Create'} Proxy</FormSubmit>
            </div>
          </Form>
        </FormProvider>
      </div>
    </div>
  );
}
