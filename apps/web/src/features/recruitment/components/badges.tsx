import { type ApplicationStage, type JobStatus, STAGE_LABELS } from '@staffos/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const JOB_VARIANT: Record<JobStatus, BadgeProps['variant']> = {
  DRAFT: 'secondary',
  OPEN: 'success',
  ON_HOLD: 'warning',
  CLOSED: 'secondary',
  FILLED: 'default',
};
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  ON_HOLD: 'On hold',
  CLOSED: 'Closed',
  FILLED: 'Filled',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge variant={JOB_VARIANT[status]}>{JOB_STATUS_LABELS[status]}</Badge>;
}

const STAGE_VARIANT: Record<ApplicationStage, BadgeProps['variant']> = {
  APPLIED: 'secondary',
  SCREENING: 'secondary',
  SHORTLISTED: 'warning',
  INTERVIEW: 'warning',
  OFFER: 'warning',
  HIRED: 'success',
  REJECTED: 'destructive',
  WITHDRAWN: 'secondary',
};

export function StageBadge({ stage }: { stage: ApplicationStage }) {
  return <Badge variant={STAGE_VARIANT[stage]}>{STAGE_LABELS[stage]}</Badge>;
}
