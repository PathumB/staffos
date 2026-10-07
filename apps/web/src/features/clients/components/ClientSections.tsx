import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ActivityType,
  activityInputSchema,
  type Contact,
  contactInputSchema,
  EMIRATE_LABELS,
  projectInputSchema,
} from '@staffos/shared';
import { Loader2, Mail, MoreHorizontal, Phone, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { EmptyState, ErrorState } from '@/components/states';
import { FormField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useRequests } from '../../manpower-requests/api';
import { RequestStatusBadge } from '../../manpower-requests/components/status';
import {
  useActivities,
  useAddActivity,
  useAddProject,
  useContactAction,
  useContacts,
  useProjects,
  useSaveContact,
} from '../api';

const errorMessage = (error: unknown) =>
  error instanceof ApiClientError ? error.message : 'Something went wrong.';

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const Loading = () => (
  <div role="status" className="space-y-2">
    <div className="h-4 animate-pulse rounded bg-muted" />
    <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
    <span className="sr-only">Loading…</span>
  </div>
);

// ── Contacts ──

type ContactValues = z.input<typeof contactInputSchema>;

function ContactDialog({
  clientId,
  contact,
  open,
  onOpenChange,
}: {
  clientId: string;
  contact?: Contact;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const save = useSaveContact(clientId);
  const { register, handleSubmit, setError, formState } = useForm<ContactValues>({
    resolver: zodResolver(contactInputSchema),
    values: {
      firstName: contact?.firstName ?? '',
      lastName: contact?.lastName ?? '',
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
      jobTitle: contact?.jobTitle ?? '',
      isPrimary: contact?.isPrimary ?? false,
    },
  });
  const onSubmit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ id: contact?.id, input: contactInputSchema.parse(values) });
      toast.success(contact ? 'Contact updated.' : 'Contact added.');
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiClientError) {
        for (const [f, m] of Object.entries(error.fieldErrors))
          setError(f as keyof ContactValues, { message: m[0] });
      }
      toast.error(errorMessage(error));
    }
  });
  const e = formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? 'Edit contact' : 'Add contact'}</DialogTitle>
        </DialogHeader>
        <form
          id="contact-form"
          onSubmit={onSubmit}
          noValidate
          className="grid gap-4 sm:grid-cols-2"
        >
          <FormField label="First name" error={e.firstName?.message}>
            {(p) => <Input {...p} {...register('firstName')} />}
          </FormField>
          <FormField label="Last name" error={e.lastName?.message}>
            {(p) => <Input {...p} {...register('lastName')} />}
          </FormField>
          <FormField label="Email" error={e.email?.message}>
            {(p) => <Input {...p} {...register('email')} type="email" />}
          </FormField>
          <FormField label="Phone" error={e.phone?.message}>
            {(p) => <Input {...p} {...register('phone')} type="tel" />}
          </FormField>
          <FormField label="Job title" error={e.jobTitle?.message} className="sm:col-span-2">
            {(p) => <Input {...p} {...register('jobTitle')} />}
          </FormField>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="size-4 accent-primary" {...register('isPrimary')} />
            Primary contact
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="contact-form" disabled={formState.isSubmitting}>
            {formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContactsSection({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const contacts = useContacts(clientId);
  const action = useContactAction(clientId);
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);

  const run = async (contact: Contact, kind: 'invite' | 'delete') => {
    try {
      await action.mutateAsync({ id: contact.id, action: kind });
      toast.success(
        kind === 'invite' ? `Portal invitation sent to ${contact.email}.` : 'Contact removed.',
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <SectionCard
      title="Contacts"
      action={
        canWrite && (
          <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
            <Plus aria-hidden />
            Add
          </Button>
        )
      }
    >
      {contacts.error ? (
        <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
      ) : !contacts.data ? (
        <Loading />
      ) : contacts.data.length === 0 ? (
        <EmptyState title="No contacts yet" />
      ) : (
        <ul className="divide-y">
          {contacts.data.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                  {c.firstName} {c.lastName}
                  {c.isPrimary && (
                    <Badge variant="secondary">
                      <Star className="size-3" aria-hidden />
                      Primary
                    </Badge>
                  )}
                  {c.portalUser && (
                    <Badge variant={c.portalUser.status === 'ACTIVE' ? 'success' : 'warning'}>
                      Portal {c.portalUser.status.toLowerCase()}
                    </Badge>
                  )}
                </p>
                {c.jobTitle && <p className="text-muted-foreground">{c.jobTitle}</p>}
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <Mail className="size-3.5" aria-hidden />
                      {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <Phone className="size-3.5" aria-hidden />
                      {c.phone}
                    </a>
                  )}
                </p>
              </div>
              {canWrite && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for ${c.firstName} ${c.lastName}`}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(c)}>Edit</DropdownMenuItem>
                    {!c.portalUser && (
                      <DropdownMenuItem disabled={!c.email} onSelect={() => void run(c, 'invite')}>
                        Invite to client portal
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => void run(c, 'delete')}
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}
      <ContactDialog
        clientId={clientId}
        contact={editing === 'new' ? undefined : (editing ?? undefined)}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </SectionCard>
  );
}

// ── Activities ──

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  CALL: 'Call',
  MEETING: 'Meeting',
  EMAIL: 'Email',
  NOTE: 'Note',
};
type ActivityValues = z.input<typeof activityInputSchema>;

export function ActivitiesSection({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const activities = useActivities(clientId);
  const add = useAddActivity(clientId);
  const { register, handleSubmit, reset, formState } = useForm<ActivityValues>({
    resolver: zodResolver(activityInputSchema),
    defaultValues: { type: 'CALL', subject: '', body: '' },
  });
  const onSubmit = handleSubmit(async (values) => {
    try {
      await add.mutateAsync(activityInputSchema.parse(values));
      reset({ type: values.type, subject: '', body: '' });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  return (
    <SectionCard title="Activity">
      {canWrite && (
        <form onSubmit={onSubmit} noValidate className="mb-4 grid gap-2 rounded-md border p-3">
          <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
            <NativeSelect aria-label="Activity type" {...register('type')}>
              {Object.entries(ACTIVITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
            <Input
              aria-label="Subject"
              placeholder="What happened?"
              {...register('subject')}
              aria-invalid={formState.errors.subject ? true : undefined}
            />
          </div>
          <Textarea
            aria-label="Notes"
            placeholder="Notes (optional)"
            className="min-h-16"
            {...register('body')}
          />
          <Button
            type="submit"
            size="sm"
            className="justify-self-end"
            disabled={formState.isSubmitting}
          >
            Log activity
          </Button>
        </form>
      )}
      {activities.error ? (
        <ErrorState error={activities.error} onRetry={() => void activities.refetch()} />
      ) : !activities.data ? (
        <Loading />
      ) : activities.data.length === 0 ? (
        <EmptyState title="No activity yet" description="Calls, meetings and notes appear here." />
      ) : (
        <ol className="space-y-3">
          {activities.data.map((a) => (
            <li key={a.id} className="border-l-2 border-primary/40 pl-3 text-sm">
              <p className="font-medium">
                <span className="text-muted-foreground">{ACTIVITY_LABELS[a.type]} · </span>
                {a.subject}
              </p>
              {a.body && (
                <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{a.body}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(a.occurredAt)}
                {a.author && ` · ${a.author.name}`}
                {a.contact && ` · with ${a.contact.name}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

// ── Requests ──

export function ClientRequestsSection({
  clientId,
  onNew,
}: {
  clientId: string;
  onNew?: () => void;
}) {
  const requests = useRequests({ pageSize: 10, sort: '-createdAt', filter: { clientId } });
  return (
    <SectionCard
      title="Manpower requests"
      action={
        onNew && (
          <Button size="sm" variant="outline" onClick={onNew}>
            <Plus aria-hidden />
            New
          </Button>
        )
      }
    >
      {requests.error ? (
        <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
      ) : !requests.data ? (
        <Loading />
      ) : requests.data.data.length === 0 ? (
        <EmptyState title="No requests yet" />
      ) : (
        <ul className="divide-y text-sm">
          {requests.data.data.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <Link
                to={`/requests/${r.id}`}
                className="min-w-0 truncate text-primary underline-offset-4 hover:underline"
              >
                {r.headcount} × {r.roleTitle}
              </Link>
              <RequestStatusBadge status={r.status} />
            </li>
          ))}
          {requests.data.meta.total > 10 && (
            <li className="pt-2.5">
              <Link
                to={`/requests?clientId=${clientId}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                View all {requests.data.meta.total}
              </Link>
            </li>
          )}
        </ul>
      )}
    </SectionCard>
  );
}

// ── Projects ──

type ProjectValues = z.input<typeof projectInputSchema>;

export function ProjectsSection({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const projects = useProjects(clientId);
  const add = useAddProject(clientId);
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, setError, formState } = useForm<ProjectValues>({
    resolver: zodResolver(projectInputSchema),
    defaultValues: { name: '', code: '', location: '' },
  });
  const onSubmit = handleSubmit(async (values) => {
    try {
      await add.mutateAsync(projectInputSchema.parse(values));
      toast.success('Project added.');
      reset();
      setOpen(false);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'PROJECT_NAME_EXISTS')
        return setError('name', { message: error.message });
      toast.error(errorMessage(error));
    }
  });
  const e = formState.errors;

  return (
    <SectionCard
      title="Projects"
      action={
        canWrite && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus aria-hidden />
            Add
          </Button>
        )
      }
    >
      {projects.error ? (
        <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
      ) : !projects.data ? (
        <Loading />
      ) : projects.data.length === 0 ? (
        <EmptyState title="No projects yet" description="Sites where deployed workers go." />
      ) : (
        <ul className="divide-y text-sm">
          {projects.data.map((p) => (
            <li key={p.id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="font-medium">
                {p.name}
                {p.code && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{p.code}</span>
                )}
              </p>
              <p className="text-muted-foreground">
                {[p.location, p.emirate && EMIRATE_LABELS[p.emirate]].filter(Boolean).join(', ') ||
                  '—'}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add project</DialogTitle>
          </DialogHeader>
          <form
            id="project-form"
            onSubmit={onSubmit}
            noValidate
            className="grid gap-4 sm:grid-cols-2"
          >
            <FormField label="Name" error={e.name?.message} className="sm:col-span-2">
              {(p) => <Input {...p} {...register('name')} />}
            </FormField>
            <FormField label="Code" error={e.code?.message}>
              {(p) => <Input {...p} {...register('code')} />}
            </FormField>
            <FormField label="Emirate" error={e.emirate?.message}>
              {(p) => (
                <NativeSelect
                  {...p}
                  {...register('emirate', { setValueAs: (v) => v || undefined })}
                >
                  <option value="">—</option>
                  {Object.entries(EMIRATE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField label="Location" error={e.location?.message} className="sm:col-span-2">
              {(p) => <Input {...p} {...register('location')} />}
            </FormField>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="project-form" disabled={formState.isSubmitting}>
              Add project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
