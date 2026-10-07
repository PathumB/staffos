import {
  type CreateUserInput,
  paginatedSchema,
  roleSchema,
  type UpdateUserInput,
  type UserListQuery,
  userSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';

export const userKeys = {
  all: ['users'] as const,
  list: (query: Partial<UserListQuery>) => ['users', 'list', query] as const,
  roles: ['roles'] as const,
};

export function useUsers(query: Partial<UserListQuery>) {
  return useQuery({
    queryKey: userKeys.list(query),
    queryFn: () => apiFetch(`/users?${toQueryString(query)}`, paginatedSchema(userSchema)),
    placeholderData: keepPreviousData,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: userKeys.roles,
    queryFn: () => apiFetch('/roles', z.array(roleSchema)),
    staleTime: 5 * 60_000,
  });
}

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: userKeys.all });
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiFetch('/users', userSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      apiFetch(`/users/${id}`, userSchema, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

export function useUserAction() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'deactivate' | 'reactivate' | 'resend-invitation';
    }) => apiFetch(`/users/${id}/${action}`, null, { method: 'POST' }),
    onSuccess: invalidate,
  });
}
