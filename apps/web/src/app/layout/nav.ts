import type { Permission } from '@staffos/shared';
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';

export type NavItem = { to: string; label: string; icon: LucideIcon; permission?: Permission };
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
