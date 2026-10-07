import { PERMISSIONS } from '@staffos/shared';
import { Check } from 'lucide-react';
import { ErrorState, PageHeader } from '@/components/states';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRoles } from '../api';

/** Read-only permission matrix (US-USERS-01), straight from the API's roles table. */
export function RolesPage() {
  const roles = useRoles();

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="What each role can do. Data access is further limited to each user's own clients, jobs or records."
      />
      <Card>
        {roles.error ? (
          <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />
        ) : !roles.data ? (
          <div role="status" className="space-y-2 p-6">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-muted" />
            ))}
            <span className="sr-only">Loading…</span>
          </div>
        ) : (
          <Table>
            <caption className="sr-only">
              Permission matrix: rows are permissions, columns are roles
            </caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 bg-card">Permission</TableHead>
                {roles.data.map((role) => (
                  <TableHead
                    key={role.code}
                    className="text-center"
                    title={role.description ?? undefined}
                  >
                    {role.name}
                    <span className="block font-normal">{role.userCount} users</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSIONS.map((permission) => (
                <TableRow key={permission}>
                  <TableCell className="sticky left-0 bg-card font-mono text-xs whitespace-nowrap">
                    {permission}
                  </TableCell>
                  {roles.data.map((role) => (
                    <TableCell key={role.code} className="text-center">
                      {role.permissions.includes(permission) ? (
                        <Check className="mx-auto size-4 text-success" aria-label="Granted" />
                      ) : (
                        <span className="text-muted-foreground" aria-label="Not granted">
                          ·
                        </span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
