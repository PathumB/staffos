import { AI_SUGGESTION_LABEL, type InclusiveFlag, type JdDraftInput } from '@staffos/shared';
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useJdDraft } from '../api';

/**
 * US-AI-01: fills the description field with a draft the user edits; flags exclusionary wording.
 * Nothing is published until the job is saved and published by a person.
 */
export function JdDraftAssist({
  getInput,
  onDraft,
  className,
}: {
  getInput: () => JdDraftInput;
  onDraft: (draft: string) => void;
  className?: string;
}) {
  const draft = useJdDraft();
  const [flags, setFlags] = useState<InclusiveFlag[] | null>(null);

  const run = () => {
    const input = getInput();
    if (!input.title.trim()) return toast.error('Enter the job title first.');
    draft.mutate(input, {
      onSuccess: (res) => {
        onDraft(res.draft);
        setFlags(res.inclusiveLanguageFlags);
        toast.success(`${AI_SUGGESTION_LABEL} added to the description. Review it before saving.`);
      },
      onError: (e) => toast.error(e instanceof ApiClientError ? e.message : 'AI draft failed.'),
    });
  };

  return (
    <div className={cn('grid gap-2', className)}>
      <Button
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={draft.isPending}
        onClick={run}
      >
        {draft.isPending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Sparkles aria-hidden />
        )}
        Draft description with AI
      </Button>
      {flags && (
        <div role="status" className="rounded-md border p-2 text-xs">
          {flags.length === 0 ? (
            <p className="text-muted-foreground">Inclusive-language check: nothing flagged.</p>
          ) : (
            <>
              <p className="font-medium">Inclusive-language check: {flags.length} to review</p>
              <ul className="mt-1 grid gap-1">
                {flags.map((f) => (
                  <li key={f.term}>
                    “{f.term}”: {f.reason}. {f.suggestion}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
