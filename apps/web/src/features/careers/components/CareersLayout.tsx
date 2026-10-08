import { Link, Outlet } from 'react-router';

/** Public shell for the careers site: no staff navigation, no session needed. */
export function CareersLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/careers" className="text-base font-semibold tracking-tight">
            StaffOS <span className="font-normal text-muted-foreground">Careers</span>
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        StaffOS is a fictional staffing company used for a portfolio project.
      </footer>
    </div>
  );
}
