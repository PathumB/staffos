import {
  cvParseResponseSchema,
  LOW_CONFIDENCE,
  MAX_UPLOAD_BYTES,
  type ParsedCv,
} from '@staffos/shared';
import { Loader2, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { CandidateDraft } from './CandidateFormDialog';

/** Turns the parsed CV into form values and the list of fields to double-check. */
export function toDraft(
  parsed: ParsedCv | null,
): Pick<CandidateDraft, 'values' | 'lowConfidence' | 'aiAssisted'> {
  if (!parsed) return { values: {}, lowConfidence: new Set(), aiAssisted: false };
  const low = new Set<string>();
  const take = <T,>(name: string, f: { value: T; confidence: number } | null | undefined) => {
    if (!f) return undefined;
    if (f.confidence < LOW_CONFIDENCE) low.add(name);
    return f.value;
  };
  const years = take('totalExperienceMonths', parsed.totalYearsExperience);
  const seen = new Set<string>();
  return {
    aiAssisted: true,
    lowConfidence: low,
    values: {
      firstName: take('firstName', parsed.firstName) ?? '',
      lastName: take('lastName', parsed.lastName) ?? '',
      email: take('email', parsed.email) ?? '',
      phone: take('phone', parsed.phone) ?? '',
      currentTitle: take('currentTitle', parsed.currentTitle) ?? '',
      totalExperienceMonths: years === undefined ? undefined : Math.round(years * 12),
      skills: parsed.skills
        .filter((s) => {
          const key = s.name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 50)
        .map((s) => ({
          name: s.name.slice(0, 60),
          years: s.years == null ? undefined : Math.round(s.years),
        })),
      languages: parsed.languages.slice(0, 15),
    },
  };
}

/** US-CAND-01 step 1: upload the CV; the form opens pre-filled (or empty if AI can't help). */
export function CvUploadDialog({
  onClose,
  onParsed,
}: {
  onClose: () => void;
  onParsed: (draft: CandidateDraft) => void;
}) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return setError('Choose a CV to upload.');
    if (file.size > MAX_UPLOAD_BYTES) return setError('CVs can be at most 10 MB.');
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch('/ai/cv-parse', cvParseResponseSchema, {
        method: 'POST',
        body: form,
      });
      onParsed({ ...toDraft(res.parsed), cvToken: res.cvToken, fileName: res.fileName });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create candidate from CV</DialogTitle>
          <DialogDescription>
            PDF or Word, up to 10 MB. AI suggests the profile; you check and confirm it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-cv`}>CV file</Label>
            <Input
              id={`${id}-cv`}
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {busy && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Parsing…
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void upload()} disabled={busy}>
            <Sparkles aria-hidden />
            Upload and read
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
