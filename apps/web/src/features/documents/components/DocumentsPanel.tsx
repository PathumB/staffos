import {
  type Document,
  type DocumentOwnerType,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  documentUploadSchema,
  type ExpiryStatus,
  IDENTITY_DOCUMENT_TYPES,
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT,
} from '@staffos/shared';
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/action-dialog';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiClientError } from '@/lib/api-client';
import { useDeleteDocument, useDocuments, useOpenDocument, useUploadDocument } from '../api';

const EXPIRY: Record<ExpiryStatus, { label: string; variant: BadgeProps['variant'] }> = {
  VALID: { label: 'Valid', variant: 'success' },
  EXPIRING: { label: 'Expiring soon', variant: 'warning' },
  EXPIRED: { label: 'Expired', variant: 'destructive' },
};

const errorText = (error: unknown) =>
  error instanceof ApiClientError ? error.message : 'Something went wrong. Please try again.';

const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;

/** US-DOCS-01: an owner's documents. Identity types appear only for HR (and the employee). */
export function DocumentsPanel({
  ownerType,
  ownerId,
  canUpload,
}: {
  ownerType: DocumentOwnerType;
  ownerId: string;
  canUpload: boolean;
}) {
  const { can } = useAuth();
  const docs = useDocuments(ownerType, ownerId);
  const open = useOpenDocument();
  const remove = useDeleteDocument();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<Document | null>(null);
  const writable = canUpload && can('documents:write');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Documents</CardTitle>
        {writable && (
          <Button size="sm" onClick={() => setUploading(true)}>
            <Upload aria-hidden />
            Upload
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {docs.error ? (
          <ErrorState error={docs.error} onRetry={() => void docs.refetch()} />
        ) : !docs.data ? (
          <div role="status" className="h-20 animate-pulse rounded-md bg-muted">
            <span className="sr-only">Loading documents…</span>
          </div>
        ) : docs.data.length === 0 ? (
          <EmptyState title="No documents yet" />
        ) : (
          <ul className="divide-y text-sm">
            {docs.data.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="flex min-w-0 items-start gap-2.5">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {DOCUMENT_TYPE_LABELS[d.type]}
                      {d.number && (
                        <span className="font-normal text-muted-foreground"> · {d.number}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.fileName} · {size(d.sizeBytes)}
                      {d.expiryDate && ` · expires ${d.expiryDate}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {d.expiryStatus && (
                    <Badge variant={EXPIRY[d.expiryStatus].variant}>
                      {EXPIRY[d.expiryStatus].label}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Download ${DOCUMENT_TYPE_LABELS[d.type]}`}
                    disabled={open.isPending}
                    onClick={() =>
                      open.mutate(d.id, { onError: (error) => toast.error(errorText(error)) })
                    }
                  >
                    <Download aria-hidden />
                  </Button>
                  {writable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${DOCUMENT_TYPE_LABELS[d.type]}`}
                      onClick={() => setDeleting(d)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Files are private. Downloads use a link valid for 5 minutes and are recorded in the audit
          log.
        </p>
      </CardContent>
      {uploading && (
        <UploadDialog ownerType={ownerType} ownerId={ownerId} onClose={() => setUploading(false)} />
      )}
      <ActionDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Delete ${DOCUMENT_TYPE_LABELS[deleting.type]}?` : ''}
        description="It is removed from this list; the audit history keeps a record."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success('Document deleted.');
          } catch (error) {
            toast.error(errorText(error));
          }
        }}
      />
    </Card>
  );
}

/** Mounted only while open, so the form starts empty each time. */
function UploadDialog({
  ownerType,
  ownerId,
  onClose,
}: {
  ownerType: DocumentOwnerType;
  ownerId: string;
  onClose: () => void;
}) {
  const id = useId();
  const { can } = useAuth();
  const upload = useUploadDocument();
  const types = (Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).filter(
    (t) =>
      (can('documents:read-identity') || !IDENTITY_DOCUMENT_TYPES.includes(t)) &&
      (ownerType === 'CANDIDATE' || t !== 'CV'),
  );
  const [type, setType] = useState<DocumentType>(types[0]!);
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!file) return setError('Choose a file to upload.');
    if (file.size > MAX_UPLOAD_BYTES) return setError('Files can be at most 10 MB.');
    const fields = { ownerType, ownerId, type, number, issueDate, expiryDate };
    const parsed = documentUploadSchema.safeParse(fields);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form.');
    try {
      const doc = await upload.mutateAsync({ fields, file });
      if (doc.warnings?.includes('ALREADY_EXPIRED')) {
        toast.warning('Saved, but this document has already expired.');
      } else {
        toast.success('Document uploaded.');
      }
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>PDF, Word (.docx), JPG or PNG, up to 10 MB.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2"
            >
              {error}
            </p>
          )}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-file`}>File</Label>
            <Input
              id={`${id}-file`}
              type="file"
              accept={UPLOAD_ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-type`}>Type</Label>
            <NativeSelect
              id={`${id}-type`}
              value={type}
              onChange={(e) => setType(e.target.value as DocumentType)}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {DOCUMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-number`}>
              Number <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`${id}-number`}
              value={number}
              maxLength={50}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-issue`}>
              Issue date <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`${id}-issue`}
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-expiry`}>
              Expiry date <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`${id}-expiry`}
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={upload.isPending}>
              {upload.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
