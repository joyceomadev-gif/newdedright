import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send, Loader2, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  exam: { id: string; title: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ExamSubmissionDialog({ exam, open, onOpenChange, onSuccess }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirmSubmit() {
    if (!exam) return;
    try {
      setIsSubmitting(true);
      const { error } = await supabase.rpc("submit_exam_for_review", { _exam_id: exam.id });
      if (error) throw error;

      toast.success(`Exam paper "${exam.title}" submitted for Academic Admin review!`);
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit exam paper for review");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <FileCheck className="h-5 w-5" /> Submit Exam Paper for Review?
          </DialogTitle>
          <DialogDescription className="text-xs pt-1">
            You are about to submit the complete exam paper <strong>"{exam?.title}"</strong> for Academic Admin review.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 text-xs space-y-2 text-muted-foreground">
          <p>
            Once submitted, the exam paper will enter <strong>Pending Review</strong> status and editing will be locked until the Academic Admin completes review or sends it back with feedback.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirmSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            Confirm &amp; Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
