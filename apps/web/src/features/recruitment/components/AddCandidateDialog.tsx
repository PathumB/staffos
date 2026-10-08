import { Plus, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api-client';
import { useAddApplication, useCandidates } from '../api';
import { CandidateFormDialog } from './CandidateFormDialog';

/** Search existing candidates (or create one) and add them to the job's pipeline. */
export function AddCandidateDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const candidates = useCandidates(
    { search: debounced || undefined, pageSize: 8, sort: '-createdAt' },
    open,
  );
  const add = useAddApplication();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const addToJob = async (candidateId: string, name: string) => {
    try {
      await add.mutateAsync({ candidateId, jobId });
      toast.success(`${name} added to the pipeline.`);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not add the candidate.');
    }
  };

  return (
    <>
      <Dialog open={open && !creating} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add candidate</DialogTitle>
            <DialogDescription>They start in the Applied stage.</DialogDescription>
          </DialogHeader>
          <Input
            type="search"
            aria-label="Search candidates"
            placeholder="Search name, email, title or skill"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <ul className="max-h-80 divide-y overflow-y-auto" aria-busy={candidates.isFetching}>
            {candidates.data?.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {c.firstName} {c.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.currentTitle ?? c.email}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void addToJob(c.id, `${c.firstName} ${c.lastName}`)}
                  disabled={add.isPending}
                >
                  <Plus aria-hidden />
                  Add
                </Button>
              </li>
            ))}
            {candidates.data?.data.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                No candidates match.
              </li>
            )}
          </ul>
          <Button variant="ghost" className="justify-self-start" onClick={() => setCreating(true)}>
            <UserPlus aria-hidden />
            Create a new candidate
          </Button>
        </DialogContent>
      </Dialog>
      <CandidateFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(c) => {
          // A brand-new candidate is the end of this flow: add them and close everything.
          void addToJob(c.id, `${c.firstName} ${c.lastName}`);
          onOpenChange(false);
        }}
      />
    </>
  );
}
