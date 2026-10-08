import {
  onboardingPlanSchema,
  paginatedSchema,
  type PlanListQuery,
  type TaskComplete,
  type TaskUpdate,
  type TemplateInput,
  templateSchema,
  userSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';
import { employeeKeys } from '../employees/api';

export const onboardingKeys = {
  plans: ['onboarding-plans'] as const,
  planList: (q: Partial<PlanListQuery>) => ['onboarding-plans', 'list', q] as const,
  plan: (id: string) => ['onboarding-plans', id] as const,
  templates: ['onboarding-templates'] as const,
  assignable: ['onboarding', 'assignable-users'] as const,
};

/** A task change can complete the plan and activate the employee, so refresh both. */
function useInvalidatePlans() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: onboardingKeys.plans });
    void qc.invalidateQueries({ queryKey: employeeKeys.all });
  };
}

export function usePlans(query: Partial<PlanListQuery>) {
  return useQuery({
    queryKey: onboardingKeys.planList(query),
    queryFn: () =>
      apiFetch(`/onboarding-plans?${toQueryString(query)}`, paginatedSchema(onboardingPlanSchema)),
    placeholderData: keepPreviousData,
  });
}

export function usePlan(id: string, enabled = true) {
  return useQuery({
    queryKey: onboardingKeys.plan(id),
    queryFn: () => apiFetch(`/onboarding-plans/${id}`, onboardingPlanSchema),
    enabled,
  });
}

export function useCompleteTask() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskComplete }) =>
      apiFetch(`/onboarding-tasks/${id}/complete`, onboardingPlanSchema, {
        method: 'POST',
        body: input,
      }),
    onSettled: invalidate,
  });
}

export function useReopenTask() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/onboarding-tasks/${id}/reopen`, onboardingPlanSchema, { method: 'POST' }),
    onSettled: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskUpdate }) =>
      apiFetch(`/onboarding-tasks/${id}`, onboardingPlanSchema, { method: 'PATCH', body: input }),
    onSettled: invalidate,
  });
}

/** Internal staff an HR Manager can assign a task to (HR has users:read). */
export function useAssignableUsers(enabled: boolean) {
  return useQuery({
    queryKey: onboardingKeys.assignable,
    queryFn: () =>
      apiFetch(
        `/users?${toQueryString({ pageSize: 100, sort: 'lastName', filter: { status: 'ACTIVE' } })}`,
        paginatedSchema(userSchema),
      ),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: onboardingKeys.templates,
    queryFn: () => apiFetch('/onboarding-templates', z.array(templateSchema)),
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TemplateInput }) =>
      apiFetch(id ? `/onboarding-templates/${id}` : '/onboarding-templates', templateSchema, {
        method: id ? 'PATCH' : 'POST',
        body: input,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: onboardingKeys.templates }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/onboarding-templates/${id}`, null, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: onboardingKeys.templates }),
  });
}
