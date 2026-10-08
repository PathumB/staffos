import {
  type InvoiceGenerate,
  type InvoiceListQuery,
  invoiceSchema,
  paginatedSchema,
  signedUrlSchema,
} from '@staffos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { toQueryString } from '@/lib/format';

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (q: Partial<InvoiceListQuery>) => ['invoices', 'list', q] as const,
  one: (id: string) => ['invoices', id] as const,
};

export function useInvoices(query: Partial<InvoiceListQuery>) {
  return useQuery({
    queryKey: invoiceKeys.list(query),
    queryFn: () => apiFetch(`/invoices?${toQueryString(query)}`, paginatedSchema(invoiceSchema)),
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoiceKeys.one(id),
    queryFn: () => apiFetch(`/invoices/${id}`, invoiceSchema),
  });
}

/** One Idempotency-Key per dialog session: a double-click or retry can't bill twice. */
export function useGenerateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, key }: { input: InvoiceGenerate; key: string }) =>
      apiFetch('/invoices/generate', invoiceSchema, {
        method: 'POST',
        body: input,
        headers: { 'Idempotency-Key': key },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: invoiceKeys.all });
      void qc.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });
}

export function useInvoiceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      body,
    }: {
      id: string;
      action: 'issue' | 'void' | 'mark-paid';
      body: Record<string, unknown>;
    }) => apiFetch(`/invoices/${id}/${action}`, invoiceSchema, { method: 'POST', body }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: invoiceKeys.all });
      void qc.invalidateQueries({ queryKey: ['timesheets'] });
    },
  });
}

export function useInvoicePdf() {
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/invoices/${id}/pdf`, signedUrlSchema),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}
