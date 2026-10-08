import {
  type ApplicationCreate,
  type ApplicationListQuery,
  applicationSchema,
  type CandidateCreate,
  type CandidateListQuery,
  candidateSchema,
  type CandidateUpdate,
  type JobCreate,
  type JobListQuery,
  jobSchema,
  type JobUpdate,
  paginatedSchema,
  pipelineSchema,
  type TransitionInput,
  userSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';
import { requestKeys } from '../manpower-requests/api';

// Jobs, candidates and applications share caches (a transition changes the pipeline, the
// candidate's applications and job counts), so they live in one feature module.

export const recruitmentKeys = {
  jobs: ['jobs'] as const,
  jobList: (q: Partial<JobListQuery>) => ['jobs', 'list', q] as const,
  job: (id: string) => ['jobs', id] as const,
  pipeline: (id: string) => ['jobs', id, 'pipeline'] as const,
  candidates: ['candidates'] as const,
  candidateList: (q: Partial<CandidateListQuery>) => ['candidates', 'list', q] as const,
  candidate: (id: string) => ['candidates', id] as const,
  applications: ['applications'] as const,
  applicationList: (q: Partial<ApplicationListQuery>) => ['applications', 'list', q] as const,
  staff: (role: string) => ['staff', role] as const,
};

function useInvalidateRecruitment() {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      recruitmentKeys.jobs,
      recruitmentKeys.candidates,
      recruitmentKeys.applications,
      requestKeys.all,
    ]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

// ── Jobs ──

export function useJobs(query: Partial<JobListQuery>, enabled = true) {
  return useQuery({
    queryKey: recruitmentKeys.jobList(query),
    queryFn: () => apiFetch(`/jobs?${toQueryString(query)}`, paginatedSchema(jobSchema)),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useJob(id: string, enabled = true) {
  return useQuery({
    queryKey: recruitmentKeys.job(id),
    queryFn: () => apiFetch(`/jobs/${id}`, jobSchema),
    enabled,
  });
}

export function usePipeline(id: string, enabled = true) {
  return useQuery({
    queryKey: recruitmentKeys.pipeline(id),
    queryFn: () => apiFetch(`/jobs/${id}/pipeline`, pipelineSchema),
    enabled,
  });
}

export function useSaveJob() {
  const invalidate = useInvalidateRecruitment();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: JobCreate | JobUpdate }) =>
      id
        ? apiFetch(`/jobs/${id}`, jobSchema, { method: 'PATCH', body: input })
        : apiFetch('/jobs', jobSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useJobAction() {
  const invalidate = useInvalidateRecruitment();
  return useMutation({
    mutationFn: ({
      id,
      action,
      version,
    }: {
      id: string;
      action: 'publish' | 'hold' | 'close';
      version: number;
    }) => apiFetch(`/jobs/${id}/${action}`, jobSchema, { method: 'POST', body: { version } }),
    onSettled: invalidate,
  });
}

/** Active users holding a role, for recruiter / hiring-manager pickers (HR only: users:read). */
export function useStaff(role: 'RECRUITER' | 'HIRING_MANAGER', enabled = true) {
  return useQuery({
    queryKey: recruitmentKeys.staff(role),
    queryFn: () =>
      apiFetch(
        `/users?${toQueryString({ pageSize: 100, sort: 'lastName', filter: { role, status: 'ACTIVE' } })}`,
        paginatedSchema(userSchema),
      ),
    staleTime: 5 * 60_000,
    enabled,
  });
}

// ── Candidates ──

export function useCandidates(query: Partial<CandidateListQuery>, enabled = true) {
  return useQuery({
    queryKey: recruitmentKeys.candidateList(query),
    queryFn: () =>
      apiFetch(`/candidates?${toQueryString(query)}`, paginatedSchema(candidateSchema)),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: recruitmentKeys.candidate(id),
    queryFn: () => apiFetch(`/candidates/${id}`, candidateSchema),
  });
}

export function useSaveCandidate() {
  const invalidate = useInvalidateRecruitment();
  return useMutation({
    mutationFn: ({
      id,
      input,
      force,
    }: {
      id?: string;
      input: CandidateCreate | CandidateUpdate;
      force?: boolean;
    }) =>
      id
        ? apiFetch(`/candidates/${id}`, candidateSchema, { method: 'PATCH', body: input })
        : apiFetch(`/candidates${force ? '?force=true' : ''}`, candidateSchema, {
            method: 'POST',
            body: input,
          }),
    onSuccess: invalidate,
  });
}

// ── Applications ──

export function useApplications(query: Partial<ApplicationListQuery>, enabled = true) {
  return useQuery({
    queryKey: recruitmentKeys.applicationList(query),
    queryFn: () =>
      apiFetch(`/applications?${toQueryString(query)}`, paginatedSchema(applicationSchema)),
    enabled,
  });
}

export function useAddApplication() {
  const invalidate = useInvalidateRecruitment();
  return useMutation({
    mutationFn: (input: ApplicationCreate) =>
      apiFetch('/applications', applicationSchema, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useTransition() {
  const invalidate = useInvalidateRecruitment();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TransitionInput }) =>
      apiFetch(`/applications/${id}/transition`, applicationSchema, {
        method: 'POST',
        body: input,
      }),
    // Refetch on success and failure: a 409 means our copy of the board is stale.
    onSettled: invalidate,
  });
}
