import {
  type DepartmentInput,
  departmentSchema,
  type EmployeeListQuery,
  employeeSchema,
  type EmployeeUpdate,
  paginatedSchema,
  type PositionInput,
  positionSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';

export const employeeKeys = {
  all: ['employees'] as const,
  list: (q: Partial<EmployeeListQuery>) => ['employees', 'list', q] as const,
  one: (id: string) => ['employees', id] as const,
  departments: ['departments'] as const,
  positions: ['positions'] as const,
};

export function useEmployees(query: Partial<EmployeeListQuery>) {
  return useQuery({
    queryKey: employeeKeys.list(query),
    queryFn: () => apiFetch(`/employees?${toQueryString(query)}`, paginatedSchema(employeeSchema)),
    placeholderData: keepPreviousData,
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: employeeKeys.one(id),
    queryFn: () => apiFetch(`/employees/${id}`, employeeSchema),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EmployeeUpdate }) =>
      apiFetch(`/employees/${id}`, employeeSchema, { method: 'PATCH', body: input }),
    // Refetch on failure too: a 409 means our copy is stale.
    onSettled: () => void qc.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

export function useInviteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/employees/${id}/invite`, employeeSchema, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

export function useDepartments(enabled = true) {
  return useQuery({
    queryKey: employeeKeys.departments,
    queryFn: () => apiFetch('/departments', z.array(departmentSchema)),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function usePositions(enabled = true) {
  return useQuery({
    queryKey: employeeKeys.positions,
    queryFn: () => apiFetch('/positions', z.array(positionSchema)),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useSaveDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: DepartmentInput }) =>
      apiFetch(id ? `/departments/${id}` : '/departments', departmentSchema, {
        method: id ? 'PATCH' : 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: employeeKeys.departments });
      void qc.invalidateQueries({ queryKey: employeeKeys.positions });
    },
  });
}

export function useSavePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PositionInput }) =>
      apiFetch(id ? `/positions/${id}` : '/positions', positionSchema, {
        method: id ? 'PATCH' : 'POST',
        body: input,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: employeeKeys.positions }),
  });
}
