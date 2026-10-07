import { forwardRef, useEffect, useState } from 'react';
import { aedToFils } from '@/lib/list-params';
import { Input } from './ui/input';

const toText = (fils: number | undefined | null) =>
  fils === undefined || fils === null ? '' : (fils / 100).toFixed(2);

/**
 * AED amount input whose form value is integer fils (money is never a float in StaffOS).
 * Keeps the typed text locally so "45." or "45.5" stay as typed while editing.
 */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
    value: number | undefined | null;
    onChange: (fils: number | undefined) => void;
  }
>(({ value, onChange, ...props }, ref) => {
  const [text, setText] = useState(() => toText(value));

  // Sync when the form is reset from outside (e.g. opening an edit dialog).
  useEffect(() => {
    setText((current) => (aedToFils(current) === (value ?? undefined) ? current : toText(value)));
  }, [value]);

  return (
    <Input
      ref={ref}
      {...props}
      type="number"
      min={0}
      step="0.01"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(aedToFils(e.target.value));
      }}
    />
  );
});
MoneyInput.displayName = 'MoneyInput';
