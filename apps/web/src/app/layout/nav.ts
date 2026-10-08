import type { Permission } from '@staffos/shared';
import {
  Briefcase,
  Building2,
  ClipboardList,
  Contact,
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
    label: 'Recruitment',
    items: [
      { to: '/jobs', label: 'Jobs', icon: Briefcase, permission: 'jobs:read' },
      { to: '/candidates', label: 'Candidates', icon: Contact, permission: 'candidates:read' },
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
