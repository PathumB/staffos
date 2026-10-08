import { JOB_CATEGORY_LABELS, type OnboardingTemplate, ROLE_LABELS } from '@staffos/shared';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError } from '@/lib/api-client';
import { useDeleteTemplate, useTemplates } from '../api';
import { TemplateFormDialog } from '../components/TemplateFormDialog';

const offset = (d: number) => (d === 0 ? 'start day' : d < 0 ? `${-d} days before` : `day ${d}`);

export function TemplatesPage() {
  const templates = useTemplates();
  const remove = useDeleteTemplate();
  const [editing, setEditing] = useState<OnboardingTemplate | 'new' | null>(null);
  const [deleting, setDeleting] = useState<OnboardingTemplate | null>(null);

  return (
    <>
      <Link
        to="/onboarding"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Onboarding
      </Link>
      <PageHeader
        title="Onboarding checklists"
        description="Copied into a new hire's plan when they are hired; editing never changes existing plans."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden />
            New checklist
          </Button>
        }
      />
      {templates.error ? (
        <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
      ) : !templates.data ? (
        <div role="status" className="h-48 animate-pulse rounded-lg bg-muted">
          <span className="sr-only">Loading…</span>
        </div>
      ) : templates.data.length === 0 ? (
        <EmptyState title="No checklists yet" description="Create the default checklist first." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.data.map((t) => (
            <Card key={t.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {t.name}
                    {!t.active && <Badge variant="secondary">Inactive</Badge>}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t.category ? JOB_CATEGORY_LABELS[t.category] : 'Default'} · used by{' '}
                    {t.planCount} plan{t.planCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${t.name}`}
                    onClick={() => setEditing(t)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  {t.planCount === 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => setDeleting(t)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ol className="grid gap-1.5 text-sm">
                  {t.tasks.map((task) => (
                    <li key={task.id} className="flex flex-wrap justify-between gap-x-3">
                      <span>
                        {task.title}
                        {!task.required && (
                          <span className="text-muted-foreground"> (optional)</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {ROLE_LABELS[task.assigneeRole]} · {offset(task.dueOffsetDays)}
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        template={editing === 'new' || editing === null ? undefined : editing}
      />
      <ActionDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete “${deleting.name}”?` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success('Checklist deleted.');
          } catch (error) {
            toast.error(error instanceof ApiClientError ? error.message : 'Could not delete.');
          }
        }}
      />
    </>
  );
}
