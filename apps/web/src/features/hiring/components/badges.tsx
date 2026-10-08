import {
  INTERVIEW_STATUS_LABELS,
  type InterviewStatus,
  OFFER_STATUS_LABELS,
  type OfferStatus,
} from '@staffos/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const INTERVIEW_VARIANT: Record<InterviewStatus, BadgeProps['variant']> = {
  SCHEDULED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'secondary',
};

export function InterviewStatusBadge({ status }: { status: InterviewStatus }) {
  return <Badge variant={INTERVIEW_VARIANT[status]}>{INTERVIEW_STATUS_LABELS[status]}</Badge>;
}

const OFFER_VARIANT: Record<OfferStatus, BadgeProps['variant']> = {
  PENDING_APPROVAL: 'warning',
  APPROVED: 'default',
  REJECTED: 'destructive',
  SENT: 'default',
  ACCEPTED: 'success',
  DECLINED: 'destructive',
  WITHDRAWN: 'secondary',
};

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return <Badge variant={OFFER_VARIANT[status]}>{OFFER_STATUS_LABELS[status]}</Badge>;
}
