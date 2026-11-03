import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  Send,
  Loader2,
  Filter,
  Globe,
  Clock,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ExamSubmissionStatus } from "./ExamSubmissionStatus";
import { ExamReviewDialog } from "./ExamReviewDialog";
import { ExamRejectionModal } from "./ExamRejectionModal";

export function ExamReviewManager() {
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("pending_review");
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("all");

  // Dialog States
  const [reviewExam, setReviewExam] = useState<any | null>(null);
  const [sendBackExam, setSendBackExam] = useState<any | null>(null);

  // Queries
  const { data: classes = [] } = useQuery({
    queryKey: ["classes-list-exam-approval"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name").order("name");
      return data || [];
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-list-exam-approval"],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("id, name").order("name");
      return data || [];
    },
  });

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ["admin-exam-approval-list", statusFilter, selectedClassId, selectedSubjectId],
    queryFn: async () => {
      let q = supabase
        .from("exams")
        .select("*, classes:class_id(name), subjects:subject_id(name)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        if (statusFilter === "returned") {
          q = q.eq("status", "draft").not("review_feedback", "is", null);
        } else {
          q = q.eq("status", statusFilter as any);
        }
      }
      if (selectedClassId !== "all") {
        q = q.eq("class_id", selectedClassId);
      }
      if (selectedSubjectId !== "all") {
        q = q.eq("subject_id", selectedSubjectId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Approve & Publish Mutation
  const approveMutation = useMutation({
    mutationFn: async (examId: string) => {
      const { error } = await supabase.rpc("approve_and_publish_exam", { _exam_id: examId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exam paper approved and published successfully!");
      setReviewExam(null);
      qc.invalidateQueries({ queryKey: ["admin-exam-approval-list"] });
      qc.invalidateQueries({ queryKey: ["exams-list"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to approve exam paper"),
  });

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Academic Exam Paper Review &amp; Approval Console
            </h3>
            <p className="text-xs text-muted-foreground">
              Review completed exam papers, inspect attached questions/marks, approve and publish to students, or send back to teachers for revision.
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {[
            { id: "pending_review", label: "Pending Review", icon: Clock, color: "text-amber-600" },
            { id: "published", label: "Published", icon: Globe, color: "text-blue-600" },
            { id: "returned", label: "Returned for Revision", icon: RotateCcw, color: "text-rose-600" },
            { id: "draft", label: "Drafts", icon: AlertCircle, color: "text-gray-500" },
            { id: "all", label: "All Exam Papers", icon: Filter, color: "text-gray-600" },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                variant={statusFilter === tab.id ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(tab.id)}
                className="text-xs gap-1.5"
              >
                <Icon className={`h-3.5 w-3.5 ${statusFilter === tab.id ? "text-white" : tab.color}`} />
                {tab.label}
              </Button>
            );
          })}
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap gap-3 pt-2">
          <div className="w-48">
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="w-48">
            <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All subjects" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Exam Papers Data Table */}
      <Card className="p-0 overflow-hidden">
        <Table className="text-xs">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Exam Title</TableHead>
              <TableHead className="w-36">Class &amp; Subject</TableHead>
              <TableHead className="w-24 text-center">Type / Purpose</TableHead>
              <TableHead className="w-24 text-center">Duration</TableHead>
              <TableHead className="w-28 text-center">Max Score</TableHead>
              <TableHead className="w-36 text-center">Status</TableHead>
              <TableHead className="w-44 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading exam papers…</TableCell></TableRow>
            ) : exams.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No exam papers found matching criteria.</TableCell></TableRow>
            ) : (
              exams.map((e: any) => (
                <TableRow key={e.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">
                    <div>{e.title}</div>
                    {e.submitted_at && (
                      <div className="text-[10px] text-muted-foreground">
                        Submitted {new Date(e.submitted_at).toLocaleDateString()}
                      </div>
                    )}
                  </TableCell>

                  <TableCell>
                    <div>{e.classes?.name || "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{e.subjects?.name || "—"}</div>
                  </TableCell>

                  <TableCell className="text-center capitalize">
                    <Badge variant="outline" className="text-[10px]">{e.purpose || e.type || "exam"}</Badge>
                  </TableCell>

                  <TableCell className="text-center">{e.duration_minutes || 60}m</TableCell>
                  <TableCell className="text-center font-bold">{e.max_score} pts</TableCell>

                  <TableCell className="text-center">
                    <ExamSubmissionStatus status={e.status} feedback={e.review_feedback} reviewedAt={e.reviewed_at} compact />
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={() => setReviewExam(e)}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                      </Button>

                      {e.status === "pending_review" && (
                        <>
                          <Button
                            size="sm"
                            className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => approveMutation.mutate(e.id)}
                            disabled={approveMutation.isPending}
                          >
                            Approve
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] px-2 text-rose-700 border-rose-300 hover:bg-rose-50"
                            onClick={() => setSendBackExam(e)}
                          >
                            Send Back
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Review Dialog */}
      <ExamReviewDialog
        exam={reviewExam}
        open={!!reviewExam}
        onOpenChange={(open) => { if (!open) setReviewExam(null); }}
        onApproveAndPublish={(exam) => approveMutation.mutate(exam.id)}
        onSendBack={(exam) => { setReviewExam(null); setSendBackExam(exam); }}
      />

      {/* Send Back Rejection Modal */}
      <ExamRejectionModal
        exam={sendBackExam}
        open={!!sendBackExam}
        onOpenChange={(open) => { if (!open) setSendBackExam(null); }}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["admin-exam-approval-list"] });
          qc.invalidateQueries({ queryKey: ["exams-list"] });
        }}
      />
    </div>
  );
}
