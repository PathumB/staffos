import { ROLE_LABELS, type RoleCode, type User, type UserStatus } from '@staffos/shared';
import { MoreHorizontal, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { type DataTableColumn, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/states';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useUserAction, useUsers } from '../api';
import { UserFormDialog } from '../components/UserFormDialog';

const STATUS_VARIANT: Record<UserStatus, BadgeProps['variant']> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  DEACTIVATED: 'secondary',
};

/** List state lives in the URL so filtered views can be shared and survive reloads. */
function useListParams() {
  const [params, setParams] = useSearchParams();
  const update = (changes: Record<string, string | undefined>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!('page' in changes)) next.delete('page');
      return next;
    });
  return { params, update };
}

export function UsersPage() {
  const { can, user: me } = useAuth();
  const { params, update } = useListParams();
  const [editing, setEditing] = useState<User | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const action = useUserAction();
  const canManage = can('users:manage');

  const query = {
    page: Number(params.get('page') ?? 1),
    pageSize: 20,
    sort: params.get('sort') ?? '-createdAt',
    search: params.get('search') ?? undefined,
    filter: {
      status: (params.get('status') as UserStatus | null) ?? undefined,
      role: (params.get('role') as RoleCode | null) ?? undefined,
    },
  };
  const users = useUsers(query);

  // Debounce typing before hitting the API.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== (params.get('search') ?? '')) update({ search: search.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const runAction = async (
    target: User,
    kind: 'deactivate' | 'reactivate' | 'resend-invitation',
  ) => {
    try {
      await action.mutateAsync({ id: target.id, action: kind });
      toast.success(
        kind === 'deactivate'
          ? `${target.firstName} was deactivated and signed out.`
          : kind === 'reactivate'
            ? `${target.firstName} was reactivated.`
            : 'Invitation sent again.',
      );
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Action failed.');
    }
  };

  const columns = useMemo<DataTableColumn<User>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        enableHiding: false,
        meta: { sortKey: 'lastName', label: 'Name' },
        cell: ({ row }) => (
          <div className="min-w-40">
            <div className="font-medium">
              {row.original.firstName} {row.original.lastName}
            </div>
            <div className="text-xs text-muted-foreground">{row.original.email}</div>
          </div>
        ),
      },
      {
        id: 'roles',
        header: 'Roles',
        meta: { label: 'Roles' },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r} variant="secondary">
                {ROLE_LABELS[r]}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>
            {row.original.status.toLowerCase()}
          </Badge>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        meta: { label: 'Client' },
        cell: ({ row }) => row.original.client?.name ?? '—',
      },
      {
        id: 'lastLoginAt',
        header: 'Last sign-in',
        meta: { sortKey: 'lastLoginAt', label: 'Last sign-in' },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDateTime(row.original.lastLoginAt)}</span>
        ),
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: () => <span className="sr-only">Actions</span>,
              enableHiding: false,
              cell: ({ row }) => {
                const u = row.original;
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${u.firstName} ${u.lastName}`}
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {u.client === null && (
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(u);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                      )}
                      {u.status === 'INVITED' && (
                        <DropdownMenuItem onSelect={() => void runAction(u, 'resend-invitation')}>
                          Resend invitation
                        </DropdownMenuItem>
                      )}
                      {u.status === 'DEACTIVATED' ? (
                        <DropdownMenuItem onSelect={() => void runAction(u, 'reactivate')}>
                          Reactivate
                        </DropdownMenuItem>
                      ) : (
                        u.id !== me?.id && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() => void runAction(u, 'deactivate')}
                          >
                            Deactivate
                          </DropdownMenuItem>
                        )
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              },
            } satisfies DataTableColumn<User>,
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runAction is stable enough per render
    [canManage, me?.id],
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="Staff accounts and what they can access."
        actions={
          canManage && (
            <Button
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <UserPlus aria-hidden />
              Invite user
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        data={users.data?.data}
        meta={users.data?.meta}
        isLoading={users.isPending}
        error={users.error}
        onRetry={() => void users.refetch()}
        sort={query.sort}
        onSortChange={(sort) => update({ sort })}
        onPageChange={(page) => update({ page: String(page) })}
        emptyTitle="No users match"
        emptyDescription="Try a different search or clear the filters."
        toolbar={
          <>
            <Input
              type="search"
              aria-label="Search users"
              placeholder="Search name or email"
              className="sm:max-w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <NativeSelect
              aria-label="Filter by role"
              className="sm:w-44"
              value={query.filter.role ?? ''}
              onChange={(e) => update({ role: e.target.value || undefined })}
            >
              <option value="">All roles</option>
              {(Object.keys(ROLE_LABELS) as RoleCode[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Filter by status"
              className="sm:w-36"
              value={query.filter.status ?? ''}
              onChange={(e) => update({ status: e.target.value || undefined })}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INVITED">Invited</option>
              <option value="DEACTIVATED">Deactivated</option>
            </NativeSelect>
          </>
        }
      />
      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />
    </>
  );
}
