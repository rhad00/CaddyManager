import { api } from './api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertThreshold } from '../types/alerts';

const keys = {
  all: ['alerts'] as const,
  lists: () => [...keys.all, 'list'] as const,
  list: (proxyId: string) => [...keys.lists(), proxyId] as const,
  details: () => [...keys.all, 'detail'] as const,
  detail: (id: string) => [...keys.details(), id] as const,
};

// Get all alert thresholds for a proxy
export const useAlertThresholds = (proxyId: string) => {
  return useQuery({
    queryKey: keys.list(proxyId),
    queryFn: async () => {
      const { data } = await api.get(`/alerts/thresholds?proxyId=${proxyId}`);
      return data;
    },
  });
};

// Get single alert threshold
export const useAlertThreshold = (id: string) => {
  return useQuery({
    queryKey: keys.detail(id),
    queryFn: async () => {
      const { data } = await api.get(`/alerts/thresholds/${id}`);
      return data;
    },
  });
};

// Create alert threshold
export const useCreateAlertThreshold = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<AlertThreshold, 'id' | 'createdAt' | 'updatedAt'>) => {
      const { data: response } = await api.post('/alerts/thresholds', data);
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: keys.list(data.proxyId) });
    },
  });
};

// Update alert threshold
export const useUpdateAlertThreshold = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<AlertThreshold>) => {
      const { data: response } = await api.put(`/alerts/thresholds/${id}`, data);
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: keys.detail(id) });
      queryClient.invalidateQueries({ queryKey: keys.list(data.proxyId) });
    },
  });
};

// Delete alert threshold
export const useDeleteAlertThreshold = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, proxyId }: { id: string; proxyId: string }) => {
      await api.delete(`/alerts/thresholds/${id}`);
      return { id, proxyId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: keys.list(data.proxyId) });
    },
  });
};
