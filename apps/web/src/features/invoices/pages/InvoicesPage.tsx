import {
  formatFils,
  type Invoice,
  INVOICE_STATUS_LABELS,
  invoiceGenerateSchema,
  type InvoiceStatus,
} from '@staffos/shared';
import { FilePlus2, Loader2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/AuthProvider';
import { ClientPicker } from '@/features/clients/components/ClientPicker';
import { ApiClientError } from '@/lib/api-client';
import { useListParams } from '@/lib/list-params';
import { useGenerateInvoice, useInvoices } from '../api';

export const INVOICE_VARIANT: Record<InvoiceStatus, BadgeProps['variant']> = {
  DRAFT: 'secondary',
  ISSUED: 'warning',
  PAID: 'success',
  VOID: 'destructive',
};

export function InvoicesPage() {
  const { can } = useAuth();
  const { get, update } = useListParams();
  const [generating, setGenerating] = useState(false);
  const query = {
    page: Number(get('page') ?? 1),
    pageSize: 20,
    sort: get('sort') ?? '-createdAt',
    filter: { status: get('status') as InvoiceStatus | undefined },
  };
  const invoices = useInvoices(query);

  const columns = useMemo<DataTableColumn<Invoice>[]>(
    () => [
      {
        id: 'number',
        header: 'Invoice',
        enableHiding: false,
        meta: { label: 'Invoice' },
        cell: ({ row }) => (
          <Link
            to={`/invoices/${row.original.id}`}
            className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline"
          >
            {row.original.number ?? 'Draft'}
          </Link>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        meta: { label: 'Client' },
        cell: ({ row }) => row.original.client.name,
      },
      {
        id: 'period',
        header: 'Period',
        meta: { label: 'Period' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {row.original.periodStart} → {row.original.periodEnd}
          </span>
        ),
      },
      {
        id: 'totalFils',
        header: 'Total',
        meta: { sortKey: 'totalFils', label: 'Total' },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatFils(row.original.totalFils, row.original.currency)}
          </span>
        ),
      },
      {
        id: 'dueDate',
        header: 'Due',
        meta: { label: 'Due' },
        cell: ({ row }) => row.original.dueDate ?? '—',
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => (
          <Badge variant={INVOICE_VARIANT[row.original.status]}>
            {INVOICE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Monthly invoices per client from approved timesheets. Amounts include 5% VAT unless the client is zero-rated."
        actions={
          can('invoices:write') && (
            <Button onClick={() => setGenerating(true)}>
              <FilePlus2 aria-hidden />
              Generate invoice
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={invoices.data?.data}
        meta={invoices.data?.meta}
        isLoading={invoices.isPending}
        error={invoices.error}
        onRetry={() => void invoices.refetch()}
        sort={query.sort}
        onSortChange={(sort) => update({ sort })}
        onPageChange={(page) => update({ page: String(page) })}
        emptyTitle="No invoices"
        emptyDescription="Generate one from approved timesheets."
        toolbar={
          <NativeSelect
            aria-label="Filter by status"
            className="sm:w-40"
            value={query.filter.status ?? ''}
            onChange={(e) => update({ status: e.target.value || undefined })}
          >
            <option value="">All statuses</option>
            {Object.entries(INVOICE_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        }
      />
      {generating && <GenerateDialog onClose={() => setGenerating(false)} />}
    </>
  );
}

const firstOfLastMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
};
const lastOfLastMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10);
};

/** US-INV-01. Mounted only while open; its Idempotency-Key lives for the dialog's lifetime. */
function GenerateDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const navigate = useNavigate();
  const generate = useGenerateInvoice();
  const [key] = useState(() => crypto.randomUUID());
  const [clientId, setClientId] = useState('');
  const [periodStart, setPeriodStart] = useState(firstOfLastMonth);
  const [periodEnd, setPeriodEnd] = useState(lastOfLastMonth);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const parsed = invoiceGenerateSchema.safeParse({ clientId, periodStart, periodEnd });
    if (!parsed.success)
      return setError(
        clientId ? (parsed.error.issues[0]?.message ?? 'Check the dates.') : 'Choose a client.',
      );
    try {
      const invoice = await generate.mutateAsync({ input: parsed.data, key });
      toast.success('Draft invoice created. Review it, then issue.');
      onClose();
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate invoice</DialogTitle>
          <DialogDescription>
            Includes every approved, uninvoiced week that starts in the period.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <ClientPicker value={clientId} onChange={setClientId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-from`}>From</Label>
              <Input
                id={`${id}-from`}
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-to`}>To</Label>
              <Input
                id={`${id}-to`}
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={generate.isPending}>
            {generate.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
