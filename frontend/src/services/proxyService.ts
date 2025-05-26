import { api, extractError } from './api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface DomainConfig {
  name: string;
  ssl_type: 'acme' | 'custom' | 'none';
  custom_cert_id?: string;
}

export interface UpstreamConfig {
  url: string;
  headers?: Record<string, string>;
}

export interface ProxyConfig {
  domains: DomainConfig[];
  upstream: UpstreamConfig;
  http_to_https: boolean;
  compression: boolean;
  cache_enabled: boolean;
  cache_duration?: string;
  custom_headers?: Record<string, string>;
}

export interface Proxy {
  id: string;
  name: string;
  config: ProxyConfig;
  isActive: boolean;
  status?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

// Query keys
const keys = {
  all: ['proxies'] as const,
  lists: () => [...keys.all, 'list'] as const,
  list: (params: { limit?: number; offset?: number; isActive?: boolean }) =>
    [...keys.lists(), params] as const,
  details: () => [...keys.all, 'detail'] as const,
  detail: (id: string) => [...keys.details(), id] as const,
};

// List proxies with pagination
export const useProxies = (
  params: {
    limit?: number;
    offset?: number;
    isActive?: boolean;
  } = {},
) => {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: async () => {
      const { data } = await api.get('/proxies', { params });
      return data;
    },
  });
};

// Get single proxy
export const useProxy = (id: string) => {
  return useQuery({
    queryKey: keys.detail(id),
    queryFn: async () => {
      const { data } = await api.get(`/proxies/${id}`);
      return data;
    },
  });
};

// Create proxy
export const useCreateProxy = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newProxy: { name: string; config: ProxyConfig }) => {
      const { data } = await api.post('/proxies', newProxy);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.lists() });
    },
  });
};

// Update proxy
export const useUpdateProxy = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { name?: string; config?: ProxyConfig; isActive?: boolean }) => {
      const { data } = await api.put(`/proxies/${id}`, updates);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.detail(id) });
      queryClient.invalidateQueries({ queryKey: keys.lists() });
    },
  });
};

// Delete proxy
export const useDeleteProxy = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/proxies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.lists() });
    },
  });
};

// Toggle proxy active state
export const useToggleProxy = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/proxies/${id}/toggle`);
      return data;
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: keys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: keys.lists() });
    },
  });
};

// Validate proxy configuration
export const validateProxyConfig = async (config: ProxyConfig): Promise<boolean> => {
  try {
    // Basic validation
    if (!config.domains || config.domains.length === 0) {
      throw new Error('At least one domain is required');
    }

    for (const domain of config.domains) {
      if (!domain.name) {
        throw new Error('Domain name is required');
      }
      if (!['acme', 'custom', 'none'].includes(domain.ssl_type)) {
        throw new Error('Invalid SSL type');
      }
    }

    if (!config.upstream || !config.upstream.url) {
      throw new Error('Upstream URL is required');
    }

    return true;
  } catch (error) {
    throw extractError(error);
  }
};
