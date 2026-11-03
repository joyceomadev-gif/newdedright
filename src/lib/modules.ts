import {
  LayoutDashboard,
  Settings,
  GraduationCap,
  School,
  Users,
  UserCog,
  Wallet,
  CreditCard,
  ClipboardCheck,
  FileBarChart,
  BookOpen,
  MessageSquare,
  Heart,
  HeartHandshake,
  Stethoscope,
  User,
  Cog,
  KeyRound,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";

import type { AppRole } from "./auth-context";

export interface FunctionDef {
  code: string;
  label: string;
  description?: string;
}

export interface SubmoduleDef {
  slug: string;
  label: string;
  functions?: FunctionDef[];
}

export interface ModuleDef {
  slug: string;
  label: string;
  icon: LucideIcon;
  to: string;
  roles: AppRole[];
  submodules?: SubmoduleDef[];
  functions?: FunctionDef[];
}

const ADMINS: AppRole[] = ["super_admin", "admin", "admin1", "admin2", "admin3"];
const ADMINS_HOS: AppRole[] = [...ADMINS, "head_of_section"];
const ADMINS_TEACHERS: AppRole[] = [...ADMINS, "head_of_section", "teacher"];
const EVERYONE: AppRole[] = [...ADMINS_TEACHERS, "student", "parent"];

// Navigation alias only: permissions remain owned by exams/question-bank.
export const QUESTION_BANK_NAV = {
  label: "Question Bank",
  to: "/question-bank",
  icon: BookOpen,
} as const;

export const MODULES: ModuleDef[] = [
  { slug: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/dashboard", roles: EVERYONE },
  {
    slug: "administration",
    label: "Administration",
    icon: Settings,
    to: "/administration",
    roles: ADMINS,
    submodules: [
      {
        slug: "roles-permissions",
        label: "Roles & Permissions Manager",
        functions: [{ code: "manage_roles", label: "Create & Manage Custom Roles" }],
      },
      {
        slug: "user-management",
        label: "User Account Management",
        functions: [{ code: "assign_user_roles", label: "Assign User Roles to Accounts" }],
      },
      { slug: "audit-logs", label: "System Audit Logs" },
    ],
  },
  { slug: "report-templates", label: "Report Templates", icon: FileBarChart, to: "/report-templates", roles: ADMINS },
  {
    slug: "academics",
    label: "Academics",
    icon: GraduationCap,
    to: "/academics",
    roles: ADMINS_TEACHERS,
    submodules: [
      {
        slug: "assessment-structures",
        label: "Assessment Structure Config",
        functions: [{ code: "edit_assessment_structure", label: "Modify Assessment Components & Weights" }],
      },
      {
        slug: "grading-scales",
        label: "Grading Scale Manager",
        functions: [{ code: "edit_grading_scale", label: "Configure Grade Bands & Remarks" }],
      },
      { slug: "curriculum-setup", label: "Curriculum & Subjects" },
    ],
  },
  { slug: "classes", label: "Classes", icon: School, to: "/classes", roles: ADMINS_TEACHERS },
  { slug: "students", label: "Student Management", icon: Users, to: "/students", roles: ADMINS_TEACHERS },
  { slug: "parents", label: "Parents & Guardians", icon: HeartHandshake, to: "/parents", roles: ADMINS },
  { slug: "staff", label: "Staff Management", icon: UserCog, to: "/staff", roles: ADMINS },
  {
    slug: "finance",
    label: "Finance / Fees",
    icon: Wallet,
    to: "/finance",
    roles: ADMINS,
    submodules: [
      { slug: "fee-structures", label: "Fee Category Structures" },
      {
        slug: "payment-records",
        label: "Student Payment Ledger",
        functions: [
          { code: "record_payment", label: "Record Manual Fee Payment" },
          { code: "approve_discount", label: "Approve Fee Discount/Waiver" },
        ],
      },
    ],
  },
  { slug: "payment-transactions", label: "Payment Transactions", icon: CreditCard, to: "/payment-transactions", roles: ADMINS },
  {
    slug: "exams",
    label: "Exams / CBT",
    icon: ClipboardCheck,
    to: "/exams",
    roles: [...ADMINS_TEACHERS, "student"],
    submodules: [
      {
        slug: "question-bank",
        label: "Question Bank Builder",
        functions: [{ code: "create_exam", label: "Create & Edit CBT Exams" }],
      },
      {
        slug: "cbt-runner",
        label: "CBT Student Test Engine",
        functions: [
          { code: "publish_exam", label: "Publish Exam to Student Portal" },
          { code: "grade_theory", label: "Mark Theory/Essay Questions" },
        ],
      },
      {
        slug: "approval-workflow",
        label: "Exam Paper Approval Workflow",
        functions: [{ code: "approve_exam_paper", label: "Approve/Reject Submitted Exam Papers" }],
      },
    ],
  },
  {
    slug: "broadsheet",
    label: "Broadsheet Entry",
    icon: ClipboardCheck,
    to: "/broadsheet",
    roles: ADMINS_TEACHERS,
    functions: [
      { code: "enter_scores", label: "Enter CA & Exam Scores in Broadsheet" },
      { code: "publish_broadsheet", label: "Publish Broadsheet to Results" },
    ],
  },
  {
    slug: "reports",
    label: "Reports & Analytics",
    icon: FileBarChart,
    to: "/reports",
    roles: ADMINS_HOS,
    submodules: [
      {
        slug: "process-results",
        label: "Result Processing Engine",
        functions: [{ code: "process_results", label: "Execute Result Processing Calculation" }],
      },
      {
        slug: "class-broadsheet",
        label: "Class Broadsheet Report",
        functions: [{ code: "export_excel", label: "Export Excel Broadsheets" }],
      },
      {
        slug: "level-report-cards",
        label: "Terminal Level Report Cards",
        functions: [
          { code: "export_pdf", label: "Export PDF Reports" },
          { code: "approve_publish_results", label: "Approve & Publish Results to Student Portal" },
        ],
      },
    ],
  },
  { slug: "library", label: "Library", icon: BookOpen, to: "/library", roles: EVERYONE },
  { slug: "health", label: "Health", icon: Stethoscope, to: "/health", roles: ADMINS_TEACHERS },
  { slug: "lab", label: "Lab", icon: FlaskConical, to: "/lab", roles: [...ADMINS_TEACHERS, "student"] },

  { slug: "communication", label: "Communication", icon: MessageSquare, to: "/communication", roles: EVERYONE },
  { slug: "teacher", label: "Teacher Portal", icon: GraduationCap, to: "/teacher", roles: [...ADMINS, "teacher"] },
  { slug: "parent", label: "Parent Portal", icon: Heart, to: "/parent", roles: [...ADMINS, "parent"] },
  { slug: "student", label: "Student Portal", icon: User, to: "/student", roles: [...ADMINS, "teacher", "student"] },
  { slug: "settings", label: "Settings", icon: Cog, to: "/settings", roles: EVERYONE },
];
