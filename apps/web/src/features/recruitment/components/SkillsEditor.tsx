import { Plus, X } from 'lucide-react';
import {
  type Control,
  type FieldValues,
  type Path,
  useFieldArray,
  type UseFormRegister,
} from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { optionalNumber } from '@/lib/list-params';

/**
 * Editable list of skills. Jobs have a weight (must/nice) and minimum years; candidates have
 * years of experience. Field names follow the shared schemas.
 */
export function SkillsEditor<T extends FieldValues>({
  control,
  register,
  name,
  mode,
  error,
}: {
  control: Control<T>;
  register: UseFormRegister<T>;
  name: Path<T>;
  mode: 'job' | 'candidate';
  error?: string;
}) {
  // react-hook-form's array typing can't follow a generic path; the shapes come from the schemas.
  const { fields, append, remove } = useFieldArray({ control, name: name as never });
  const field = (index: number, key: string) => `${name}.${index}.${key}` as Path<T>;

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Skills</legend>
      {fields.length === 0 && <p className="text-sm text-muted-foreground">No skills yet.</p>}
      {fields.map((f, index) => (
        <div
          key={f.id}
          className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_9rem_6rem_auto]"
        >
          <Input
            aria-label={`Skill ${index + 1}`}
            placeholder="e.g. Forklift licence"
            {...register(field(index, 'name'))}
          />
          {mode === 'job' ? (
            <NativeSelect
              aria-label={`Skill ${index + 1} weight`}
              {...register(field(index, 'weight'))}
            >
              <option value="MUST">Must have</option>
              <option value="NICE">Nice to have</option>
            </NativeSelect>
          ) : (
            <span className="hidden sm:block" />
          )}
          <Input
            aria-label={
              mode === 'job' ? `Skill ${index + 1} minimum years` : `Skill ${index + 1} years`
            }
            placeholder={mode === 'job' ? 'Min yrs' : 'Years'}
            type="number"
            min={0}
            {...register(field(index, mode === 'job' ? 'minYears' : 'years'), {
              setValueAs: optionalNumber,
            })}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove skill ${index + 1}`}
            onClick={() => remove(index)}
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() =>
          append((mode === 'job' ? { name: '', weight: 'MUST' } : { name: '' }) as never)
        }
      >
        <Plus aria-hidden />
        Add skill
      </Button>
    </fieldset>
  );
}
