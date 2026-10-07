import type { ManpowerRequestStatus } from '@staffos/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const VARIANT: Record<ManpowerRequestStatus, BadgeProps['variant']> = {
  DRAFT: 'secondary',
  SUBMITTED: 'warning',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
  FULFILLED: 'default',
  CANCELLED: 'secondary',
};

export const REQUEST_STATUS_LABELS: Record<ManpowerRequestStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting review',
  PENDING_APPROVAL: 'Pending HR approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  FULFILLED: 'Fulfilled',
  CANCELLED: 'Cancelled',
};

export function RequestStatusBadge({ status }: { status: ManpowerRequestStatus }) {
  return <Badge variant={VARIANT[status]}>{REQUEST_STATUS_LABELS[status]}</Badge>;
}
