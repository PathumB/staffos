import { EMPLOYEE_STATUS_LABELS, type EmployeeStatus } from '@staffos/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const VARIANT: Record<EmployeeStatus, BadgeProps['variant']> = {
  ONBOARDING: 'warning',
  ACTIVE: 'success',
  ON_LEAVE: 'secondary',
  TERMINATED: 'destructive',
};

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  return <Badge variant={VARIANT[status]}>{EMPLOYEE_STATUS_LABELS[status]}</Badge>;
}
