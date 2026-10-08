import {
  DEFAULT_RUBRIC,
  type Feedback,
  feedbackInputSchema,
  RECOMMENDATION_LABELS,
  type Recommendation,
} from '@staffos/shared';
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
import { NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useSubmitFeedback } from '../api';

/** US-INT-03 scorecard: 1–5 per criterion, a recommendation and notes. Editable for 24 hours. */
export function FeedbackDialog({
  open,
  onOpenChange,
  interviewId,
  candidateName,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interviewId: string;
  candidateName: string;
  existing?: Feedback;
}) {
  const id = useId();
  const submit = useSubmitFeedback();
  const criteria = existing?.scores.map((s) => s.criterion) ?? [...DEFAULT_RUBRIC];
  // Mounted only while open (see InterviewsPanel), so state starts fresh from `existing`.
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(existing?.scores.map((s) => [s.criterion, String(s.score)]) ?? []),
  );
  const [recommendation, setRecommendation] = useState<Recommendation | ''>(
    existing?.recommendation ?? '',
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const parsed = feedbackInputSchema.safeParse({
      scores: criteria
        .filter((c) => scores[c])
        .map((criterion) => ({ criterion, score: Number(scores[criterion]) })),
      recommendation: recommendation || undefined,
      notes,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setError(
        first?.path[0] === 'recommendation'
          ? 'Choose a recommendation.'
          : (first?.message ?? 'Check the form.'),
      );
      return;
    }
    try {
      await submit.mutateAsync({ id: interviewId, input: parsed.data });
      toast.success(existing ? 'Feedback updated.' : 'Feedback submitted.');
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Feedback for {candidateName}</DialogTitle>
          <DialogDescription>
            {existing
              ? `You can edit this until ${formatDateTime(existing.editableUntil)}.`
              : 'Score what you assessed. You can edit your feedback for 24 hours.'}
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
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Scores (1 = poor, 5 = excellent)</legend>
            {criteria.map((c, index) => (
              <div key={c} className="grid grid-cols-[1fr_9rem] items-center gap-2">
                <Label htmlFor={`${id}-score-${index}`} className="font-normal">
                  {c}
                </Label>
                <NativeSelect
                  id={`${id}-score-${index}`}
                  value={scores[c] ?? ''}
                  onChange={(ev) => setScores((s) => ({ ...s, [c]: ev.target.value }))}
                >
                  <option value="">Not assessed</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Recommendation</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(RECOMMENDATION_LABELS).map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5"
                >
                  <input
                    type="radio"
                    name={`${id}-recommendation`}
                    className="size-4 accent-primary"
                    checked={recommendation === value}
                    onChange={() => setRecommendation(value as Recommendation)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-notes`}>
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id={`${id}-notes`}
              value={notes}
              maxLength={5000}
              onChange={(ev) => setNotes(ev.target.value)}
              className="min-h-24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {existing ? 'Save changes' : 'Submit feedback'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
