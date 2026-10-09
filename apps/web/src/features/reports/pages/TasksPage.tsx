import { ROLE_LABELS, type RoleCode, type Task } from '@staffos/shared';
import { Check } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api-client';
import { useListParams } from '@/lib/list-params';
import { useCompleteTask, useTasks } from '../api';

const today = () => new Date().toISOString().slice(0, 10);

/** Tasks for me or my role: document renewals, automation follow-ups. */
export function TasksPage() {
  const { get, update } = useListParams();
  const page = Number(get('page') ?? 1);
  const status = get('status') === 'DONE' ? 'DONE' : 'OPEN';
  const tasks = useTasks({ page, pageSize: 20, status });
  const complete = useCompleteTask();

  const columns = useMemo<DataTableColumn<Task>[]>(
    () => [
      {
        id: 'title',
        header: 'Task',
        enableHiding: false,
        meta: { label: 'Task' },
        cell: ({ row }) => (
          <div className="grid gap-0.5">
            {row.original.link ? (
              <Link to={row.original.link} className="font-medium text-primary hover:underline">
                {row.original.title}
              </Link>
            ) : (
              <span className="font-medium">{row.original.title}</span>
            )}
            {row.original.description && (
              <span className="text-xs text-muted-foreground">{row.original.description}</span>
            )}
          </div>
        ),
      },
      {
        id: 'due',
        header: 'Due',
        meta: { label: 'Due' },
        cell: ({ row }) => {
          const due = row.original.dueDate;
          if (!due) return '—';
          const late = row.original.status === 'OPEN' && due < today();
          return <Badge variant={late ? 'destructive' : 'secondary'}>{due}</Badge>;
        },
      },
      {
        id: 'for',
        header: 'For',
        meta: { label: 'Assigned to' },
        cell: ({ row }) =>
          row.original.assignee?.name ??
          (row.original.assigneeRole ? ROLE_LABELS[row.original.assigneeRole as RoleCode] : '—'),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) =>
          row.original.status === 'OPEN' && (
            <Button
              variant="outline"
              size="sm"
              disabled={complete.isPending}
              onClick={() =>
                complete.mutate(row.original.id, {
                  onSuccess: () => toast.success('Task done.'),
                  onError: (e) =>
                    toast.error(
                      e instanceof ApiClientError ? e.message : 'Could not complete the task.',
                    ),
                })
              }
            >
              <Check aria-hidden />
              Done
            </Button>
          ),
      },
    ],
    [complete],
  );

  return (
    <>
      <PageHeader
        title="My tasks"
        description="Tasks assigned to you or to your role, soonest due first."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              update({ status: status === 'OPEN' ? 'DONE' : undefined, page: undefined })
            }
          >
            {status === 'OPEN' ? 'Show completed' : 'Show open'}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={tasks.data?.data}
        meta={tasks.data?.meta}
        isLoading={tasks.isPending}
        error={tasks.error}
        onRetry={() => void tasks.refetch()}
        sort="dueDate"
        onSortChange={() => undefined}
        onPageChange={(p) => update({ page: String(p) })}
        emptyTitle={status === 'OPEN' ? 'Nothing to do' : 'No completed tasks'}
      />
    </>
  );
}
