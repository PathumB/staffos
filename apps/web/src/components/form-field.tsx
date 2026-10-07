import { useId } from 'react';
import { cn } from '@/lib/utils';
import { Label } from './ui/label';

/**
 * Label + control + error/hint, wired for screen readers (aria-invalid, aria-describedby).
 * Usage: <FormField label="Email" error={errors.email?.message}>{(p) => <Input {...p} />}</FormField>
 */
export function FormField({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: (props: {
    id: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
