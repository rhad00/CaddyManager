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

export default function ProxyForm({ proxy }: ProxyFormProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createProxy = useCreateProxy();
  const updateProxy = useUpdateProxy(proxy?.id ?? '');

  const form = useForm<CreateProxyInput>({
    resolver: zodResolver(createProxySchema),
    defaultValues: proxy
      ? {
          name: proxy.name,
          config: {
            domains: proxy.config.domains,
            upstream: proxy.config.upstream,
            http_to_https: proxy.config.http_to_https,
            compression: proxy.config.compression,
            cache_enabled: proxy.config.cache_enabled,
            cache_duration: proxy.config.cache_duration,
            custom_headers: proxy.config.custom_headers,
          },
        }
      : {
          name: '',
          config: {
            domains: [{ name: '', ssl_type: 'acme' }],
            upstream: { url: '' },
            http_to_https: true,
            compression: true,
            cache_enabled: false,
          },
        },
  });

  const onSubmit = async (data: CreateProxyInput) => {
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
            <FormField name="name" label="Proxy Name">
              <FormInput type="text" name="name" placeholder="my-awesome-proxy" />
            </FormField>

            <FormField name="config.upstream.url" label="Upstream URL">
              <FormInput
                type="text"
                name="config.upstream.url"
                placeholder="http://localhost:3000"
              />
            </FormField>

            <FormField name="config.domains" label="Domains">
              <DomainFields name="config.domains" />
            </FormField>

            <div className="flex items-center gap-8">
              <FormField name="config.http_to_https" label="HTTP to HTTPS Redirect">
                <FormSwitch name="config.http_to_https" />
              </FormField>

              <FormField name="config.compression" label="Enable Compression">
                <FormSwitch name="config.compression" />
              </FormField>

              <FormField name="config.cache_enabled" label="Enable Caching">
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
