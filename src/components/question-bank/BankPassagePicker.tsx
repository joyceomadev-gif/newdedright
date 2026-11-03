import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { RichEditor } from "@/components/rich/RichEditor";
import { RichView } from "@/components/rich/RichView";
import type { Json } from "@/integrations/supabase/types";
import { bankMediaEntries, bankPassageChoice } from "@/lib/question-bank-media";
import {
  bankStimuliOptions,
  createBankStimulus,
  type BankStimulus,
} from "@/lib/question-bank-stimuli";
import { BankMediaEditor, BankMediaView, useBankUploads } from "./BankMediaEditor";

export function BankPassageView({ passage }: { passage: BankStimulus }) {
  return (
    <section className="border-l-2 border-primary pl-4 space-y-3">
      <h3 className="font-semibold">{passage.title}</h3>
      {Array.isArray(passage.content_json) &&
        passage.content_json.map((item, i) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof item.html === "string" ? (
            <RichView key={i} content={item.html} />
          ) : null,
        )}
      <BankMediaView media={bankMediaEntries(passage.media)} />
    </section>
  );
}
export function BankPassagePicker({
  userId,
  classId,
  subjectId,
  value,
  change,
  disabled,
  onBusy,
}: {
  userId: string;
  classId: string;
  subjectId: string;
  value: string;
  change: (id: string) => void;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const query = useQuery(bankStimuliOptions(userId, classId, subjectId));
  const [creating, setCreating] = useState(false);
  const selected = query.data?.find((p) => p.id === value);
  return (
    <div className="space-y-3">
      <Label>Shared passage</Label>
      <div className="flex flex-wrap gap-2">
        <Select
          value={value || "none"}
          onValueChange={(id) => {
            // Radix's hidden form select can emit an empty value when options refresh.
            // Only the explicit "none" choice unlinks an existing passage.
            const next = bankPassageChoice(id);
            if (next !== undefined) change(next);
          }}
          disabled={disabled || !classId || !subjectId || query.isFetching}
        >
          <SelectTrigger aria-label="Shared passage" className="flex-1 min-w-0">
            <SelectValue placeholder="No shared passage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No shared passage</SelectItem>
            {value && !selected && <SelectItem value={value}>Passage unavailable</SelectItem>}
            {query.data?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !classId || !subjectId}
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? "Cancel passage" : "New passage"}
        </Button>
      </div>
      {query.isError && (
        <div role="alert">
          <p className="text-destructive">{query.error.message}</p>
          <Button type="button" variant="outline" onClick={() => void query.refetch()}>
            Retry passages
          </Button>
        </div>
      )}
      {selected && <BankPassageView passage={selected} />}
      {creating && (
        <PassageCreator
          key={`${classId}:${subjectId}`}
          userId={userId}
          classId={classId}
          subjectId={subjectId}
          onBusy={onBusy}
          onSaved={async (p) => {
            await query.refetch();
            change(p.id);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
function PassageCreator({
  userId,
  classId,
  subjectId,
  onSaved,
  onBusy,
}: {
  userId: string;
  classId: string;
  subjectId: string;
  onSaved: (passage: BankStimulus) => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [media, setMedia] = useState<Json[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uploads = useBankUploads(userId);
  useEffect(() => {
    onBusy(busy || uploads.busy);
    return () => onBusy(false);
  }, [busy, uploads.busy, onBusy]);
  return (
    <div className="border-y py-4 space-y-3" aria-label="New shared passage">
      <Label htmlFor="bank-passage-title">Passage title</Label>
      <Input
        id="bank-passage-title"
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Label>Passage text</Label>
      <RichEditor value={html} onChange={setHtml} placeholder="Passage text" />
      <BankMediaEditor media={media} change={setMedia} uploads={uploads} disabled={busy} />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        disabled={busy || uploads.busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            // A lost response may still mean the insert committed. Never delete its files automatically.
            uploads.commit();
            const passage = await createBankStimulus(
              userId,
              classId,
              subjectId,
              title,
              html,
              media,
            );
            uploads.commit();
            await onSaved(passage);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to save passage.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : "Save passage"}
      </Button>
    </div>
  );
}
