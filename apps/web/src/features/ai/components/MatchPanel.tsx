import { AI_SUGGESTION_LABEL, STAGE_LABELS } from '@staffos/shared';
import { Loader2, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError } from '@/lib/api-client';
import { useMatchResults, useRunMatch } from '../api';

/**
 * US-APP-03: applicants ranked by match score. The score is mostly a transparent skills check;
 * AI adds a short explanation and a nudge of at most ±10. A recruiter decides.
 */
export function MatchPanel({ jobId }: { jobId: string }) {
  const results = useMatchResults(jobId, true);
  const run = useRunMatch(jobId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Best matches</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {AI_SUGGESTION_LABEL}: skills pre-score plus an AI adjustment of at most ±10. Name, age,
            gender and nationality are never used.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={run.isPending}
          onClick={() =>
            run.mutate(undefined, {
              onError: (e) =>
                toast.error(e instanceof ApiClientError ? e.message : 'Ranking failed.'),
            })
          }
        >
          {run.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Sparkles aria-hidden />
          )}
          Rank with AI
        </Button>
      </CardHeader>
      <CardContent>
        {results.error ? (
          <ErrorState error={results.error} onRetry={() => void results.refetch()} />
        ) : !results.data ? (
          <div role="status" className="h-24 animate-pulse rounded-md bg-muted">
            <span className="sr-only">Loading…</span>
          </div>
        ) : results.data.length === 0 ? (
          <EmptyState title="No active applicants to rank" />
        ) : (
          <ol className="grid gap-3">
            {results.data.map((r, i) => (
              <li key={r.applicationId} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">#{i + 1}</span>
                    <Link
                      to={`/applications/${r.applicationId}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {r.candidate.name}
                    </Link>
                    <Badge variant="secondary">
                      {STAGE_LABELS[r.stage as keyof typeof STAGE_LABELS] ?? r.stage}
                    </Badge>
                  </span>
                  <span className="text-right">
                    <span className="text-lg font-semibold tabular-nums">{r.score}</span>
                    <span className="text-xs text-muted-foreground">
                      {' '}
                      / 100 (skills {r.preScore}
                      {r.adjustment ? `, AI ${r.adjustment > 0 ? '+' : ''}${r.adjustment}` : ''})
                    </span>
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label={`Match score for ${r.candidate.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={r.score}
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full bg-primary" style={{ width: `${r.score}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.matched.map((s) => (
                    <Badge key={`m-${s}`} variant="success">
                      {s}
                    </Badge>
                  ))}
                  {r.partial.map((s) => (
                    <Badge key={`p-${s}`} variant="warning">
                      {s} (fewer years)
                    </Badge>
                  ))}
                  {r.missing.map((s) => (
                    <Badge key={`x-${s}`} variant="secondary">
                      <span className="line-through">{s}</span>
                      <span className="sr-only"> missing</span>
                    </Badge>
                  ))}
                </div>
                {r.explanation ? (
                  <p className="mt-2 text-muted-foreground">{r.explanation}</p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Skills check only. Use “Rank with AI” for an explanation.
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
