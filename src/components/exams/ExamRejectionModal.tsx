import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  exam: { id: string; title: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ExamRejectionModal({ exam, open, onOpenChange, onSuccess }: Props) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSendBack() {
    if (!exam) return;
    if (!feedback.trim()) {
      toast.error("Please provide review feedback explaining what needs correction.");
      return;
    }

    try {
      setIsSubmitting(true);
      const { error } = await supabase.rpc("send_exam_back", {
        _exam_id: exam.id,
        _feedback: feedback.trim(),
      });
      if (error) throw error;

      toast.success(`Exam paper "${exam.title}" sent back to draft with feedback.`);
      setFeedback("");
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to send exam paper back");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <AlertCircle className="h-5 w-5" /> Send Back Exam Paper for Revision
          </DialogTitle>
          <DialogDescription className="text-xs">
            Reviewing paper: <strong>{exam?.title}</strong>. Provide clear feedback explaining what the teacher should adjust before resubmitting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reviewer Feedback / Correction Instructions *</Label>
            <Textarea
              placeholder="e.g. Please check Section B Question 4 mark allocation, or add 2 more MCQ options to Question 2."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" onClick={handleSendBack} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Confirm &amp; Send Back to Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
