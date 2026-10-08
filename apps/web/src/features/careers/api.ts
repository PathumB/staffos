import {
  applyResponseSchema,
  type DataRequestInput,
  paginatedSchema,
  publicJobSchema,
  type PublicJobQuery,
  trackingSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';

// Public endpoints: never send the staff access token from this part of the site.
const pub = { auth: false } as const;

export function usePublicJobs(query: Partial<PublicJobQuery>) {
  return useQuery({
    queryKey: ['careers', 'jobs', query],
    queryFn: () =>
      apiFetch(`/careers/jobs?${toQueryString(query)}`, paginatedSchema(publicJobSchema), pub),
    placeholderData: keepPreviousData,
  });
}

export function usePublicJob(slug: string) {
  return useQuery({
    queryKey: ['careers', 'job', slug],
    queryFn: () => apiFetch(`/careers/jobs/${slug}`, publicJobSchema, pub),
    retry: false,
  });
}

export function useApply(slug: string) {
  return useMutation({
    mutationFn: (form: FormData) =>
      apiFetch(`/careers/jobs/${slug}/apply`, applyResponseSchema, {
        ...pub,
        method: 'POST',
        body: form,
      }),
  });
}

export function useTracking(token: string) {
  return useQuery({
    queryKey: ['careers', 'track', token],
    queryFn: () => apiFetch(`/careers/applications/${token}`, trackingSchema, pub),
    retry: false,
  });
}

export function useDataRequest(token: string) {
  return useMutation({
    mutationFn: (input: DataRequestInput) =>
      apiFetch(`/careers/applications/${token}/data-request`, null, {
        ...pub,
        method: 'POST',
        body: input,
      }),
  });
}
