import { Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Textarea } from './ui/input';
import { Label } from './ui/label';

/**
 * Confirmation dialog for state changes, with an optional/required note (reject reason,
 * cancellation reason, approval comment). Resolves via `onConfirm(note)`.
 */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  note,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  note?: { label: string; required: boolean };
  onConfirm: (note: string | undefined) => Promise<void>;
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setValue('');
      setError(null);
    }
    onOpenChange(next);
  };

  const confirm = async () => {
    if (note?.required && !value.trim()) {
      setError('This field is required.');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(value.trim() || undefined);
      close(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {note && (
          <div className="grid gap-1.5">
            <Label htmlFor={id}>
              {note.label}
              {!note.required && (
                <span className="font-normal text-muted-foreground"> (optional)</span>
              )}
            </Label>
            <Textarea
              id={id}
              value={value}
              maxLength={1000}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error && (
              <p id={`${id}-error`} className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
