import { formatFils, formatMinutes, INVOICE_STATUS_LABELS } from '@staffos/shared';
import { ArrowLeft, Ban, Download, Send, Wallet } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { useInvoice, useInvoiceAction, useInvoicePdf } from '../api';
import { INVOICE_VARIANT } from './InvoicesPage';

const errorText = (error: unknown) =>
  error instanceof ApiClientError && error.code === 'STALE_VERSION'
    ? 'Someone else changed this invoice. The latest version is now shown.'
    : error instanceof ApiClientError
      ? error.message
      : 'Something went wrong.';

export function InvoicePage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const invoice = useInvoice(id);
  const act = useInvoiceAction();
  const pdf = useInvoicePdf();
  const [voiding, setVoiding] = useState(false);
  const [paying, setPaying] = useState(false);

  if (invoice.error)
    return <ErrorState error={invoice.error} onRetry={() => void invoice.refetch()} />;
  if (!invoice.data) {
    return (
      <div role="status" className="h-64 animate-pulse rounded-lg bg-muted">
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  const inv = invoice.data;
  const write = can('invoices:write');
  const money = (fils: number) => formatFils(fils, inv.currency);

  const run = async (
    action: 'issue' | 'void' | 'mark-paid',
    body: Record<string, unknown>,
    done: string,
  ) => {
    try {
      await act.mutateAsync({ id: inv.id, action, body: { version: inv.version, ...body } });
      toast.success(done);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <>
      <Link
        to="/invoices"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All invoices
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {inv.number ?? 'Draft invoice'}
            <Badge variant={INVOICE_VARIANT[inv.status]}>{INVOICE_STATUS_LABELS[inv.status]}</Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {inv.client.name} · {inv.periodStart} to {inv.periodEnd}
            {inv.issueDate && ` · issued ${inv.issueDate}, due ${inv.dueDate}`}
            {inv.paidOn && ` · paid ${inv.paidOn}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {inv.number && (
            <Button
              variant="outline"
              disabled={pdf.isPending}
              onClick={() => pdf.mutate(inv.id, { onError: (e) => toast.error(errorText(e)) })}
            >
              <Download aria-hidden />
              PDF
            </Button>
          )}
          {write && inv.status === 'DRAFT' && (
            <Button
              disabled={act.isPending}
              onClick={() => void run('issue', {}, 'Invoice issued.')}
            >
              <Send aria-hidden />
              Issue
            </Button>
          )}
          {write && inv.status === 'ISSUED' && (
            <Button disabled={act.isPending} onClick={() => setPaying(true)}>
              <Wallet aria-hidden />
              Mark paid
            </Button>
          )}
          {write && (inv.status === 'DRAFT' || inv.status === 'ISSUED') && (
            <Button variant="ghost" disabled={act.isPending} onClick={() => setVoiding(true)}>
              <Ban aria-hidden />
              Void
            </Button>
          )}
        </div>
      </div>

      {inv.status === 'VOID' && inv.voidReason && (
        <p
          role="note"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm"
        >
          Voided: “{inv.voidReason}”. Its timesheets can be invoiced again.
        </p>
      )}

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full min-w-[32rem] text-sm">
            <caption className="sr-only">Invoice lines</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="pb-2 font-medium">
                  Description
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Hours
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Rate/h
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {inv.lines?.map((l) => (
                <tr key={l.deploymentId} className="border-b">
                  <td className="py-2 pr-3">{l.description}</td>
                  <td className="py-2 text-right tabular-nums">{formatMinutes(l.minutes)}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.rateFils)}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.amountFils)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-right">
              <tr>
                <th scope="row" colSpan={3} className="pt-3 font-normal text-muted-foreground">
                  Subtotal
                </th>
                <td className="pt-3 tabular-nums">{money(inv.subtotalFils)}</td>
              </tr>
              <tr>
                <th scope="row" colSpan={3} className="font-normal text-muted-foreground">
                  VAT {(inv.vatRateBps / 100).toFixed(2)}%
                </th>
                <td className="tabular-nums">{money(inv.vatFils)}</td>
              </tr>
              <tr>
                <th scope="row" colSpan={3} className="pt-1 font-semibold">
                  Total
                </th>
                <td className="pt-1 font-semibold tabular-nums">{money(inv.totalFils)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-4 text-xs text-muted-foreground">
            {inv.timesheetCount} timesheet{inv.timesheetCount === 1 ? '' : 's'} included. Amounts
            are calculated by the server in whole fils; issued invoices cannot be changed.
          </p>
        </CardContent>
      </Card>

      <ActionDialog
        open={voiding}
        onOpenChange={setVoiding}
        title={`Void ${inv.number ?? 'this draft'}?`}
        description="Its timesheets return to approved and can be invoiced again."
        confirmLabel="Void invoice"
        destructive
        note={{ label: 'Reason', required: true }}
        onConfirm={(reason) => run('void', { reason }, 'Invoice voided.')}
      />
      {paying && (
        <PaidDialog
          minDate={inv.issueDate ?? undefined}
          onClose={() => setPaying(false)}
          onSave={(paidOn) => run('mark-paid', { paidOn }, 'Payment recorded.')}
        />
      )}
    </>
  );
}

function PaidDialog({
  minDate,
  onClose,
  onSave,
}: {
  minDate?: string;
  onClose: () => void;
  onSave: (paidOn: string) => Promise<void>;
}) {
  const id = useId();
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-paid`}>Paid on</Label>
          <Input
            id={`${id}-paid`}
            type="date"
            min={minDate}
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              await onSave(paidOn);
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
