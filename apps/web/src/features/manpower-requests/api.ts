import {
  type ManpowerRequestInput,
  type ManpowerRequestListQuery,
  manpowerRequestSchema,
  type ManpowerRequestUpdate,
  paginatedSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';
import { clientKeys } from '../clients/api';

export const requestKeys = {
  all: ['manpower-requests'] as const,
  list: (q: Partial<ManpowerRequestListQuery>) => ['manpower-requests', 'list', q] as const,
  detail: (id: string) => ['manpower-requests', id] as const,
};

export function useRequests(query: Partial<ManpowerRequestListQuery>) {
  return useQuery({
    queryKey: requestKeys.list(query),
    queryFn: () =>
      apiFetch(
        `/manpower-requests?${toQueryString(query)}`,
        paginatedSchema(manpowerRequestSchema),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useRequest(id: string) {
  return useQuery({
    queryKey: requestKeys.detail(id),
    queryFn: () => apiFetch(`/manpower-requests/${id}`, manpowerRequestSchema),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: requestKeys.all });
    // Client pages show open-request counts.
    void qc.invalidateQueries({ queryKey: clientKeys.all });
  };
}

export function useSaveRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id?: string;
      input: ManpowerRequestInput | ManpowerRequestUpdate;
    }) =>
      id
        ? apiFetch(`/manpower-requests/${id}`, manpowerRequestSchema, {
            method: 'PATCH',
            body: input,
          })
        : apiFetch('/manpower-requests', manpowerRequestSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export type RequestAction = 'submit' | 'approve' | 'reject' | 'cancel';

export function useRequestAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      action,
      version,
      note,
    }: {
      id: string;
      action: RequestAction;
      version: number;
      note?: string;
    }) =>
      apiFetch(`/manpower-requests/${id}/${action}`, manpowerRequestSchema, {
        method: 'POST',
        body: action === 'cancel' ? { version, reason: note } : { version, comment: note },
      }),
    onSettled: invalidate,
  });
}
