import {
  type Emirate,
  EMIRATE_LABELS,
  formatFils,
  type JobCategory,
  JOB_CATEGORY_LABELS,
} from '@staffos/shared';
import { MapPin, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { useListParams } from '@/lib/list-params';
import { usePublicJobs } from '../api';

/** US-CAREERS-01: public job board, works without login and at 375 px. */
export function CareersPage() {
  const { get, update } = useListParams();
  const [search, setSearch] = useState(get('search') ?? '');
  const page = Number(get('page') ?? 1);
  const jobs = usePublicJobs({
    page,
    pageSize: 10,
    search: get('search'),
    emirate: get('emirate') as Emirate | undefined,
    category: get('category') as JobCategory | undefined,
  });

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== (get('search') ?? '')) update({ search: search.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const meta = jobs.data?.meta;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Open roles in the UAE</h1>
      <p className="mt-1 text-muted-foreground">
        Find your next role with our client companies across the Emirates.
      </p>

      <div className="mt-6 grid gap-2 sm:grid-cols-[1fr_12rem_12rem]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search jobs"
            placeholder="Job title, skill or location"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <NativeSelect
          aria-label="Emirate"
          value={get('emirate') ?? ''}
          onChange={(e) => update({ emirate: e.target.value || undefined })}
        >
          <option value="">All emirates</option>
          {Object.entries(EMIRATE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Category"
          value={get('category') ?? ''}
          onChange={(e) => update({ category: e.target.value || undefined })}
        >
          <option value="">All categories</option>
          {Object.entries(JOB_CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="mt-6">
        {jobs.error ? (
          <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
        ) : !jobs.data ? (
          <div role="status" className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
            ))}
            <span className="sr-only">Loading jobs…</span>
          </div>
        ) : jobs.data.data.length === 0 ? (
          <EmptyState title="No open roles match" description="Try another search or filter." />
        ) : (
          <ul className="grid gap-3">
            {jobs.data.data.map((j) => (
              <li key={j.slug}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="p-4 sm:p-5">
                    <Link
                      to={`/careers/${j.slug}`}
                      className="text-lg font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {j.title}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                      <MapPin className="size-4" aria-hidden />
                      {j.location}, {EMIRATE_LABELS[j.emirate]} · {JOB_CATEGORY_LABELS[j.category]}
                      {j.clientName && ` · ${j.clientName}`}
                    </p>
                    {(j.salaryMinFils || j.salaryMaxFils) && (
                      <p className="mt-1 text-sm tabular-nums">
                        {formatFils(j.salaryMinFils ?? j.salaryMaxFils, j.currency)}
                        {j.salaryMaxFils && j.salaryMinFils
                          ? ` – ${formatFils(j.salaryMaxFils, j.currency)}`
                          : ''}{' '}
                        / month
                      </p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => update({ page: String(page - 1) })}
          >
            Previous
          </Button>
          <span>
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => update({ page: String(page + 1) })}
          >
            Next
          </Button>
        </nav>
      )}
    </>
  );
}
