import {
  aiRequestSchema,
  aiUsageSchema,
  type JdDraftInput,
  jdDraftResponseSchema,
  interviewKitSchema,
  interviewSummarySchema,
  matchResultSchema,
  paginatedSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';

export const aiKeys = {
  match: (jobId: string) => ['ai', 'match', jobId] as const,
  usage: ['ai', 'usage'] as const,
  requests: (page: number) => ['ai', 'requests', page] as const,
};

export function useMatchResults(jobId: string, enabled: boolean) {
  return useQuery({
    queryKey: aiKeys.match(jobId),
    queryFn: () => apiFetch(`/ai/match/${jobId}`, z.array(matchResultSchema)),
    enabled,
  });
}

export function useRunMatch(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/ai/match/${jobId}`, z.array(matchResultSchema), { method: 'POST' }),
    onSuccess: (data) => qc.setQueryData(aiKeys.match(jobId), data),
  });
}

export function useJdDraft() {
  return useMutation({
    mutationFn: (input: JdDraftInput) =>
      apiFetch('/ai/jd-draft', jdDraftResponseSchema, { method: 'POST', body: input }),
  });
}

export function useInterviewKit() {
  return useMutation({
    mutationFn: (jobId: string) =>
      apiFetch('/ai/interview-kit', interviewKitSchema, { method: 'POST', body: { jobId } }),
  });
}

export function useInterviewSummary() {
  return useMutation({
    mutationFn: (applicationId: string) =>
      apiFetch(`/ai/interview-summary/${applicationId}`, interviewSummarySchema, {
        method: 'POST',
      }),
  });
}

export function useAiUsage() {
  return useQuery({ queryKey: aiKeys.usage, queryFn: () => apiFetch('/ai/usage', aiUsageSchema) });
}

export function useAiRequests(page: number) {
  return useQuery({
    queryKey: aiKeys.requests(page),
    queryFn: () =>
      apiFetch(`/ai/requests?page=${page}&pageSize=20`, paginatedSchema(aiRequestSchema)),
    placeholderData: keepPreviousData,
  });
}
