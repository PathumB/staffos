import type { OnboardingTask } from '@staffos/shared';
import { Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
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
import { ApiClientError } from '@/lib/api-client';
import { useAssignableUsers, useUpdateTask } from '../api';

/** HR: give a task to a specific person, or move its due date. Mounted only while open. */
export function TaskEditDialog({
  task,
  open,
  onOpenChange,
}: {
  task: OnboardingTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const users = useAssignableUsers(open);
  const update = useUpdateTask();
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id ?? '');
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      await update.mutateAsync({
        id: task.id,
        input: { assigneeId: assigneeId || null, dueDate },
      });
      toast.success('Task updated.');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>
            A named assignee is notified and can complete the task.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-assignee`}>Assigned to</Label>
            <NativeSelect
              id={`${id}-assignee`}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={users.isPending}
            >
              <option value="">Anyone with the task&apos;s role</option>
              {users.data?.data
                .filter((u) => !u.client)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-due`}>Due date</Label>
            <Input
              id={`${id}-due`}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={update.isPending || !dueDate}>
            {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
