import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, AlertTriangle, Globe, Send } from "lucide-react";

interface Props {
  status: string;
  feedback?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  compact?: boolean;
}

export function ExamSubmissionStatus({ status, feedback, reviewedAt, compact }: Props) {
  if (status === "pending_review") {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600 gap-1 text-white text-[11px]">
        <Clock className="h-3 w-3" /> Pending Review
      </Badge>
    );
  }

  if (status === "published") {
    return (
      <Badge className="bg-blue-600 hover:bg-blue-700 gap-1 text-white text-[11px]">
        <CheckCircle2 className="h-3 w-3" /> Published
      </Badge>
    );
  }

  if (status === "draft" && feedback) {
    if (compact) {
      return (
        <Badge variant="destructive" className="gap-1 text-[11px]">
          <AlertTriangle className="h-3 w-3" /> Returned for Revision
        </Badge>
      );
    }
    return (
      <div className="p-2.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-semibold text-rose-900">
          <AlertTriangle className="h-4 w-4 text-rose-600" />
          <span>Returned for Revision by Academic Admin</span>
        </div>
        <p className="text-rose-700 pl-5">{feedback}</p>
        {reviewedAt && (
          <p className="text-[10px] text-rose-500 pl-5">
            Feedback provided on {new Date(reviewedAt).toLocaleDateString()} at {new Date(reviewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 text-gray-600 text-[11px]">
      <Clock className="h-3 w-3" /> Draft
    </Badge>
  );
}
