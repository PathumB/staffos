import { HealthStatusCard } from '@/features/health/components/HealthStatusCard';
import { ThemeToggle } from '../components/ThemeToggle';

/** Placeholder landing page until the auth module brings the real app shell. */
export function HomePage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-base font-semibold tracking-tight">StaffOS</span>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Workforce and recruitment, end to end
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          From a client&apos;s manpower request to a hired worker deployed on site, timesheeted and
          invoiced.
        </p>

        <div className="mt-8 max-w-md">
          <HealthStatusCard />
        </div>
      </main>
    </div>
  );
}
