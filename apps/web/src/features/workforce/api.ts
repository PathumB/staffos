import {
  bulkResultSchema,
  type DeploymentCreate,
  type DeploymentEnd,
  type DeploymentListQuery,
  deploymentSchema,
  paginatedSchema,
  type TimesheetCreate,
  type TimesheetListQuery,
  timesheetSchema,
  type TimesheetUpdate,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';

export const workforceKeys = {
  deployments: ['deployments'] as const,
  deploymentList: (q: Partial<DeploymentListQuery>) => ['deployments', 'list', q] as const,
  timesheets: ['timesheets'] as const,
  timesheetList: (q: Partial<TimesheetListQuery>) => ['timesheets', 'list', q] as const,
  timesheet: (id: string) => ['timesheets', id] as const,
};

function useInvalidate(key: readonly string[]) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: key });
}

// ── Deployments ──

export function useDeployments(query: Partial<DeploymentListQuery>, enabled = true) {
  return useQuery({
    queryKey: workforceKeys.deploymentList(query),
    queryFn: () =>
      apiFetch(`/deployments?${toQueryString(query)}`, paginatedSchema(deploymentSchema)),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreateDeployment() {
  const invalidate = useInvalidate(workforceKeys.deployments);
  return useMutation({
    mutationFn: (input: DeploymentCreate) =>
      apiFetch('/deployments', deploymentSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useEndDeployment() {
  const invalidate = useInvalidate(workforceKeys.deployments);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeploymentEnd }) =>
      apiFetch(`/deployments/${id}/end`, deploymentSchema, { method: 'POST', body: input }),
    onSettled: invalidate,
  });
}

// ── Timesheets ──

export function useTimesheets(query: Partial<TimesheetListQuery>) {
  return useQuery({
    queryKey: workforceKeys.timesheetList(query),
    queryFn: () =>
      apiFetch(`/timesheets?${toQueryString(query)}`, paginatedSchema(timesheetSchema)),
    placeholderData: keepPreviousData,
  });
}

export function useTimesheet(id: string) {
  return useQuery({
    queryKey: workforceKeys.timesheet(id),
    queryFn: () => apiFetch(`/timesheets/${id}`, timesheetSchema),
  });
}

export function useCreateTimesheet() {
  const invalidate = useInvalidate(workforceKeys.timesheets);
  return useMutation({
    mutationFn: (input: TimesheetCreate) =>
      apiFetch('/timesheets', timesheetSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useSaveTimesheet() {
  const invalidate = useInvalidate(workforceKeys.timesheets);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TimesheetUpdate }) =>
      apiFetch(`/timesheets/${id}`, timesheetSchema, { method: 'PATCH', body: input }),
    onSettled: invalidate,
  });
}

export function useTimesheetAction() {
  const invalidate = useInvalidate(workforceKeys.timesheets);
  return useMutation({
    mutationFn: ({
      id,
      action,
      version,
      comment,
    }: {
      id: string;
      action: 'submit' | 'approve' | 'reject';
      version: number;
      comment?: string;
    }) =>
      apiFetch(`/timesheets/${id}/${action}`, timesheetSchema, {
        method: 'POST',
        body: action === 'reject' ? { version, comment } : { version },
      }),
    onSettled: invalidate,
  });
}

export function useBulkApprove() {
  const invalidate = useInvalidate(workforceKeys.timesheets);
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch('/timesheets/bulk-approve', bulkResultSchema, { method: 'POST', body: { ids } }),
    onSettled: invalidate,
  });
}
