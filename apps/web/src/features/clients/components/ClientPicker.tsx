import { useEffect, useId, useState } from 'react';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClients } from '../api';

/**
 * Search-then-select for clients: lists can grow past any page size, so the select only shows
 * matches for what was typed (server-side search, 20 at a time).
 */
export function ClientPicker({
  value,
  onChange,
  label = 'Client',
}: {
  value: string;
  onChange: (clientId: string) => void;
  label?: string;
}) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);
  const clients = useClients({ pageSize: 20, sort: 'name', search: search || undefined });

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id}-select`}>{label}</Label>
      <Input
        type="search"
        aria-label={`Search ${label.toLowerCase()}s`}
        placeholder="Type to search"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <NativeSelect
        id={`${id}-select`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={clients.isPending}
      >
        <option value="">{clients.isPending ? 'Loading…' : 'Select'}</option>
        {clients.data?.data.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
