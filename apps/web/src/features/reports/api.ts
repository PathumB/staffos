import {
  askDataResponseSchema,
  clientRevenueSchema,
  dashboardSchema,
  hiringFunnelSchema,
  openRequestsSchema,
  paginatedSchema,
  type ReportFilter,
  type TaskListQuery,
  taskSchema,
  timeToHireSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';

export const reportKeys = {
  dashboard: ['reports', 'dashboard'] as const,
  report: (name: string, f: ReportFilter) => ['reports', name, f] as const,
  tasks: ['tasks'] as const,
  taskList: (q: Partial<TaskListQuery>) => ['tasks', q] as const,
};

export function useDashboard(enabled: boolean) {
  return useQuery({
    queryKey: reportKeys.dashboard,
    queryFn: () => apiFetch('/reports/dashboard', dashboardSchema),
    enabled,
  });
}

const report = <T>(name: string, schema: { parse: (v: unknown) => T }) =>
  function useReport(filter: ReportFilter, enabled = true) {
    return useQuery({
      queryKey: reportKeys.report(name, filter),
      queryFn: () =>
        apiFetch(`/reports/${name}?${toQueryString(filter)}`, schema as never) as Promise<T>,
      placeholderData: keepPreviousData,
      enabled,
    });
  };

export const useHiringFunnel = report('hiring-funnel', hiringFunnelSchema);
export const useTimeToHire = report('time-to-hire', timeToHireSchema);
export const useClientRevenue = report('client-revenue', clientRevenueSchema);
export const useOpenRequests = report('open-requests', openRequestsSchema);

export function useAskData() {
  return useMutation({
    mutationFn: (question: string) =>
      apiFetch('/ai/ask-data', askDataResponseSchema, { method: 'POST', body: { question } }),
  });
}

export function useTasks(query: Partial<TaskListQuery>) {
  return useQuery({
    queryKey: reportKeys.taskList(query),
    queryFn: () => apiFetch(`/tasks?${toQueryString(query)}`, paginatedSchema(taskSchema)),
    placeholderData: keepPreviousData,
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/tasks/${id}/complete`, taskSchema, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reportKeys.tasks });
      void qc.invalidateQueries({ queryKey: reportKeys.dashboard });
    },
  });
}
