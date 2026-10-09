import {
  approvalSchema,
  type AutomationRuleInput,
  automationRuleSchema,
  type AutomationRunListQuery,
  automationRunSchema,
  automationTestResultSchema,
  paginatedSchema,
  type WebhookInput,
  type WebhookUpdate,
  webhookDeliverySchema,
  webhookSchema,
  webhookWithSecretSchema,
  type WorkflowInput,
  workflowSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';

export const automationKeys = {
  approvals: (page: number) => ['approvals', page] as const,
  workflows: ['workflows'] as const,
  rules: ['automation-rules'] as const,
  runs: (q: Partial<AutomationRunListQuery>) => ['automation-runs', q] as const,
  allRuns: ['automation-runs'] as const,
  webhooks: ['webhooks'] as const,
  deliveries: (id: string, page: number) => ['webhooks', id, 'deliveries', page] as const,
};

// ── Approvals inbox ──

export function useMyApprovals(page: number) {
  return useQuery({
    queryKey: automationKeys.approvals(page),
    queryFn: () =>
      apiFetch(
        `/approvals?${toQueryString({ page, pageSize: 20 })}`,
        paginatedSchema(approvalSchema),
      ),
    placeholderData: keepPreviousData,
  });
}

// ── Workflows ──

export function useWorkflows(enabled = true) {
  return useQuery({
    queryKey: automationKeys.workflows,
    queryFn: () => apiFetch('/workflows', z.array(workflowSchema)),
    enabled,
  });
}

export function useSaveWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Partial<WorkflowInput> }) =>
      apiFetch(id ? `/workflows/${id}` : '/workflows', workflowSchema, {
        method: id ? 'PATCH' : 'POST',
        body: id ? { ...input, subject: undefined } : input,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: automationKeys.workflows }),
  });
}

// ── Automation rules and runs ──

export function useRules() {
  return useQuery({
    queryKey: automationKeys.rules,
    queryFn: () => apiFetch('/automation-rules', z.array(automationRuleSchema)),
  });
}

export function useSaveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Partial<AutomationRuleInput> }) =>
      apiFetch(id ? `/automation-rules/${id}` : '/automation-rules', automationRuleSchema, {
        method: id ? 'PATCH' : 'POST',
        body: input,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: automationKeys.rules }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/automation-rules/${id}`, null, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: automationKeys.rules }),
  });
}

export function useTestRule() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiFetch(`/automation-rules/${id}/test`, automationTestResultSchema, {
        method: 'POST',
        body: { payload },
      }),
  });
}

export function useRuns(query: Partial<AutomationRunListQuery>) {
  return useQuery({
    queryKey: automationKeys.runs(query),
    queryFn: () =>
      apiFetch(`/automation-runs?${toQueryString(query)}`, paginatedSchema(automationRunSchema)),
    placeholderData: keepPreviousData,
  });
}

export function useRetryRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/automation-runs/${id}/retry`, automationRunSchema, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: automationKeys.allRuns });
      void qc.invalidateQueries({ queryKey: automationKeys.rules });
    },
  });
}

// ── Webhooks ──

export function useWebhooks(enabled = true) {
  return useQuery({
    queryKey: automationKeys.webhooks,
    queryFn: () => apiFetch('/webhooks', z.array(webhookSchema)),
    enabled,
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WebhookInput) =>
      apiFetch('/webhooks', webhookWithSecretSchema, { method: 'POST', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: automationKeys.webhooks }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: WebhookUpdate }) =>
      apiFetch(`/webhooks/${id}`, webhookSchema, { method: 'PATCH', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: automationKeys.webhooks }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/webhooks/${id}`, null, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: automationKeys.webhooks }),
  });
}

export function useRotateSecret() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/webhooks/${id}/rotate-secret`, webhookWithSecretSchema, { method: 'POST' }),
  });
}

export function useDeliveries(id: string, page: number) {
  return useQuery({
    queryKey: automationKeys.deliveries(id, page),
    queryFn: () =>
      apiFetch(
        `/webhooks/${id}/deliveries?${toQueryString({ page, pageSize: 10 })}`,
        paginatedSchema(webhookDeliverySchema),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useRedeliver(webhookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) =>
      apiFetch(`/webhooks/deliveries/${deliveryId}/redeliver`, webhookDeliverySchema, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['webhooks', webhookId, 'deliveries'] });
      void qc.invalidateQueries({ queryKey: automationKeys.webhooks });
    },
  });
}
