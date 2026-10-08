import { notificationSchema, paginatedSchema, unreadCountSchema } from '@staffos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export const notificationKeys = {
  all: ['notifications'] as const,
  count: ['notifications', 'unread-count'] as const,
  recent: ['notifications', 'recent'] as const,
};

/** Polled for the bell; also refreshed when the tab regains focus. */
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.count,
    queryFn: () => apiFetch('/notifications/unread-count', unreadCountSchema),
    refetchInterval: 60_000,
    enabled,
  });
}

export function useRecentNotifications(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.recent,
    queryFn: () => apiFetch('/notifications?pageSize=10', paginatedSchema(notificationSchema)),
    enabled,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: notificationKeys.all });
}

export function useMarkRead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/notifications/${id}/read`, notificationSchema, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useMarkAllRead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => apiFetch('/notifications/read-all', unreadCountSchema, { method: 'POST' }),
    onSuccess: invalidate,
  });
}
