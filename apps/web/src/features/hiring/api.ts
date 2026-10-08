import {
  applicationSchema,
  type FeedbackInput,
  feedbackSchema,
  type InterviewCreate,
  type InterviewListQuery,
  interviewSchema,
  type InterviewUpdate,
  type OfferAction,
  type OfferCreate,
  type OfferListQuery,
  offerSchema,
  paginatedSchema,
  panelOptionSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';
import { recruitmentKeys } from '../recruitment/api';

export const hiringKeys = {
  application: (id: string) => ['applications', id] as const,
  interviews: ['interviews'] as const,
  interviewList: (q: Partial<InterviewListQuery>) => ['interviews', 'list', q] as const,
  feedback: (id: string) => ['interviews', id, 'feedback'] as const,
  panel: ['interviews', 'panel-options'] as const,
  offers: ['offers'] as const,
  offerList: (q: Partial<OfferListQuery>) => ['offers', 'list', q] as const,
};

/** Interviews and offers change the application page, pipeline and job counts. */
function useInvalidateHiring() {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      hiringKeys.interviews,
      hiringKeys.offers,
      recruitmentKeys.applications,
      recruitmentKeys.jobs,
      recruitmentKeys.candidates,
    ]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: hiringKeys.application(id),
    queryFn: () => apiFetch(`/applications/${id}`, applicationSchema),
  });
}

// ── Interviews ──

export function useInterviews(query: Partial<InterviewListQuery>, enabled = true) {
  return useQuery({
    queryKey: hiringKeys.interviewList(query),
    queryFn: () =>
      apiFetch(`/interviews?${toQueryString(query)}`, paginatedSchema(interviewSchema)),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePanelOptions(enabled: boolean) {
  return useQuery({
    queryKey: hiringKeys.panel,
    queryFn: () => apiFetch('/interviews/panel-options', z.array(panelOptionSchema)),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useSaveInterview() {
  const invalidate = useInvalidateHiring();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: InterviewCreate | InterviewUpdate }) =>
      id
        ? apiFetch(`/interviews/${id}`, interviewSchema, { method: 'PATCH', body: input })
        : apiFetch('/interviews', interviewSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useCancelInterview() {
  const invalidate = useInvalidateHiring();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch(`/interviews/${id}/cancel`, interviewSchema, { method: 'POST', body: { reason } }),
    onSuccess: invalidate,
  });
}

export function useFeedback(interviewId: string, enabled: boolean) {
  return useQuery({
    queryKey: hiringKeys.feedback(interviewId),
    queryFn: () => apiFetch(`/interviews/${interviewId}/feedback`, z.array(feedbackSchema)),
    enabled,
  });
}

export function useSubmitFeedback() {
  const invalidate = useInvalidateHiring();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FeedbackInput }) =>
      apiFetch(`/interviews/${id}/feedback`, feedbackSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

// ── Offers ──

export function useOffers(query: Partial<OfferListQuery>, enabled = true) {
  return useQuery({
    queryKey: hiringKeys.offerList(query),
    queryFn: () => apiFetch(`/offers?${toQueryString(query)}`, paginatedSchema(offerSchema)),
    enabled,
  });
}

export function useCreateOffer() {
  const invalidate = useInvalidateHiring();
  return useMutation({
    mutationFn: (input: OfferCreate) =>
      apiFetch('/offers', offerSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useOfferAction() {
  const invalidate = useInvalidateHiring();
  return useMutation({
    mutationFn: ({
      id,
      action,
      version,
      reason,
    }: {
      id: string;
      action: OfferAction;
      version: number;
      reason?: string;
    }) =>
      apiFetch(`/offers/${id}/${action}`, offerSchema, {
        method: 'POST',
        body: { version, reason },
      }),
    onSuccess: invalidate,
  });
}
