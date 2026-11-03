import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Send, Undo2, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ClassRow { id: string; name: string }
interface TermRow { id: string; name: string; session_id: string; is_current: boolean }
interface SessionRow { id: string; name: string; is_current: boolean }
interface Pub {
  id: string; status: "draft" | "approved" | "published";
  approved_at: string | null; approved_by: string | null;
  published_at: string | null; published_by: string | null;
  unpublished_at: string | null; unpublished_by: string | null;
  notes: string | null; updated_at: string; exam_type: string;
}
interface AuditRow { id: string; action: string; actor_user_id: string | null; notes: string | null; created_at: string }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "secondary",
  approved: "outline",
  published: "default",
};

export function ResultPublishingPanel() {
  const qc = useQueryClient();

  const { data: sessions } = useQuery({
    queryKey: ["pub-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });
  const { data: terms } = useQuery({
    queryKey: ["pub-terms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terms").select("id,name,session_id,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
  });
  const { data: classes } = useQuery({
    queryKey: ["pub-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const currentSession = (sessions ?? []).find((s) => s.is_current);
  const currentTerm = (terms ?? []).find((t) => t.is_current);
  const [sessionId, setSessionId] = useState<string | undefined>(currentSession?.id);
  const [termId, setTermId] = useState<string | undefined>(currentTerm?.id);
  const [classId, setClassId] = useState<string | undefined>();
  const [examType, setExamType] = useState<string>("combined");
  const [notes, setNotes] = useState<string>("");

  const effSession = sessionId ?? currentSession?.id;
  const effTerm = termId ?? currentTerm?.id;
  const termsForSession = useMemo(
    () => (terms ?? []).filter((t) => !effSession || t.session_id === effSession),
    [terms, effSession],
  );

  const { data: pub, refetch: refetchPub } = useQuery({
    queryKey: ["pub-current", effSession, effTerm, classId, examType],
    enabled: !!effSession && !!effTerm && !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("result_publications")
        .select("id,status,approved_at,approved_by,published_at,published_by,unpublished_at,unpublished_by,notes,updated_at,exam_type")
        .eq("session_id", effSession!).eq("term_id", effTerm!).eq("class_id", classId!).eq("exam_type", examType)
        .maybeSingle();
      if (error) throw error;
      return (data as Pub | null);
    },
  });

  const { data: audit } = useQuery({
    queryKey: ["pub-audit", pub?.id],
    enabled: !!pub?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("result_publication_audit")
        .select("id,action,actor_user_id,notes,created_at")
        .eq("publication_id", pub!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const { data: processedCount } = useQuery({
    queryKey: ["pub-processed-count", effSession, effTerm, classId, examType],
    enabled: !!effSession && !!effTerm && !!classId,
    queryFn: async () => {
      const { count, error } = await supabase.from("processed_results")
        .select("id", { count: "exact", head: true })
        .eq("session_id", effSession!).eq("term_id", effTerm!).eq("class_id", classId!).eq("exam_type", examType);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["pub-current"] });
    qc.invalidateQueries({ queryKey: ["pub-audit"] });
    qc.invalidateQueries({ queryKey: ["result-published"] });
    refetchPub();
  };

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("approve_results", {
        _session_id: effSession!, _term_id: effTerm!, _class_id: classId!, _exam_type: examType, _notes: notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Results approved"); setNotes(""); invalidateAll(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Approval failed"),
  });
  const publish = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("publish_results", {
        _session_id: effSession!, _term_id: effTerm!, _class_id: classId!, _exam_type: examType, _notes: notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Results published to students & parents"); setNotes(""); invalidateAll(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Publish failed"),
  });
  const unpublish = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("unpublish_results", {
        _session_id: effSession!, _term_id: effTerm!, _class_id: classId!, _exam_type: examType, _notes: notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Results unpublished"); setNotes(""); invalidateAll(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Unpublish failed"),
  });

  const status = pub?.status ?? "draft";
  const scopeReady = !!effSession && !!effTerm && !!classId;
  const canApprove = scopeReady && (processedCount ?? 0) > 0 && status === "draft";
  const canPublish = scopeReady && (processedCount ?? 0) > 0 && (status === "approved" || status === "draft");
  const canUnpublish = scopeReady && status === "published";

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Approve & Publish Results</h2>
          <p className="text-sm text-muted-foreground">Control when processed results become visible to students and parents.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Session">
            <Select value={sessionId} onValueChange={(v) => { setSessionId(v); setTermId(undefined); setClassId(undefined); }}>
              <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>{(sessions ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current ? " (current)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
              <SelectContent>{termsForSession.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_current ? " (current)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>{(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Exam type">
            <Select value={examType} onValueChange={setExamType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="combined">Combined (CA + Exam)</SelectItem>
                <SelectItem value="cbt">CBT only</SelectItem>
                <SelectItem value="written">Written only</SelectItem>
                <SelectItem value="practical">Practical only</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge variant={STATUS_STYLES[status] as never}>{status.toUpperCase()}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">Processed rows: <span className="font-medium text-foreground">{processedCount ?? 0}</span></div>
          {pub?.approved_at && <div className="text-xs text-muted-foreground">Approved {new Date(pub.approved_at).toLocaleString()}</div>}
          {pub?.published_at && <div className="text-xs text-muted-foreground">Published {new Date(pub.published_at).toLocaleString()}</div>}
        </div>

        <Field label="Notes (optional)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note for the audit log…" />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!canApprove || approve.isPending} onClick={() => approve.mutate()}>
            {approve.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}Approve
          </Button>
          <Button disabled={!canPublish || publish.isPending} onClick={() => publish.mutate()}>
            {publish.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Publish
          </Button>
          <Button variant="destructive" disabled={!canUnpublish || unpublish.isPending} onClick={() => unpublish.mutate()}>
            {unpublish.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}Unpublish
          </Button>
        </div>

        {scopeReady && (processedCount ?? 0) === 0 && (
          <p className="text-xs text-amber-600">No processed results found. Run Phase 2 processing before approving.</p>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-2 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Audit trail</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Notes</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(audit ?? []).length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No audit entries yet.</TableCell></TableRow>
              )}
              {(audit ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline">{a.action}</Badge></TableCell>
                  <TableCell className="text-sm">{a.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
