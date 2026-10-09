import type { Permission } from '@staffos/shared';
import {
  Briefcase,
  Building2,
  CalendarClock,
  Clock,
  CheckSquare,
  ClipboardList,
  Contact,
  FileClock,
  HardHat,
  IdCard,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Network,
  Webhook,
  Workflow,
  Zap,
  Receipt,
  ScrollText,
  ShieldCheck,
  Sparkles,
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
  {
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/approvals', label: 'My approvals', icon: CheckSquare },
    ],
  },
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
    label: 'People',
    items: [
      { to: '/employees', label: 'Employees', icon: IdCard, permission: 'employees:read' },
      { to: '/onboarding', label: 'Onboarding', icon: ListChecks, permission: 'onboarding:read' },
      {
        to: '/documents/expiring',
        label: 'Expiring documents',
        icon: FileClock,
        permission: 'onboarding-templates:manage',
      },
      {
        to: '/departments',
        label: 'Departments',
        icon: Network,
        permission: 'onboarding-templates:manage',
      },
    ],
  },
  {
    label: 'Workforce',
    items: [
      { to: '/deployments', label: 'Deployments', icon: HardHat, permission: 'deployments:read' },
      { to: '/timesheets', label: 'Timesheets', icon: Clock, permission: 'timesheets:read' },
      { to: '/invoices', label: 'Invoices', icon: Receipt, permission: 'invoices:read' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/ai-usage', label: 'AI usage', icon: Sparkles, permission: 'ai:usage-read' },
      { to: '/admin/users', label: 'Users', icon: Users, permission: 'users:read' },
      {
        to: '/admin/roles',
        label: 'Roles & permissions',
        icon: ShieldCheck,
        permission: 'users:read',
      },
      {
        to: '/admin/workflows',
        label: 'Approval chains',
        icon: Workflow,
        permission: 'workflows:manage',
      },
      {
        to: '/admin/automations',
        label: 'Automations',
        icon: Zap,
        permission: 'automations:manage',
      },
      { to: '/admin/webhooks', label: 'Webhooks', icon: Webhook, permission: 'webhooks:manage' },
      { to: '/admin/audit-log', label: 'Audit log', icon: ScrollText, permission: 'audit:read' },
    ],
  },
];
