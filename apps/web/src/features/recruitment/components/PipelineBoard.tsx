import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  allowedNextStages,
  type ApplicationStage,
  type Pipeline,
  STAGE_LABELS,
} from '@staffos/shared';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useTransition } from '../api';

type Card = Pipeline['columns'][number]['applications'][number];
type PendingExit = { card: Card; to: 'REJECTED' | 'WITHDRAWN' };

const EXIT_STAGES = new Set<ApplicationStage>(['REJECTED', 'WITHDRAWN']);

function CandidateCard({
  card,
  canMove,
  onMove,
}: {
  card: Card;
  canMove: boolean;
  onMove: (card: Card, to: ApplicationStage) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: card,
    disabled: !canMove,
  });
  const targets = allowedNextStages(card.stage);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'rounded-md border bg-card p-2.5 text-sm shadow-sm',
        isDragging && 'z-10 opacity-80 shadow-md',
      )}
    >
      <div className="flex items-start gap-1.5">
        {canMove && (
          <button
            type="button"
            className="mt-0.5 cursor-grab rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Drag ${card.candidate.name}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <Link
            to={`/candidates/${card.candidate.id}`}
            className="block truncate font-medium text-primary underline-offset-4 hover:underline"
          >
            {card.candidate.name}
          </Link>
          {card.candidate.currentTitle && (
            <p className="truncate text-xs text-muted-foreground">{card.candidate.currentTitle}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {card.daysInStage === 0
              ? 'Today'
              : `${card.daysInStage} day${card.daysInStage === 1 ? '' : 's'} in stage`}
          </p>
        </div>
        {canMove && targets.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Move ${card.candidate.name}`}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {targets.map((stage) => (
                <DropdownMenuItem
                  key={stage}
                  className={EXIT_STAGES.has(stage) ? 'text-destructive' : undefined}
                  onSelect={() => onMove(card, stage)}
                >
                  {STAGE_LABELS[stage]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

function Column({
  stage,
  count,
  highlight,
  dimmed,
  children,
}: {
  stage: ApplicationStage;
  count: number;
  highlight: boolean;
  dimmed: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STAGE_LABELS[stage]}: ${count}`}
      className={cn(
        'flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40 transition-colors',
        highlight && 'border-primary/60 bg-primary/5',
        isOver && highlight && 'bg-primary/10',
        dimmed && 'opacity-50',
      )}
    >
      <h3 className="flex items-center justify-between px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {STAGE_LABELS[stage]}
        <span className="rounded-full bg-card px-2 py-0.5 tabular-nums">{count}</span>
      </h3>
      <ul className="flex min-h-24 flex-1 flex-col gap-2 p-2 pt-0">{children}</ul>
    </section>
  );
}

/**
 * Kanban for one job (US-APP-01/02). Drag a card or use its "Move to" menu (keyboard/touch
 * friendly). Only legal next stages light up; the API enforces the same rule and the board
 * refetches after every move, so a rejected move (409) simply snaps back.
 */
export function PipelineBoard({ pipeline, canMove }: { pipeline: Pipeline; canMove: boolean }) {
  const transition = useTransition();
  const [dragging, setDragging] = useState<Card | null>(null);
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const allowed = dragging ? allowedNextStages(dragging.stage) : [];

  const move = async (card: Card, to: ApplicationStage, reason?: string) => {
    if (EXIT_STAGES.has(to) && !reason) {
      setPendingExit({ card, to: to as PendingExit['to'] });
      return;
    }
    try {
      await transition.mutateAsync({
        id: card.id,
        input: { to: to as Exclude<ApplicationStage, 'APPLIED'>, version: card.version, reason },
      });
      toast.success(`${card.candidate.name} moved to ${STAGE_LABELS[to]}.`);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === 'STALE_VERSION'
          ? 'Someone else moved this candidate. The board has been refreshed.'
          : error instanceof ApiClientError
            ? error.message
            : 'Could not move the candidate.',
      );
    }
  };

  const onDragStart = (event: DragStartEvent) => setDragging(event.active.data.current as Card);
  const onDragEnd = (event: DragEndEvent) => {
    const card = event.active.data.current as Card;
    setDragging(null);
    const to = event.over?.id as ApplicationStage | undefined;
    if (!to || to === card.stage) return;
    if (!allowedNextStages(card.stage).includes(to)) {
      toast.error(
        `Can't move from ${STAGE_LABELS[card.stage]} to ${STAGE_LABELS[to]}. Candidates move one stage at a time.`,
      );
      return;
    }
    void move(card, to);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div
          className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3"
          role="list"
          aria-label="Pipeline stages"
        >
          {pipeline.columns.map((col) => (
            <Column
              key={col.stage}
              stage={col.stage}
              count={col.count}
              highlight={allowed.includes(col.stage)}
              dimmed={
                dragging !== null && col.stage !== dragging.stage && !allowed.includes(col.stage)
              }
            >
              {col.applications.map((card) => (
                <CandidateCard
                  key={card.id}
                  card={card}
                  canMove={canMove}
                  onMove={(c, to) => void move(c, to)}
                />
              ))}
            </Column>
          ))}
        </div>
      </DndContext>
      {pendingExit && (
        <ActionDialog
          open
          onOpenChange={(open) => !open && setPendingExit(null)}
          title={`${pendingExit.to === 'REJECTED' ? 'Reject' : 'Withdraw'} ${pendingExit.card.candidate.name}`}
          confirmLabel={pendingExit.to === 'REJECTED' ? 'Reject' : 'Withdraw'}
          destructive
          note={{ label: 'Reason', required: true }}
          onConfirm={(reason) => move(pendingExit.card, pendingExit.to, reason)}
        />
      )}
    </>
  );
}
