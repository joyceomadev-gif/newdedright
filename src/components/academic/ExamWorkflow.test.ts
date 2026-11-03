import { describe, it, expect } from "vitest";

type ExamStatus = "draft" | "pending_review" | "published" | "closed";

interface ExamPaper {
  id: string;
  title: string;
  status: ExamStatus;
  published: boolean;
  question_count: number;
  submitted_by?: string | null;
  submitted_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_feedback?: string | null;
  history: { action: string; actor_id: string; feedback?: string | null }[];
}

function submitExamForReview(exam: ExamPaper, userId: string): ExamPaper {
  if (exam.status === "published") {
    throw new Error("Published exams cannot be resubmitted.");
  }
  if (exam.question_count === 0) {
    throw new Error("Cannot submit an empty exam paper. Please add questions before submitting.");
  }
  return {
    ...exam,
    status: "pending_review",
    submitted_by: userId,
    submitted_at: new Date().toISOString(),
    history: [...exam.history, { action: "submitted", actor_id: userId }],
  };
}

function sendExamBack(exam: ExamPaper, adminId: string, feedback: string): ExamPaper {
  if (!feedback || !feedback.trim()) {
    throw new Error("Please provide a feedback reason explaining what the teacher needs to correct.");
  }
  return {
    ...exam,
    status: "draft",
    reviewed_by: adminId,
    reviewed_at: new Date().toISOString(),
    review_feedback: feedback.trim(),
    history: [...exam.history, { action: "sent_back", actor_id: adminId, feedback: feedback.trim() }],
  };
}

function approveAndPublishExam(exam: ExamPaper, adminId: string): ExamPaper {
  return {
    ...exam,
    status: "published",
    published: true,
    reviewed_by: adminId,
    reviewed_at: new Date().toISOString(),
    history: [...exam.history, { action: "approved_published", actor_id: adminId }],
  };
}

describe("Teacher Exam Paper Submission & Academic Admin Approval Workflow", () => {
  it("executes valid lifecycle: Draft -> Pending Review -> Approved & Published", () => {
    let exam: ExamPaper = {
      id: "exam-1",
      title: "Mathematics Terminal Examination",
      status: "draft",
      published: false,
      question_count: 15,
      history: [],
    };

    // Teacher submits for review
    exam = submitExamForReview(exam, "teacher-1");
    expect(exam.status).toBe("pending_review");
    expect(exam.submitted_by).toBe("teacher-1");
    expect(exam.history).toHaveLength(1);
    expect(exam.history[0].action).toBe("submitted");

    // Admin approves and publishes
    exam = approveAndPublishExam(exam, "admin-1");
    expect(exam.status).toBe("published");
    expect(exam.published).toBe(true);
    expect(exam.reviewed_by).toBe("admin-1");
    expect(exam.history).toHaveLength(2);
    expect(exam.history[1].action).toBe("approved_published");
  });

  it("handles Rejection (Send Back) with mandatory feedback and permits teacher revision & resubmission", () => {
    let exam: ExamPaper = {
      id: "exam-2",
      title: "Physics CA2 Test",
      status: "draft",
      published: false,
      question_count: 8,
      history: [],
    };

    // 1st submission
    exam = submitExamForReview(exam, "teacher-2");
    expect(exam.status).toBe("pending_review");

    // Admin sends back with feedback
    exam = sendExamBack(exam, "hos-1", "Please adjust Section B mark allocation to match total score.");
    expect(exam.status).toBe("draft");
    expect(exam.review_feedback).toBe("Please adjust Section B mark allocation to match total score.");
    expect(exam.reviewed_by).toBe("hos-1");

    // Teacher revises questions and resubmits
    exam.question_count = 10;
    exam = submitExamForReview(exam, "teacher-2");
    expect(exam.status).toBe("pending_review");

    // Admin approves and publishes
    exam = approveAndPublishExam(exam, "hos-1");
    expect(exam.status).toBe("published");
    expect(exam.published).toBe(true);
    expect(exam.history).toHaveLength(4);
  });

  it("blocks submission of empty exam papers with 0 questions", () => {
    const emptyExam: ExamPaper = {
      id: "exam-3",
      title: "Empty Exam",
      status: "draft",
      published: false,
      question_count: 0,
      history: [],
    };

    expect(() => submitExamForReview(emptyExam, "teacher-1")).toThrow(
      "Cannot submit an empty exam paper. Please add questions before submitting."
    );
  });

  it("requires non-empty feedback string when sending an exam paper back", () => {
    const pendingExam: ExamPaper = {
      id: "exam-4",
      title: "Chemistry Exam",
      status: "pending_review",
      published: false,
      question_count: 10,
      history: [],
    };

    expect(() => sendExamBack(pendingExam, "admin-1", "   ")).toThrow(
      "Please provide a feedback reason explaining what the teacher needs to correct."
    );
  });
});
