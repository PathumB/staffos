import { EMIRATE_LABELS, INDUSTRY_LABELS } from '@staffos/shared';
import { ArrowLeft, Archive, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { RequestFormDialog } from '@/features/manpower-requests/components/RequestFormDialog';
import { ApiClientError } from '@/lib/api-client';
import { useArchiveClient, useClient } from '../api';
import {
  ActivitiesSection,
  ClientRequestsSection,
  ContactsSection,
  ProjectsSection,
} from '../components/ClientSections';
import { ClientFormDialog } from '../components/ClientFormDialog';
import { CLIENT_STATUS_VARIANT } from './ClientsPage';

export function ClientDetailPage() {
  const { id = '' } = useParams();
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const client = useClient(id);
  const archive = useArchiveClient();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [newRequest, setNewRequest] = useState(false);

  if (client.error)
    return <ErrorState error={client.error} onRetry={() => void client.refetch()} />;
  if (!client.data) {
    return (
      <div role="status" className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  const c = client.data;
  // Writes are allowed for Super Admins and the owning account manager; the API enforces it.
  const canWrite =
    can('clients:write') &&
    (user?.roles.includes('SUPER_ADMIN') || c.accountManager.id === user?.id);

  return (
    <>
      {!user?.clientId && (
        <Link
          to="/clients"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All clients
        </Link>
      )}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {c.name}
            <Badge variant={CLIENT_STATUS_VARIANT[c.status]}>{c.status.toLowerCase()}</Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {INDUSTRY_LABELS[c.industry]} · {c.city}, {EMIRATE_LABELS[c.emirate]}
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <Button variant="ghost" onClick={() => setArchiving(true)}>
              <Archive aria-hidden />
              Archive
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-4 lg:col-span-2">
          <ClientRequestsSection
            clientId={c.id}
            onNew={can('manpower-requests:write') ? () => setNewRequest(true) : undefined}
          />
          <ActivitiesSection clientId={c.id} canWrite={canWrite} />
        </div>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Account manager</dt>
                  <dd>{c.accountManager.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">TRN</dt>
                  <dd className="font-mono">{c.trn ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">VAT · payment terms</dt>
                  <dd>
                    {c.vatRateBps / 100}% · {c.paymentTermsDays} days
                  </dd>
                </div>
                {c.addressLine1 && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Address</dt>
                    <dd>{c.addressLine1}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
          <ContactsSection clientId={c.id} canWrite={canWrite} />
          {!user?.clientId && (
            <ProjectsSection clientId={c.id} canWrite={can('deployments:write')} />
          )}
        </div>
      </div>

      <ClientFormDialog open={editing} onOpenChange={setEditing} client={c} />
      <RequestFormDialog open={newRequest} onOpenChange={setNewRequest} clientId={c.id} />
      <ActionDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={`Archive ${c.name}?`}
        description="The client is hidden from lists. Its requests and history stay in the audit trail."
        confirmLabel="Archive"
        destructive
        onConfirm={async () => {
          try {
            await archive.mutateAsync(c.id);
            toast.success('Client archived.');
            navigate('/clients', { replace: true });
          } catch (error) {
            toast.error(
              error instanceof ApiClientError ? error.message : 'Could not archive the client.',
            );
          }
        }}
      />
    </>
  );
}
