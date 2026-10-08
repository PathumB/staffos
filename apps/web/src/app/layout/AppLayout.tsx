import { ROLE_LABELS } from '@staffos/shared';
import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle, SheetContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { useTheme } from '../theme';
import { canSeeNavItem, NAV } from './nav';

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  return (
    <nav aria-label="Main" className="flex flex-col gap-6 p-3">
      {NAV.map((section, i) => {
        const items = section.items.filter((item) => canSeeNavItem(item, (p) => can(p)));
        if (items.length === 0) return null;
        return (
          <div key={section.label ?? i}>
            {section.label && (
              <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{section.label}</p>
            )}
            <ul className="grid gap-0.5">
              {items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        isActive ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground',
                      )
                    }
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  if (!user) return null;
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="gap-2 px-2"
          aria-label={`Account menu for ${user.firstName} ${user.lastName}`}
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </span>
          <span className="hidden text-sm sm:inline">{user.firstName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block">
            {user.firstName} {user.lastName}
          </span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {user.roles.map((r) => ROLE_LABELS[r]).join(', ')}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggleTheme}>
          {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Internal app shell: sidebar (drawer on mobile), top bar with the account menu. */
export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center px-5 text-base font-semibold tracking-tight">
          StaffOS
        </div>
        <Navigation />
      </aside>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent aria-describedby={undefined}>
          <DialogTitle className="flex h-14 items-center px-5 text-base">StaffOS</DialogTitle>
          <Navigation onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-card/95 px-3 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden />
          </Button>
          <span className="font-semibold md:hidden">StaffOS</span>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
