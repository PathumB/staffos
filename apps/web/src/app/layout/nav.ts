import type { Permission } from '@staffos/shared';
import {
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardList,
  Contact,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';

/** `permission`: required; an array means any one of them is enough. */
export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission | Permission[];
};
/** Whether the user may see an item (any one permission of an array is enough). */
export function canSeeNavItem(item: NavItem, can: (p: Permission) => boolean): boolean {
  if (!item.permission) return true;
  return Array.isArray(item.permission) ? item.permission.some(can) : can(item.permission);
}

export type NavSection = { label?: string; items: NavItem[] };

/** Sidebar entries; each module adds its items here. Items are hidden without the permission. */
export const NAV: NavSection[] = [
  { items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'CRM',
    items: [
      { to: '/clients', label: 'Clients', icon: Building2, permission: 'clients:read' },
      {
        to: '/requests',
        label: 'Manpower requests',
        icon: ClipboardList,
        permission: 'manpower-requests:read',
      },
    ],
  },
  {
    label: 'Recruitment',
    items: [
      { to: '/jobs', label: 'Jobs', icon: Briefcase, permission: 'jobs:read' },
      { to: '/candidates', label: 'Candidates', icon: Contact, permission: 'candidates:read' },
      {
        to: '/interviews',
        label: 'Interviews',
        icon: CalendarClock,
        permission: ['interviews:write', 'interview-feedback:write'],
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/users', label: 'Users', icon: Users, permission: 'users:read' },
      {
        to: '/admin/roles',
        label: 'Roles & permissions',
        icon: ShieldCheck,
        permission: 'users:read',
      },
      { to: '/admin/audit-log', label: 'Audit log', icon: ScrollText, permission: 'audit:read' },
    ],
  },
];
