import { normalizeMcqAnswer } from "@/lib/exam-answer";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  FileText,
  Clock,
  History,
  Loader2,
  Calendar,
  User,
  GraduationCap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RichView } from "@/components/rich/RichView";
import { ExamSubmissionStatus } from "./ExamSubmissionStatus";

interface Props {
  exam: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproveAndPublish: (exam: any) => void;
  onSendBack: (exam: any) => void;
}

export function ExamReviewDialog({ exam, open, onOpenChange, onApproveAndPublish, onSendBack }: Props) {
  const [activeTab, setActiveTab] = useState<"paper" | "history">("paper");

  // Query attached questions for this exam
  const { data: questions = [], isLoading: loadingQuestions } = useQuery({
    queryKey: ["exam-review-questions", exam?.id],
    enabled: !!exam?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .eq("exam_id", exam.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Query audit history
  const { data: reviewHistory = [], isLoading: loadingHistory } = useQuery({
    queryKey: ["exam-review-history", exam?.id],
    enabled: !!exam?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_review_history")
        .select("*, profiles:actor_id(full_name)")
        .eq("exam_id", exam.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (!exam) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader className="pb-2 border-b">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Review Complete Exam Paper: {exam.title}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {exam.classes?.name || "Class"} • {exam.subjects?.name || "Subject"}
                </span>
                <span>•</span>
                <span>Duration: {exam.duration_minutes || 60}m</span>
                <span>•</span>
                <span>Max Marks: {exam.max_score || 100} pts</span>
              </div>
            </div>
            <ExamSubmissionStatus status={exam.status} feedback={exam.review_feedback} />
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="flex-1 flex flex-col min-h-0 pt-2">
          <TabsList className="w-full justify-start border-b rounded-none h-9 bg-transparent p-0 gap-4">
            <TabsTrigger value="paper" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 text-xs">
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Exam Paper Preview ({questions.length} Questions)
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 text-xs">
              <History className="h-3.5 w-3.5 mr-1.5" /> Review Audit Trail ({reviewHistory.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="paper" className="flex-1 min-h-0 mt-3">
            <ScrollArea className="h-[50vh] pr-4">
              <div className="space-y-4">
                {/* Instructions */}
                {exam.instructions && (
                  <Card className="p-3 bg-muted/40 text-xs">
                    <h4 className="font-semibold mb-1 flex items-center gap-1.5 text-foreground">
                      <GraduationCap className="h-4 w-4 text-primary" /> Examination Instructions
                    </h4>
                    <RichView content={exam.instructions} />
                  </Card>
                )}

                {/* Questions List */}
                {loadingQuestions ? (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading exam paper questions...
                  </div>
                ) : questions.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground border rounded-lg bg-muted/20">
                    No individual questions attached directly. (Questions drawn dynamically from Question Bank during exam execution).
                  </div>
                ) : (
                  questions.map((q: any, idx: number) => (
                    <Card key={q.id || idx} className="p-4 space-y-2 text-xs border hover:border-primary/40">
                      <div className="flex items-center justify-between gap-2 border-b pb-2">
                        <span className="font-bold text-sm text-primary">Question {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize text-[10px]">
                            {q.question_type || q.type || "MCQ"}
                          </Badge>
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 text-[10px]">
                            {q.marks || 1} {q.marks === 1 ? "Mark" : "Marks"}
                          </Badge>
                        </div>
                      </div>

                      <div className="pt-1">
                        <RichView content={q.question_text || q.text || ""} />
                      </div>

                      {/* Multiple Choice Options */}
                      {Array.isArray(q.options) && q.options.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t mt-2">
                          {q.options.map((opt: any, optIdx: number) => {
                            const optText = typeof opt === "string" ? opt : opt.text;
                            const isCorrect = normalizeMcqAnswer(q.correct_answer, q.options) === String.fromCharCode(65 + optIdx);
                            return (
                              <div
                                key={optIdx}
                                className={`p-2 rounded border flex items-center gap-2 text-xs ${
                                  isCorrect ? "bg-emerald-50 border-emerald-300 font-medium text-emerald-900" : "bg-background"
                                }`}
                              >
                                <Badge variant={isCorrect ? "default" : "outline"} className={isCorrect ? "bg-emerald-600 text-white" : ""}>
                                  {String.fromCharCode(65 + optIdx)}
                                </Badge>
                                <RichView content={optText} className="inline text-xs" />
                                {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-emerald-600 shrink-0" />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="flex-1 min-h-0 mt-3">
            <ScrollArea className="h-[50vh] pr-4">
              {loadingHistory ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading review history...
                </div>
              ) : reviewHistory.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground border rounded-lg bg-muted/20">
                  No review audit history recorded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {reviewHistory.map((item: any) => (
                    <Card key={item.id} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-medium">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{item.profiles?.full_name || "User"}</span>
                          <Badge
                            variant={item.action === "approved_published" ? "default" : item.action === "sent_back" ? "destructive" : "outline"}
                            className="capitalize text-[10px]"
                          >
                            {item.action.replace("_", " ")}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {item.feedback && (
                        <div className="mt-1 p-2 rounded bg-muted text-foreground text-xs italic">
                          "{item.feedback}"
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-3 border-t gap-2 flex-wrap justify-between">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>

          <div className="flex items-center gap-2">
            {exam.status === "pending_review" && (
              <>
                <Button variant="outline" size="sm" className="text-rose-700 border-rose-300 hover:bg-rose-50" onClick={() => onSendBack(exam)}>
                  <AlertCircle className="h-4 w-4 mr-1" /> Send Back to Draft
                </Button>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onApproveAndPublish(exam)}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve &amp; Publish Exam
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
