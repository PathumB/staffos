import { AI_SUGGESTION_LABEL, type InterviewKit, type InterviewSummary } from '@staffos/shared';
import { ClipboardList, Loader2, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError } from '@/lib/api-client';
import { useInterviewKit, useInterviewSummary } from '../api';

const fail = (e: unknown) =>
  toast.error(e instanceof ApiClientError ? e.message : 'AI request failed.');

/**
 * US-INT-02/03 helpers on the application page. Output is labelled as a suggestion and is only
 * shown here; nothing is saved or decided automatically.
 */
export function AiInterviewTools({
  jobId,
  applicationId,
}: {
  jobId: string;
  applicationId: string;
}) {
  const kitCall = useInterviewKit();
  const summaryCall = useInterviewSummary();
  const [kit, setKit] = useState<InterviewKit | null>(null);
  const [summary, setSummary] = useState<InterviewSummary | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI interview help</CardTitle>
        <p className="text-xs text-muted-foreground">
          {AI_SUGGESTION_LABEL}. Edit or ignore anything; decisions stay with the panel.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={kitCall.isPending}
            onClick={() => kitCall.mutate(jobId, { onSuccess: setKit, onError: fail })}
          >
            {kitCall.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <ClipboardList aria-hidden />
            )}
            Interview kit
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={summaryCall.isPending}
            onClick={() =>
              summaryCall.mutate(applicationId, { onSuccess: setSummary, onError: fail })
            }
          >
            {summaryCall.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <ScrollText aria-hidden />
            )}
            Summarise feedback
          </Button>
        </div>

        {kit && (
          <section aria-label="Interview kit" className="grid gap-3">
            <div>
              <h3 className="font-medium">Technical questions</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                {kit.technical.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="font-medium">Behavioural questions</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                {kit.behavioural.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="font-medium">Scoring rubric</h3>
              <dl className="mt-1 grid gap-1">
                {kit.rubric.map((r) => (
                  <div key={r.criterion}>
                    <dt className="font-medium">{r.criterion}</dt>
                    <dd className="text-muted-foreground">{r.lookFor}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        )}

        {summary && (
          <section aria-label="Feedback summary" className="grid gap-2 rounded-md bg-muted/50 p-3">
            <p>{summary.summary}</p>
            {summary.strengths.length > 0 && (
              <div>
                <h3 className="font-medium">Strengths</h3>
                <ul className="list-disc pl-5">
                  {summary.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.concerns.length > 0 && (
              <div>
                <h3 className="font-medium">Concerns</h3>
                <ul className="list-disc pl-5">
                  {summary.concerns.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
