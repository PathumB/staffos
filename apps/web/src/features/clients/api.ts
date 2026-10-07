import {
  type ActivityInput,
  activitySchema,
  type ClientInput,
  type ClientListQuery,
  clientSchema,
  type ClientUpdate,
  type ContactInput,
  contactSchema,
  paginatedSchema,
  type ProjectInput,
  projectSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';

export const clientKeys = {
  all: ['clients'] as const,
  list: (q: Partial<ClientListQuery>) => ['clients', 'list', q] as const,
  detail: (id: string) => ['clients', id] as const,
  contacts: (id: string) => ['clients', id, 'contacts'] as const,
  activities: (id: string) => ['clients', id, 'activities'] as const,
  projects: (id: string) => ['clients', id, 'projects'] as const,
};

export function useClients(query: Partial<ClientListQuery>, enabled = true) {
  return useQuery({
    queryKey: clientKeys.list(query),
    queryFn: () => apiFetch(`/clients?${toQueryString(query)}`, paginatedSchema(clientSchema)),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: () => apiFetch(`/clients/${id}`, clientSchema),
  });
}

export function useContacts(id: string) {
  return useQuery({
    queryKey: clientKeys.contacts(id),
    queryFn: () => apiFetch(`/clients/${id}/contacts`, z.array(contactSchema)),
  });
}

export function useActivities(id: string) {
  return useQuery({
    queryKey: clientKeys.activities(id),
    queryFn: () => apiFetch(`/clients/${id}/activities`, z.array(activitySchema)),
  });
}

export function useProjects(id: string, enabled = true) {
  return useQuery({
    queryKey: clientKeys.projects(id),
    queryFn: () => apiFetch(`/clients/${id}/projects`, z.array(projectSchema)),
    enabled,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: clientKeys.all });
}

export function useSaveClient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ClientInput | ClientUpdate }) =>
      id
        ? apiFetch(`/clients/${id}`, clientSchema, { method: 'PATCH', body: input })
        : apiFetch('/clients', clientSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useArchiveClient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/clients/${id}`, null, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useSaveContact(clientId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ContactInput }) =>
      id
        ? apiFetch(`/clients/${clientId}/contacts/${id}`, contactSchema, {
            method: 'PATCH',
            body: input,
          })
        : apiFetch(`/clients/${clientId}/contacts`, contactSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useContactAction(clientId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'invite' | 'delete' }) =>
      action === 'invite'
        ? apiFetch(`/clients/${clientId}/contacts/${id}/invite`, contactSchema, { method: 'POST' })
        : apiFetch(`/clients/${clientId}/contacts/${id}`, null, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useAddActivity(clientId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ActivityInput) =>
      apiFetch(`/clients/${clientId}/activities`, activitySchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useAddProject(clientId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ProjectInput) =>
      apiFetch(`/clients/${clientId}/projects`, projectSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}
