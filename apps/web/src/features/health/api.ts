import { healthResponseSchema, type HealthResponse } from '@staffos/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export const healthKeys = { all: ['health'] as const };

export function fetchHealth(): Promise<HealthResponse> {
  // 503 still carries a health body ("API up, database down"), so it is data, not an error.
  return apiFetch('/health', healthResponseSchema, { acceptStatuses: [503] });
}

export function useHealth() {
  return useQuery({ queryKey: healthKeys.all, queryFn: fetchHealth });
}
