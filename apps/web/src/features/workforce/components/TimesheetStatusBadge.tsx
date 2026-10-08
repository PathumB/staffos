import { TIMESHEET_STATUS_LABELS, type TimesheetStatus } from '@staffos/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const VARIANT: Record<TimesheetStatus, BadgeProps['variant']> = {
  DRAFT: 'secondary',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
  INVOICED: 'default',
};

export function TimesheetStatusBadge({ status }: { status: TimesheetStatus }) {
  return <Badge variant={VARIANT[status]}>{TIMESHEET_STATUS_LABELS[status]}</Badge>;
}
