import { ROLE_LABELS, type Workflow } from '@staffos/shared';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useWorkflows } from '../api';
import { WorkflowFormDialog } from '../components/WorkflowFormDialog';

/** US-WF-01: approval chains for manpower requests and offers. */
export function WorkflowsPage() {
  const workflows = useWorkflows();
  const [editing, setEditing] = useState<Workflow | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Approval chains"
        description="Without an active chain, requests above the headcount threshold need one HR Manager approval and offers need the hiring manager’s."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden />
            New chain
          </Button>
        }
      />
      {workflows.error ? (
        <ErrorState error={workflows.error} onRetry={() => void workflows.refetch()} />
      ) : workflows.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : workflows.data.length === 0 ? (
        <EmptyState
          title="No approval chains"
          description="Add one to require several approvals."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {workflows.data.map((w) => (
            <li key={w.id}>
              <Card className="h-full">
                <CardContent className="grid gap-3 pt-4">
                  <div className="flex items-start gap-2">
                    <div className="grid gap-1">
                      <span className="font-medium">{w.name}</span>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary">
                          {w.subject === 'OFFER' ? 'Offers' : 'Manpower requests'}
                        </Badge>
                        <Badge variant={w.active ? 'success' : 'secondary'}>
                          {w.active ? 'Active' : 'Inactive'}
                        </Badge>
                        {w.pendingCount > 0 && (
                          <Badge variant="warning">{w.pendingCount} in progress</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto"
                      aria-label={`Edit ${w.name}`}
                      onClick={() => setEditing(w)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  </div>
                  <ol className="grid gap-1 text-sm">
                    {w.steps.map((s) => (
                      <li key={s.stepOrder} className="flex gap-2">
                        <span className="tabular-nums text-muted-foreground">{s.stepOrder}.</span>
                        <span>
                          {s.name}{' '}
                          <span className="text-muted-foreground">
                            ({ROLE_LABELS[s.approverRole]})
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <WorkflowFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        workflow={editing === 'new' || editing === null ? undefined : editing}
      />
    </>
  );
}
