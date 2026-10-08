import {
  type DocumentOwnerType,
  documentSchema,
  type DocumentUpload,
  signedUrlSchema,
} from '@staffos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';

export const documentKeys = {
  all: ['documents'] as const,
  owner: (type: DocumentOwnerType, id: string) => ['documents', type, id] as const,
  expiring: (days: number) => ['documents', 'expiring', days] as const,
};

export function useDocuments(ownerType: DocumentOwnerType, ownerId: string, enabled = true) {
  return useQuery({
    queryKey: documentKeys.owner(ownerType, ownerId),
    queryFn: () =>
      apiFetch(`/documents?ownerType=${ownerType}&ownerId=${ownerId}`, z.array(documentSchema)),
    enabled,
  });
}

export function useExpiringDocuments(withinDays: number) {
  return useQuery({
    queryKey: documentKeys.expiring(withinDays),
    queryFn: () =>
      apiFetch(`/documents/expiring?withinDays=${withinDays}`, z.array(documentSchema)),
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fields, file }: { fields: DocumentUpload; file: File }) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== '') form.append(key, String(value));
      }
      form.append('file', file);
      return apiFetch('/documents', documentSchema, { method: 'POST', body: form });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: documentKeys.all }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/documents/${id}`, null, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: documentKeys.all }),
  });
}

/** Asks for a fresh 5-minute link (audited) and starts the download. */
export function useOpenDocument() {
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/documents/${id}/url`, signedUrlSchema),
    onSuccess: ({ url }) => {
      // The response is a download (Content-Disposition: attachment), so the page stays put.
      window.location.assign(url);
    },
  });
}
