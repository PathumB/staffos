import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useMarkAllRead, useMarkRead, useRecentNotifications, useUnreadCount } from './api';

/** Header bell (US-NOTIF-01): unread count, the latest ten, mark read on open. */
export function NotificationBell() {
  const { can } = useAuth();
  const allowed = can('notifications:read');
  const [open, setOpen] = useState(false);
  const count = useUnreadCount(allowed);
  const recent = useRecentNotifications(allowed && open);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();
  if (!allowed) return null;

  const unread = count.data?.count ?? 0;
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className="relative">
          <Bell aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-destructive-foreground tabular-nums"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)]">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {recent.isPending ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : recent.error ? (
          <p className="px-2 py-6 text-center text-sm text-destructive">
            Couldn&apos;t load notifications.
          </p>
        ) : recent.data.data.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            You&apos;re all caught up.
          </p>
        ) : (
          recent.data.data.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="flex-col items-start gap-0.5"
              onSelect={() => {
                if (!n.readAt) markRead.mutate(n.id);
                if (n.link) navigate(n.link);
              }}
            >
              <span className={cn('text-sm', !n.readAt && 'font-semibold')}>
                {!n.readAt && <span className="sr-only">Unread: </span>}
                {n.title}
              </span>
              {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
              <span className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
