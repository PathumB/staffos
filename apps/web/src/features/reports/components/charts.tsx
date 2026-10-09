import {
  STAGE_LABELS,
  type ClientRevenue,
  formatFils,
  type HiringFunnel,
  type Widget,
} from '@staffos/shared';
import { Link } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';

// One accent colour from the theme tokens (CLAUDE.md §10); charts follow light/dark mode.
const ACCENT = 'var(--color-primary)';
const GRID = 'var(--color-border)';
const AXIS = { fontSize: 12, fill: 'var(--color-muted-foreground)' };
const tooltipStyle = {
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontSize: 12,
};

export function formatWidget(w: Pick<Widget, 'value' | 'format'>): string {
  switch (w.format) {
    case 'money':
      return formatFils(w.value);
    case 'days':
      return `${w.value} days`;
    case 'percent':
      return `${Math.round(w.value * 100)}%`;
    default:
      return w.value.toLocaleString('en-US');
  }
}

export function WidgetCard({ widget }: { widget: Widget }) {
  const body = (
    <CardContent className="grid gap-1 pt-4">
      <span className="text-sm text-muted-foreground">{widget.label}</span>
      <span className="text-2xl font-semibold tabular-nums">{formatWidget(widget)}</span>
      {widget.hint && <span className="text-xs text-muted-foreground">{widget.hint}</span>}
    </CardContent>
  );
  return (
    <Card className="h-full">
      {widget.link ? (
        <Link
          to={widget.link}
          className="block h-full rounded-lg hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

/** Funnel as horizontal bars; the table below is the accessible equivalent. */
export function FunnelChart({ funnel }: { funnel: HiringFunnel }) {
  const data = funnel.stages.map((s) => ({ name: STAGE_LABELS[s.stage], count: s.count }));
  return (
    <figure className="grid gap-2">
      <div className="h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} />
            <YAxis type="category" dataKey="name" width={90} tick={AXIS} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-muted)' }} />
            <Bar dataKey="count" name="Applications" fill={ACCENT} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {data.map((d) => `${d.name}: ${d.count}`).join(', ')}
      </figcaption>
      {funnel.conversion !== null && (
        <p className="text-sm text-muted-foreground">
          Applied → hired: {Math.round(funnel.conversion * 100)}%
        </p>
      )}
    </figure>
  );
}

export function RevenueChart({ months }: { months: ClientRevenue['byMonth'] }) {
  const data = months.map((m) => ({ month: m.month, aed: m.totalFils / 100 }));
  return (
    <figure className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} />
          <YAxis tick={AXIS} width={70} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => formatFils(Math.round(Number(v) * 100))}
          />
          <Line type="monotone" dataKey="aed" name="Invoiced" stroke={ACCENT} strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
      <figcaption className="sr-only">
        {data.map((d) => `${d.month}: AED ${d.aed}`).join(', ')}
      </figcaption>
    </figure>
  );
}

/** Generic chart for "Ask your data" results. */
export function ResultChart({
  type,
  rows,
  x,
  y,
}: {
  type: 'bar' | 'line';
  rows: Record<string, unknown>[];
  x: string;
  y: string;
}) {
  const data = rows.slice(0, 50).map((r) => ({ x: String(r[x] ?? ''), y: Number(r[y] ?? 0) }));
  return (
    <div className="h-64" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="x" tick={AXIS} />
            <YAxis tick={AXIS} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line dataKey="y" name={y} stroke={ACCENT} strokeWidth={2} />
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="x" tick={AXIS} />
            <YAxis tick={AXIS} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-muted)' }} />
            <Bar dataKey="y" name={y} fill={ACCENT} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
