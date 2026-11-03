import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, PlayCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type VisibleExam = {
  id: string;
  title: string;
  type: "cbt" | "written" | "practical" | "oral";
  purpose: string;
  subject_id: string;
  subject_name: string | null;
  class_id: string;
  opens_at: string;
  closes_at: string;
  release_at: string;
  duration_minutes: number | null;
  max_score: number;
  time_zone: string;
  is_mandatory: boolean;
  allow_late_entry: boolean;
  allow_resume: boolean;
  instructions: string | null;
  attempt_status: string | null;
  attempt_id: string | null;
};

type Status =
  | "upcoming"
  | "ready"
  | "in_progress"
  | "submitted"
  | "completed"
  | "expired";

function computeStatus(exam: VisibleExam, now: number): Status {
  const start = new Date(exam.opens_at).getTime();
  const end = new Date(exam.closes_at).getTime();
  const attempt = exam.attempt_status;
  if (attempt === "in_progress") return "in_progress";
  if (attempt === "submitted" || attempt === "auto_submitted") return "submitted";
  if (attempt === "completed") return "completed";
  if (now > end) return "expired";
  if (now < start) return "upcoming";
  return "ready";
}

// Status → color token classes (using design tokens, no hardcoded colors)
const STATUS_STYLES: Record<Status, { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-primary/10 text-primary border-primary/30" },
  ready: { label: "Ready to Start", className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30" },
  in_progress: { label: "In Progress", className: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30" },
  submitted: { label: "Submitted", className: "bg-muted text-muted-foreground border-border" },
  completed: { label: "Completed", className: "bg-emerald-700/10 text-emerald-800 dark:text-emerald-400 border-emerald-700/30" },
  expired: { label: "Expired", className: "bg-destructive/10 text-destructive border-destructive/30" },
};

function fmtDT(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: tz || undefined,
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function PublishedExamsPanel({ onOpenCbt }: { onOpenCbt?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["student-visible-exams"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("student_visible_exams");
      if (error) throw error;
      return (data ?? []) as VisibleExam[];
    },

    refetchInterval: 30_000,
  });

  const exams = useMemo(() => data ?? [], [data]);

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Loading examinations…</div>
      </Card>
    );
  }

  if (exams.length === 0) {
    return (
      <Card className="p-4">
        <div className="text-sm font-medium mb-1">Published Examinations</div>
        <p className="text-xs text-muted-foreground">
          No examinations are available right now. Exams appear here 5 minutes before their start time.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold">Published Examinations</div>
          <div className="text-xs text-muted-foreground">
            Only examinations currently within their access window are shown.
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>Refresh</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {exams.map((e) => {
          const status = computeStatus(e, now);
          const style = STATUS_STYLES[status];
          const start = new Date(e.opens_at).getTime();
          // Late entry only restricts joining well after the exam opened; within
          // the access window a student may always start (or resume) the exam.
          const lateCutoff = e.allow_late_entry
            ? new Date(e.closes_at).getTime()
            : start + (e.duration_minutes ?? 0) * 60_000;
          const canStart =
            (status === "ready" || (status === "in_progress" && e.allow_resume)) &&
            now <= new Date(e.closes_at).getTime() &&
            (now <= lateCutoff || e.attempt_status === "in_progress");
          const showCountdown = now < start;
          return (
            <div
              key={e.id}
              className="rounded-lg border p-3 space-y-2 bg-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{e.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {e.subject_name ?? "Subject"} · {e.type.toUpperCase()}
                  </div>
                </div>
                <Badge variant="outline" className={style.className}>{style.label}</Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1"><Calendar className="h-3 w-3" />
                  {fmtDT(e.opens_at, e.time_zone)} → {fmtDT(e.closes_at, e.time_zone)}
                </div>
                <div className="flex items-center gap-1"><Clock className="h-3 w-3" />
                  Duration: {e.duration_minutes ?? "—"} min
                  {e.is_mandatory && <span className="ml-1 text-destructive">· Mandatory</span>}
                </div>
                {showCountdown && (
                  <div className="text-primary font-medium">
                    Starts in {fmtCountdown(start - now)}
                  </div>
                )}
              </div>
              {status === "expired" && (
                <div className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  This examination has expired.
                </div>
              )}
              <div className="pt-1">
                {status === "submitted" || status === "completed" ? (
                  <Button size="sm" variant="secondary" disabled className="w-full">
                    Already submitted
                  </Button>
                ) : status === "expired" ? (
                  <Button size="sm" variant="outline" disabled className="w-full">
                    Expired
                  </Button>
                ) : canStart ? (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      if (onOpenCbt) onOpenCbt();
                      else toast.info("Open the CBT tab to begin your examination.");
                    }}
                  >
                    <PlayCircle className="mr-1 h-4 w-4" />
                    {e.type === "cbt" ? "Start Examination" : "View Question Paper"}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled className="w-full">
                    This examination will be available {e.allow_late_entry ? "at" : ""} the scheduled time
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
