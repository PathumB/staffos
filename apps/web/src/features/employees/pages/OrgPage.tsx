import { departmentInputSchema, positionInputSchema } from '@staffos/shared';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, PageHeader } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiClientError } from '@/lib/api-client';
import { useDepartments, usePositions, useSaveDepartment, useSavePosition } from '../api';

type Editing =
  | { kind: 'department'; id?: string; name: string }
  | { kind: 'position'; id?: string; name: string; departmentId: string };

/** HR reference data: departments and the positions within them. */
export function OrgPage() {
  const departments = useDepartments();
  const positions = usePositions();
  const [editing, setEditing] = useState<Editing | null>(null);

  return (
    <>
      <PageHeader
        title="Departments and positions"
        description="Used on employee records and in reports."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>Departments</CardTitle>
            <Button size="sm" onClick={() => setEditing({ kind: 'department', name: '' })}>
              <Plus aria-hidden />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            {departments.error ? (
              <ErrorState error={departments.error} onRetry={() => void departments.refetch()} />
            ) : !departments.data ? (
              <div role="status" className="h-24 animate-pulse rounded-md bg-muted">
                <span className="sr-only">Loading…</span>
              </div>
            ) : departments.data.length === 0 ? (
              <EmptyState title="No departments yet" />
            ) : (
              <ul className="divide-y text-sm">
                {departments.data.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-1.5">
                    {d.name}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Rename ${d.name}`}
                      onClick={() => setEditing({ kind: 'department', id: d.id, name: d.name })}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>Positions</CardTitle>
            <Button
              size="sm"
              onClick={() => setEditing({ kind: 'position', name: '', departmentId: '' })}
            >
              <Plus aria-hidden />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            {positions.error ? (
              <ErrorState error={positions.error} onRetry={() => void positions.refetch()} />
            ) : !positions.data ? (
              <div role="status" className="h-24 animate-pulse rounded-md bg-muted">
                <span className="sr-only">Loading…</span>
              </div>
            ) : positions.data.length === 0 ? (
              <EmptyState title="No positions yet" />
            ) : (
              <ul className="divide-y text-sm">
                {positions.data.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span>
                      {p.title}
                      {p.department && (
                        <span className="text-muted-foreground"> · {p.department.name}</span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${p.title}`}
                      onClick={() =>
                        setEditing({
                          kind: 'position',
                          id: p.id,
                          name: p.title,
                          departmentId: p.department?.id ?? '',
                        })
                      }
                    >
                      <Pencil aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {editing && <OrgDialog editing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Mounted only while open, so its state starts from `editing`. */
function OrgDialog({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const id = useId();
  const departments = useDepartments();
  const saveDepartment = useSaveDepartment();
  const savePosition = useSavePosition();
  const [name, setName] = useState(editing.name);
  const [departmentId, setDepartmentId] = useState(
    editing.kind === 'position' ? editing.departmentId : '',
  );
  const [error, setError] = useState<string | null>(null);
  const busy = saveDepartment.isPending || savePosition.isPending;
  const noun = editing.kind === 'department' ? 'department' : 'position';

  const save = async () => {
    try {
      if (editing.kind === 'department') {
        const parsed = departmentInputSchema.safeParse({ name });
        if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the name.');
        await saveDepartment.mutateAsync({ id: editing.id, input: parsed.data });
      } else {
        const parsed = positionInputSchema.safeParse({
          title: name,
          departmentId: departmentId || null,
        });
        if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the title.');
        await savePosition.mutateAsync({ id: editing.id, input: parsed.data });
      }
      toast.success(`${noun === 'department' ? 'Department' : 'Position'} saved.`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing.id ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>{editing.kind === 'department' ? 'Name' : 'Title'}</Label>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error && (
              <p id={`${id}-error`} className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          {editing.kind === 'position' && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-dept`}>Department</Label>
              <NativeSelect
                id={`${id}-dept`}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">None</option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
