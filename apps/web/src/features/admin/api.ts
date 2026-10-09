import {
  integrationStatusSchema,
  type Settings,
  type SettingsUpdate,
  settingsSchema,
  systemHealthSchema,
} from '@staffos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';

export const adminKeys = {
  settings: ['settings'] as const,
  integrations: ['integrations'] as const,
  system: ['admin', 'system'] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: adminKeys.settings,
    queryFn: () => apiFetch('/settings', settingsSchema),
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsUpdate) =>
      apiFetch('/settings', settingsSchema, { method: 'PATCH', body: input }),
    onSuccess: (data: Settings) => qc.setQueryData(adminKeys.settings, data),
  });
}

export function useIntegrations(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.integrations,
    queryFn: () => apiFetch('/integrations', z.array(integrationStatusSchema)),
    enabled,
  });
}

export function useZohoSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      // 202 Accepted: the sync runs as a background job; progress shows on the system card.
      apiFetch('/integrations/zoho/sync', null, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.system }),
  });
}

export function useSystemHealth(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.system,
    queryFn: () => apiFetch('/admin/system', systemHealthSchema),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useDemoReset() {
  return useMutation({
    mutationFn: () => apiFetch('/admin/demo-reset', null, { method: 'POST' }),
  });
}
