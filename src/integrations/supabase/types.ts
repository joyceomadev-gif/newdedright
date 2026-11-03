export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          expires_at: string | null
          id: string
          posted_by: string | null
          published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expires_at?: string | null
          id?: string
          posted_by?: string | null
          published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expires_at?: string | null
          id?: string
          posted_by?: string | null
          published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      assessment_components: {
        Row: {
          category: string | null
          code: string
          created_at: string | null
          display_order: number | null
          id: string
          is_mandatory: boolean | null
          max_score: number
          name: string
          structure_id: string
          weight_percentage: number | null
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_mandatory?: boolean | null
          max_score: number
          name: string
          structure_id: string
          weight_percentage?: number | null
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_mandatory?: boolean | null
          max_score?: number
          name?: string
          structure_id?: string
          weight_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_components_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "assessment_structures"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_question_scores: {
        Row: {
          assessment_question_id: string
          ca_id: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          exam_id: string | null
          id: string
          recorded_at: string
          recorded_by: string | null
          score: number
          student_id: string
        }
        Insert: {
          assessment_question_id: string
          ca_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exam_id?: string | null
          id?: string
          recorded_at?: string
          recorded_by?: string | null
          score?: number
          student_id: string
        }
        Update: {
          assessment_question_id?: string
          ca_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exam_id?: string | null
          id?: string
          recorded_at?: string
          recorded_by?: string | null
          score?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_question_scores_assessment_question_id_fkey"
            columns: ["assessment_question_id"]
            isOneToOne: false
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          max_score: number
          position: number | null
          purpose: string
          question_text: string | null
          session_id: string | null
          subject_id: string
          term_id: string | null
          title: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          max_score?: number
          position?: number | null
          purpose: string
          question_text?: string | null
          session_id?: string | null
          subject_id: string
          term_id?: string | null
          title?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          max_score?: number
          position?: number | null
          purpose?: string
          question_text?: string | null
          session_id?: string | null
          subject_id?: string
          term_id?: string | null
          title?: string | null
        }
        Relationships: []
      }
      assessment_structures: {
        Row: {
          class_id: string | null
          created_at: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          education_level: string | null
          id: string
          is_default: boolean | null
          name: string
          session_id: string | null
          subject_id: string | null
          tenant_id: string | null
          term_id: string | null
          total_max_score: number | null
          updated_at: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          education_level?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          session_id?: string | null
          subject_id?: string | null
          tenant_id?: string | null
          term_id?: string | null
          total_max_score?: number | null
          updated_at?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          education_level?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          session_id?: string | null
          subject_id?: string | null
          tenant_id?: string | null
          term_id?: string | null
          total_max_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_structures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_structures_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_structures_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          academic_session_id: string
          assignment_id: string
          attachment_url: string | null
          content: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          score: number | null
          status: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at: string
        }
        Insert: {
          academic_session_id: string
          assignment_id: string
          attachment_url?: string | null
          content?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at?: string
        }
        Update: {
          academic_session_id?: string
          assignment_id?: string
          attachment_url?: string | null
          content?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          academic_session_id: string
          assigned_date: string
          attachment_url: string | null
          class_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          due_date: string | null
          id: string
          instructions: string | null
          max_score: number
          status: Database["public"]["Enums"]["assignment_status"]
          subject_id: string
          teacher_id: string | null
          term_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          academic_session_id: string
          assigned_date?: string
          attachment_url?: string | null
          class_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          max_score?: number
          status?: Database["public"]["Enums"]["assignment_status"]
          subject_id: string
          teacher_id?: string | null
          term_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string
          assigned_date?: string
          attachment_url?: string | null
          class_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          max_score?: number
          status?: Database["public"]["Enums"]["assignment_status"]
          subject_id?: string
          teacher_id?: string | null
          term_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          academic_session_id: string | null
          class_id: string | null
          created_at: string
          date: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          recorded_by: string | null
          remark: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Insert: {
          academic_session_id?: string | null
          class_id?: string | null
          created_at?: string
          date: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          recorded_by?: string | null
          remark?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Update: {
          academic_session_id?: string | null
          class_id?: string | null
          created_at?: string
          date?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          recorded_by?: string | null
          remark?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      book_loans: {
        Row: {
          academic_session_id: string | null
          book_id: string
          borrowed_date: string
          borrower_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          due_date: string
          fine_amount: number
          fine_note: string | null
          fine_paid: boolean
          id: string
          returned_date: string | null
        }
        Insert: {
          academic_session_id?: string | null
          book_id: string
          borrowed_date?: string
          borrower_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_date: string
          fine_amount?: number
          fine_note?: string | null
          fine_paid?: boolean
          id?: string
          returned_date?: string | null
        }
        Update: {
          academic_session_id?: string | null
          book_id?: string
          borrowed_date?: string
          borrower_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string
          fine_amount?: number
          fine_note?: string | null
          fine_paid?: boolean
          id?: string
          returned_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_loans_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          is_main: boolean
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          is_main?: boolean
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          is_main?: boolean
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      broadsheet_headers: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          session_id: string
          status: string
          term_id: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          session_id: string
          status?: string
          term_id: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          session_id?: string
          status?: string
          term_id?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadsheet_headers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadsheet_headers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadsheet_headers_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      broadsheet_student_comments: {
        Row: {
          class_id: string
          created_at: string
          header_id: string
          id: string
          principal_comment: string | null
          session_id: string
          student_id: string
          teacher_comment: string | null
          term_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          header_id: string
          id?: string
          principal_comment?: string | null
          session_id: string
          student_id: string
          teacher_comment?: string | null
          term_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          header_id?: string
          id?: string
          principal_comment?: string | null
          session_id?: string
          student_id?: string
          teacher_comment?: string | null
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadsheet_student_comments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadsheet_student_comments_header_id_fkey"
            columns: ["header_id"]
            isOneToOne: false
            referencedRelation: "broadsheet_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadsheet_student_comments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadsheet_student_comments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadsheet_student_comments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      broadsheets: {
        Row: {
          ca1: number | null
          ca2: number | null
          ca3: number | null
          class_id: string
          created_at: string
          exam_score: number | null
          header_id: string
          id: string
          principal_comment: string | null
          session_id: string
          student_id: string
          subject_id: string
          teacher_comment: string | null
          term_id: string
          total_ca: number | null
          total_score: number | null
          updated_at: string
        }
        Insert: {
          ca1?: number | null
          ca2?: number | null
          ca3?: number | null
          class_id: string
          created_at?: string
          exam_score?: number | null
          header_id: string
          id?: string
          principal_comment?: string | null
          session_id: string
          student_id: string
          subject_id: string
          teacher_comment?: string | null
          term_id: string
          total_ca?: number | null
          total_score?: number | null
          updated_at?: string
        }
        Update: {
          ca1?: number | null
          ca2?: number | null
          ca3?: number | null
          class_id?: string
          created_at?: string
          exam_score?: number | null
          header_id?: string
          id?: string
          principal_comment?: string | null
          session_id?: string
          student_id?: string
          subject_id?: string
          teacher_comment?: string | null
          term_id?: string
          total_ca?: number | null
          total_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadsheets_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadsheets_header_id_fkey"
            columns: ["header_id"]
            isOneToOne: false
            referencedRelation: "broadsheet_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadsheets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadsheets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadsheets_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadsheets_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      class_teachers: {
        Row: {
          class_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          is_primary: boolean
          staff_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          is_primary?: boolean
          staff_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          is_primary?: boolean
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_teachers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_teachers_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_teachers_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          branch_id: string | null
          class_teacher_id: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          level: Database["public"]["Enums"]["class_level"]
          name: string
          session_id: string | null
        }
        Insert: {
          branch_id?: string | null
          class_teacher_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          level: Database["public"]["Enums"]["class_level"]
          name: string
          session_id?: string | null
        }
        Update: {
          branch_id?: string | null
          class_teacher_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          level?: Database["public"]["Enums"]["class_level"]
          name?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_class_teacher_id_fkey"
            columns: ["class_teacher_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_class_teacher_id_fkey"
            columns: ["class_teacher_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      continuous_assessments: {
        Row: {
          academic_session_id: string
          assessment_date: string
          ca_type: Database["public"]["Enums"]["ca_type"]
          class_id: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          max_score: number
          recorded_by: string | null
          remark: string | null
          score: number
          student_id: string
          subject_id: string
          term_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          academic_session_id: string
          assessment_date?: string
          ca_type?: Database["public"]["Enums"]["ca_type"]
          class_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          max_score?: number
          recorded_by?: string | null
          remark?: string | null
          score: number
          student_id: string
          subject_id: string
          term_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          academic_session_id?: string
          assessment_date?: string
          ca_type?: Database["public"]["Enums"]["ca_type"]
          class_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          max_score?: number
          recorded_by?: string | null
          remark?: string | null
          score?: number
          student_id?: string
          subject_id?: string
          term_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuous_assessments_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuous_assessments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuous_assessments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuous_assessments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuous_assessments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum: {
        Row: {
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          learning_outcomes: string | null
          level: Database["public"]["Enums"]["class_level"]
          resources: string | null
          session_id: string | null
          subject_id: string | null
          title: string
          topics: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          learning_outcomes?: string | null
          level: Database["public"]["Enums"]["class_level"]
          resources?: string | null
          session_id?: string | null
          subject_id?: string | null
          title: string
          topics?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          learning_outcomes?: string | null
          level?: Database["public"]["Enums"]["class_level"]
          resources?: string | null
          session_id?: string | null
          subject_id?: string | null
          title?: string
          topics?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          role_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          role_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          role_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      equipment: {
        Row: {
          academic_session_id: string | null
          available_quantity: number
          category: string | null
          concentration: string | null
          condition: Database["public"]["Enums"]["equipment_condition"]
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          expiry_date: string | null
          hazard_class: string | null
          id: string
          item_type: Database["public"]["Enums"]["lab_item_type"]
          lab_id: string | null
          location: string | null
          min_quantity: number
          name: string
          notes: string | null
          serial_number: string | null
          total_quantity: number
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          available_quantity?: number
          category?: string | null
          concentration?: string | null
          condition?: Database["public"]["Enums"]["equipment_condition"]
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expiry_date?: string | null
          hazard_class?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["lab_item_type"]
          lab_id?: string | null
          location?: string | null
          min_quantity?: number
          name: string
          notes?: string | null
          serial_number?: string | null
          total_quantity?: number
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          available_quantity?: number
          category?: string | null
          concentration?: string | null
          condition?: Database["public"]["Enums"]["equipment_condition"]
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expiry_date?: string | null
          hazard_class?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["lab_item_type"]
          lab_id?: string | null
          location?: string | null
          min_quantity?: number
          name?: string
          notes?: string | null
          serial_number?: string | null
          total_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_allocations: {
        Row: {
          academic_session_id: string | null
          allocated_date: string
          allocated_to: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          due_date: string | null
          equipment_id: string
          id: string
          purpose: string | null
          quantity: number
          recorded_by: string | null
          returned_date: string | null
          status: Database["public"]["Enums"]["allocation_status"]
        }
        Insert: {
          academic_session_id?: string | null
          allocated_date?: string
          allocated_to: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string | null
          equipment_id: string
          id?: string
          purpose?: string | null
          quantity?: number
          recorded_by?: string | null
          returned_date?: string | null
          status?: Database["public"]["Enums"]["allocation_status"]
        }
        Update: {
          academic_session_id?: string | null
          allocated_date?: string
          allocated_to?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string | null
          equipment_id?: string
          id?: string
          purpose?: string | null
          quantity?: number
          recorded_by?: string | null
          returned_date?: string | null
          status?: Database["public"]["Enums"]["allocation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "equipment_allocations_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_allocations_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempt_uploads: {
        Row: {
          attempt_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          mime_type: string | null
          original_filename: string | null
          question_id: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          question_id?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          question_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempt_uploads_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempt_uploads_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          answers: Json
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          duration_seconds: number | null
          exam_id: string
          expires_at: string | null
          flagged_ids: string[]
          id: string
          ip: unknown
          last_autosave_at: string | null
          option_order: Json
          percentage: number
          question_order: string[]
          raw_score: number
          session_token: string | null
          started_at: string
          status: string
          student_id: string
          submitted_at: string | null
          total_marks: number
          user_agent: string | null
        }
        Insert: {
          answers?: Json
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration_seconds?: number | null
          exam_id: string
          expires_at?: string | null
          flagged_ids?: string[]
          id?: string
          ip?: unknown
          last_autosave_at?: string | null
          option_order?: Json
          percentage?: number
          question_order?: string[]
          raw_score?: number
          session_token?: string | null
          started_at?: string
          status?: string
          student_id: string
          submitted_at?: string | null
          total_marks?: number
          user_agent?: string | null
        }
        Update: {
          answers?: Json
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration_seconds?: number | null
          exam_id?: string
          expires_at?: string | null
          flagged_ids?: string[]
          id?: string
          ip?: unknown
          last_autosave_at?: string | null
          option_order?: Json
          percentage?: number
          question_order?: string[]
          raw_score?: number
          session_token?: string | null
          started_at?: string
          status?: string
          student_id?: string
          submitted_at?: string | null
          total_marks?: number
          user_agent?: string | null
        }
        Relationships: []
      }
      exam_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip: unknown
          meta: Json
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: unknown
          meta?: Json
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: unknown
          meta?: Json
          user_agent?: string | null
        }
        Relationships: []
      }
      exam_review_history: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          exam_id: string
          feedback: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          exam_id: string
          feedback?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          exam_id?: string
          feedback?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_review_history_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sections: {
        Row: {
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          exam_id: string
          id: string
          instruction: string | null
          section_order: number
          title: string
        }
        Insert: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exam_id: string
          id?: string
          instruction?: string | null
          section_order?: number
          title: string
        }
        Update: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exam_id?: string
          id?: string
          instruction?: string | null
          section_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_sections_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          academic_session_id: string
          allow_late_entry: boolean
          allow_resume: boolean
          arm: string | null
          class_id: string
          closes_at: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          duration_minutes: number | null
          exam_date: string | null
          id: string
          instructions: string | null
          is_mandatory: boolean
          max_score: number
          num_questions: number | null
          opens_at: string | null
          pass_mark: number | null
          published: boolean
          published_at: string | null
          published_by: string | null
          purpose: string
          question_source: string
          randomize_options: boolean
          randomize_questions: boolean
          release_offset_minutes: number
          session_id: string | null
          status: Database["public"]["Enums"]["exam_status"]
          subject_id: string
          submitted_by: string | null
          submitted_for_review_at: string | null
          term_id: string
          time_zone: string
          title: string
          type: Database["public"]["Enums"]["exam_type"]
        }
        Insert: {
          academic_session_id: string
          allow_late_entry?: boolean
          allow_resume?: boolean
          arm?: string | null
          class_id: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration_minutes?: number | null
          exam_date?: string | null
          id?: string
          instructions?: string | null
          is_mandatory?: boolean
          max_score?: number
          num_questions?: number | null
          opens_at?: string | null
          pass_mark?: number | null
          published?: boolean
          published_at?: string | null
          published_by?: string | null
          purpose?: string
          question_source?: string
          randomize_options?: boolean
          randomize_questions?: boolean
          release_offset_minutes?: number
          session_id?: string | null
          status?: Database["public"]["Enums"]["exam_status"]
          subject_id: string
          submitted_by?: string | null
          submitted_for_review_at?: string | null
          term_id: string
          time_zone?: string
          title: string
          type?: Database["public"]["Enums"]["exam_type"]
        }
        Update: {
          academic_session_id?: string
          allow_late_entry?: boolean
          allow_resume?: boolean
          arm?: string | null
          class_id?: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration_minutes?: number | null
          exam_date?: string | null
          id?: string
          instructions?: string | null
          is_mandatory?: boolean
          max_score?: number
          num_questions?: number | null
          opens_at?: string | null
          pass_mark?: number | null
          published?: boolean
          published_at?: string | null
          published_by?: string | null
          purpose?: string
          question_source?: string
          randomize_options?: boolean
          randomize_questions?: boolean
          release_offset_minutes?: number
          session_id?: string | null
          status?: Database["public"]["Enums"]["exam_status"]
          subject_id?: string
          submitted_by?: string | null
          submitted_for_review_at?: string | null
          term_id?: string
          time_zone?: string
          title?: string
          type?: Database["public"]["Enums"]["exam_type"]
        }
        Relationships: [
          {
            foreignKeyName: "exams_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          academic_session_id: string | null
          amount: number
          category: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          expense_date: string
          id: string
          payment_method: string | null
          recorded_by: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          academic_session_id?: string | null
          amount?: number
          category: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string | null
          recorded_by?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          academic_session_id?: string | null
          amount?: number
          category?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string | null
          recorded_by?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          amount: number
          class_id: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          level: Database["public"]["Enums"]["class_level"] | null
          name: string
          session_id: string | null
          term_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          level?: Database["public"]["Enums"]["class_level"] | null
          name: string
          session_id?: string | null
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          level?: Database["public"]["Enums"]["class_level"] | null
          name?: string
          session_id?: string | null
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fees: {
        Row: {
          academic_session_id: string
          amount: number
          amount_paid: number
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          due_date: string | null
          id: string
          paid_date: string | null
          payment_method: string | null
          reference: string | null
          status: Database["public"]["Enums"]["fee_status"]
          student_id: string
          term_id: string
        }
        Insert: {
          academic_session_id: string
          amount: number
          amount_paid?: number
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          due_date?: string | null
          id?: string
          paid_date?: string | null
          payment_method?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["fee_status"]
          student_id: string
          term_id: string
        }
        Update: {
          academic_session_id?: string
          amount?: number
          amount_paid?: number
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          paid_date?: string | null
          payment_method?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["fee_status"]
          student_id?: string
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fees_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fees_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_scales: {
        Row: {
          bands: Json
          class_id: string | null
          created_at: string | null
          education_level: string | null
          id: string
          is_default: boolean | null
          name: string
          subject_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          bands?: Json
          class_id?: string | null
          created_at?: string | null
          education_level?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          subject_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          bands?: Json
          class_id?: string | null
          created_at?: string | null
          education_level?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          subject_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grading_scales_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_scales_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      health_medications: {
        Row: {
          academic_session_id: string | null
          administered_at: string | null
          attachment_url: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          dose: string | null
          id: string
          name: string
          notes: string | null
          ordered_at: string | null
          recorded_by: string | null
          result: string | null
          route: string | null
          student_id: string
          type: string
        }
        Insert: {
          academic_session_id?: string | null
          administered_at?: string | null
          attachment_url?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dose?: string | null
          id?: string
          name: string
          notes?: string | null
          ordered_at?: string | null
          recorded_by?: string | null
          result?: string | null
          route?: string | null
          student_id: string
          type?: string
        }
        Update: {
          academic_session_id?: string | null
          administered_at?: string | null
          attachment_url?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dose?: string | null
          id?: string
          name?: string
          notes?: string | null
          ordered_at?: string | null
          recorded_by?: string | null
          result?: string | null
          route?: string | null
          student_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_medications_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      health_observations: {
        Row: {
          academic_session_id: string | null
          bp_diastolic: number | null
          bp_systolic: number | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          height_cm: number | null
          id: string
          notes: string | null
          pulse_bpm: number | null
          recorded_at: string
          recorded_by: string | null
          respiratory_rate: number | null
          student_id: string
          symptoms: string | null
          temperature_c: number | null
          weight_kg: number | null
        }
        Insert: {
          academic_session_id?: string | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          height_cm?: number | null
          id?: string
          notes?: string | null
          pulse_bpm?: number | null
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          student_id: string
          symptoms?: string | null
          temperature_c?: number | null
          weight_kg?: number | null
        }
        Update: {
          academic_session_id?: string | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          height_cm?: number | null
          id?: string
          notes?: string | null
          pulse_bpm?: number | null
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          student_id?: string
          symptoms?: string | null
          temperature_c?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "health_observations_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      health_referrals: {
        Row: {
          academic_session_id: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          facility: string | null
          follow_up_date: string | null
          id: string
          kind: string
          notes: string | null
          outcome: string | null
          reason: string | null
          recorded_by: string | null
          referred_at: string | null
          student_id: string
        }
        Insert: {
          academic_session_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          facility?: string | null
          follow_up_date?: string | null
          id?: string
          kind?: string
          notes?: string | null
          outcome?: string | null
          reason?: string | null
          recorded_by?: string | null
          referred_at?: string | null
          student_id: string
        }
        Update: {
          academic_session_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          facility?: string | null
          follow_up_date?: string | null
          id?: string
          kind?: string
          notes?: string | null
          outcome?: string | null
          reason?: string | null
          recorded_by?: string | null
          referred_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_referrals_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_attendance: {
        Row: {
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          recorded_by: string | null
          remark: string | null
          session_id: string
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          recorded_by?: string | null
          remark?: string | null
          session_id: string
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          recorded_by?: string | null
          remark?: string | null
          session_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "lab_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_group_members: {
        Row: {
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          group_id: string
          id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          group_id: string
          id?: string
          student_id: string
        }
        Update: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          group_id?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "lab_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_group_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_groups: {
        Row: {
          academic_session_id: string | null
          class_id: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          lab_id: string | null
          name: string
          notes: string | null
        }
        Insert: {
          academic_session_id?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          lab_id?: string | null
          name: string
          notes?: string | null
        }
        Update: {
          academic_session_id?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          lab_id?: string | null
          name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_groups_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_groups_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_groups_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_incidents: {
        Row: {
          actions_taken: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          id: string
          lab_id: string
          occurred_at: string
          reported_by: string | null
          session_id: string | null
          severity: string
        }
        Insert: {
          actions_taken?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          id?: string
          lab_id: string
          occurred_at?: string
          reported_by?: string | null
          session_id?: string | null
          severity?: string
        }
        Update: {
          actions_taken?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          id?: string
          lab_id?: string
          occurred_at?: string
          reported_by?: string | null
          session_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_incidents_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_incidents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "lab_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_sessions: {
        Row: {
          academic_session_id: string | null
          class_id: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          end_at: string
          id: string
          lab_id: string
          notes: string | null
          start_at: string
          status: string
          subject_id: string | null
          teacher_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_at: string
          id?: string
          lab_id: string
          notes?: string | null
          start_at: string
          status?: string
          subject_id?: string | null
          teacher_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_at?: string
          id?: string
          lab_id?: string
          notes?: string | null
          start_at?: string
          status?: string
          subject_id?: string | null
          teacher_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_sessions_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_sessions_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      labs: {
        Row: {
          academic_session_id: string | null
          capacity: number | null
          code: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          safety_rules: string | null
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          capacity?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          safety_rules?: string | null
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          capacity?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          safety_rules?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "labs_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          academic_session_id: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_date: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plans: {
        Row: {
          academic_session_id: string | null
          activities: string | null
          class_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          evaluation: string | null
          id: string
          lesson_date: string | null
          materials: string | null
          objectives: string | null
          subject_id: string
          teacher_id: string | null
          term_id: string | null
          topic: string
          updated_at: string
          week_number: number | null
        }
        Insert: {
          academic_session_id?: string | null
          activities?: string | null
          class_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          evaluation?: string | null
          id?: string
          lesson_date?: string | null
          materials?: string | null
          objectives?: string | null
          subject_id: string
          teacher_id?: string | null
          term_id?: string | null
          topic: string
          updated_at?: string
          week_number?: number | null
        }
        Update: {
          academic_session_id?: string | null
          activities?: string | null
          class_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          evaluation?: string | null
          id?: string
          lesson_date?: string | null
          materials?: string | null
          objectives?: string | null
          subject_id?: string
          teacher_id?: string | null
          term_id?: string | null
          topic?: string
          updated_at?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plans_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      library_books: {
        Row: {
          academic_session_id: string | null
          author: string | null
          available_copies: number
          category: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          isbn: string | null
          title: string
          total_copies: number
        }
        Insert: {
          academic_session_id?: string | null
          author?: string | null
          available_copies?: number
          category?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          isbn?: string | null
          title: string
          total_copies?: number
        }
        Update: {
          academic_session_id?: string | null
          author?: string | null
          available_copies?: number
          category?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          isbn?: string | null
          title?: string
          total_copies?: number
        }
        Relationships: [
          {
            foreignKeyName: "library_books_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      library_resources: {
        Row: {
          academic_session_id: string | null
          author: string | null
          category: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          duration_minutes: number | null
          external_url: string | null
          file_url: string | null
          id: string
          publisher: string | null
          thumbnail_url: string | null
          title: string
          type: Database["public"]["Enums"]["resource_type"]
          updated_at: string
          uploaded_by: string | null
          view_count: number
        }
        Insert: {
          academic_session_id?: string | null
          author?: string | null
          category?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          external_url?: string | null
          file_url?: string | null
          id?: string
          publisher?: string | null
          thumbnail_url?: string | null
          title: string
          type?: Database["public"]["Enums"]["resource_type"]
          updated_at?: string
          uploaded_by?: string | null
          view_count?: number
        }
        Update: {
          academic_session_id?: string | null
          author?: string | null
          category?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          external_url?: string | null
          file_url?: string | null
          id?: string
          publisher?: string | null
          thumbnail_url?: string | null
          title?: string
          type?: Database["public"]["Enums"]["resource_type"]
          updated_at?: string
          uploaded_by?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "library_resources_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          read_at: string | null
          receiver_id: string
          sender_id: string
          subject: string | null
        }
        Insert: {
          content: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          read_at?: string | null
          receiver_id: string
          sender_id: string
          subject?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
          subject?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          promotion_email: boolean
          promotion_in_app: boolean
          promotion_sms: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          promotion_email?: boolean
          promotion_in_app?: boolean
          promotion_sms?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          promotion_email?: boolean
          promotion_in_app?: boolean
          promotion_sms?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          created_by: string | null
          id: string
          read_at: string | null
          recipient_user_id: string
          related_id: string | null
          related_type: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          subject: string | null
        }
        Insert: {
          body: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          read_at?: string | null
          recipient_user_id: string
          related_id?: string | null
          related_type?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          subject?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          read_at?: string | null
          recipient_user_id?: string
          related_id?: string | null
          related_type?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          subject?: string | null
        }
        Relationships: []
      }
      nursery_broadsheet_comments: {
        Row: {
          class_id: string
          created_at: string
          header_id: string
          id: string
          student_id: string
          teacher_comment: string | null
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          header_id: string
          id?: string
          student_id: string
          teacher_comment?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          header_id?: string
          id?: string
          student_id?: string
          teacher_comment?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_broadsheet_comments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_broadsheet_comments_header_id_fkey"
            columns: ["header_id"]
            isOneToOne: false
            referencedRelation: "nursery_broadsheet_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_broadsheet_comments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_broadsheet_headers: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          session_id: string
          status: string
          term_id: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          session_id: string
          status?: string
          term_id: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          session_id?: string
          status?: string
          term_id?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nursery_broadsheet_headers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_broadsheet_headers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_broadsheet_headers_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      nursery_broadsheets: {
        Row: {
          area_title: string
          class_id: string
          created_at: string
          header_id: string
          id: string
          item_key: string
          item_text: string | null
          rating: number | null
          session_id: string
          student_id: string
          subject_id: string | null
          term_id: string
          updated_at: string
        }
        Insert: {
          area_title: string
          class_id: string
          created_at?: string
          header_id: string
          id?: string
          item_key: string
          item_text?: string | null
          rating?: number | null
          session_id: string
          student_id: string
          subject_id?: string | null
          term_id: string
          updated_at?: string
        }
        Update: {
          area_title?: string
          class_id?: string
          created_at?: string
          header_id?: string
          id?: string
          item_key?: string
          item_text?: string | null
          rating?: number | null
          session_id?: string
          student_id?: string
          subject_id?: string | null
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nursery_broadsheets_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_broadsheets_header_id_fkey"
            columns: ["header_id"]
            isOneToOne: false
            referencedRelation: "nursery_broadsheet_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_broadsheets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_broadsheets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_broadsheets_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nursery_broadsheets_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_teacher_meetings: {
        Row: {
          agenda: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          duration_minutes: number
          id: string
          location: string | null
          notes: string | null
          parent_id: string
          requested_by: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          status_changed_at: string | null
          student_id: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration_minutes?: number
          id?: string
          location?: string | null
          notes?: string | null
          parent_id: string
          requested_by?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["meeting_status"]
          status_changed_at?: string | null
          student_id?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration_minutes?: number
          id?: string
          location?: string | null
          notes?: string | null
          parent_id?: string
          requested_by?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["meeting_status"]
          status_changed_at?: string | null
          student_id?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      parents: {
        Row: {
          academic_session_id: string | null
          address: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          enrolled_session_id: string | null
          full_name: string
          id: string
          lga: string | null
          occupation: string | null
          phone: string | null
          state_of_origin: string | null
          user_id: string | null
        }
        Insert: {
          academic_session_id?: string | null
          address?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          enrolled_session_id?: string | null
          full_name: string
          id?: string
          lga?: string | null
          occupation?: string | null
          phone?: string | null
          state_of_origin?: string | null
          user_id?: string | null
        }
        Update: {
          academic_session_id?: string | null
          address?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          enrolled_session_id?: string | null
          full_name?: string
          id?: string
          lga?: string | null
          occupation?: string | null
          phone?: string | null
          state_of_origin?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parents_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_enrolled_session_id_fkey"
            columns: ["enrolled_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          academic_session_id: string
          amount: number
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          fee_id: string
          id: string
          paid_at: string
          payment_method: string | null
          raw_payload: Json | null
          reference: string
          term_id: string | null
        }
        Insert: {
          academic_session_id: string
          amount: number
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          fee_id: string
          id?: string
          paid_at?: string
          payment_method?: string | null
          raw_payload?: Json | null
          reference: string
          term_id?: string | null
        }
        Update: {
          academic_session_id?: string
          amount?: number
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          fee_id?: string
          id?: string
          paid_at?: string
          payment_method?: string | null
          raw_payload?: Json | null
          reference?: string
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll: {
        Row: {
          academic_session_id: string | null
          allowances: number
          basic_salary: number
          created_at: string
          deductions: number
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          net_pay: number
          notes: string | null
          paid_date: string | null
          paystack_reference: string | null
          paystack_transfer_code: string | null
          period_month: number
          period_year: number
          staff_id: string
          status: Database["public"]["Enums"]["payroll_status"]
        }
        Insert: {
          academic_session_id?: string | null
          allowances?: number
          basic_salary?: number
          created_at?: string
          deductions?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          net_pay?: number
          notes?: string | null
          paid_date?: string | null
          paystack_reference?: string | null
          paystack_transfer_code?: string | null
          period_month: number
          period_year: number
          staff_id: string
          status?: Database["public"]["Enums"]["payroll_status"]
        }
        Update: {
          academic_session_id?: string | null
          allowances?: number
          basic_salary?: number
          created_at?: string
          deductions?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          net_pay?: number
          notes?: string | null
          paid_date?: string | null
          paystack_reference?: string | null
          paystack_transfer_code?: string | null
          period_month?: number
          period_year?: number
          staff_id?: string
          status?: Database["public"]["Enums"]["payroll_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          label: string
          module: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          label: string
          module: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          label?: string
          module?: string
        }
        Relationships: []
      }
      processed_results: {
        Row: {
          ca_total: number | null
          ca1_score: number | null
          ca2_score: number | null
          ca3_score: number | null
          class_average: number | null
          class_id: string
          class_position: number | null
          created_at: string
          exam_score: number | null
          exam_type: string
          grade: string | null
          id: string
          processed_at: string
          processed_by: string | null
          remark: string | null
          session_id: string
          student_average: number | null
          student_id: string
          student_total_marks: number | null
          subject_highest: number | null
          subject_id: string
          subject_lowest: number | null
          subject_position: number | null
          subjects_count: number | null
          term_id: string
          total_score: number
          updated_at: string
        }
        Insert: {
          ca_total?: number | null
          ca1_score?: number | null
          ca2_score?: number | null
          ca3_score?: number | null
          class_average?: number | null
          class_id: string
          class_position?: number | null
          created_at?: string
          exam_score?: number | null
          exam_type?: string
          grade?: string | null
          id?: string
          processed_at?: string
          processed_by?: string | null
          remark?: string | null
          session_id: string
          student_average?: number | null
          student_id: string
          student_total_marks?: number | null
          subject_highest?: number | null
          subject_id: string
          subject_lowest?: number | null
          subject_position?: number | null
          subjects_count?: number | null
          term_id: string
          total_score: number
          updated_at?: string
        }
        Update: {
          ca_total?: number | null
          ca1_score?: number | null
          ca2_score?: number | null
          ca3_score?: number | null
          class_average?: number | null
          class_id?: string
          class_position?: number | null
          created_at?: string
          exam_score?: number | null
          exam_type?: string
          grade?: string | null
          id?: string
          processed_at?: string
          processed_by?: string | null
          remark?: string | null
          session_id?: string
          student_average?: number | null
          student_id?: string
          student_total_marks?: number | null
          subject_highest?: number | null
          subject_id?: string
          subject_lowest?: number | null
          subject_position?: number | null
          subjects_count?: number | null
          term_id?: string
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processed_results_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_results_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processed_results_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotion: {
        Row: {
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          from_class_id: string | null
          id: string
          remark: string | null
          session_id: string
          status: Database["public"]["Enums"]["promotion_status"]
          student_id: string
          to_class_id: string | null
        }
        Insert: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          from_class_id?: string | null
          id?: string
          remark?: string | null
          session_id: string
          status: Database["public"]["Enums"]["promotion_status"]
          student_id: string
          to_class_id?: string | null
        }
        Update: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          from_class_id?: string | null
          id?: string
          remark?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["promotion_status"]
          student_id?: string
          to_class_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_from_class_id_fkey"
            columns: ["from_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_to_class_id_fkey"
            columns: ["to_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_recommendations: {
        Row: {
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          from_class_id: string | null
          id: string
          note: string | null
          recommendation: Database["public"]["Enums"]["promotion_recommendation"]
          recommended_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string
          status: Database["public"]["Enums"]["recommendation_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          from_class_id?: string | null
          id?: string
          note?: string | null
          recommendation: Database["public"]["Enums"]["promotion_recommendation"]
          recommended_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["recommendation_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          from_class_id?: string | null
          id?: string
          note?: string | null
          recommendation?: Database["public"]["Enums"]["promotion_recommendation"]
          recommended_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["recommendation_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      question_bank: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          class_id: string
          correct_answer: string | null
          correct_answers: Json
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          difficulty: Database["public"]["Enums"]["qb_difficulty"]
          explanation: string | null
          id: string
          marks: number
          media: Json
          options: Json | null
          purpose: string
          question_number: number | null
          question_text: string
          question_type: string
          section_instruction: string | null
          section_label: string | null
          section_order: number | null
          session_id: string | null
          status: Database["public"]["Enums"]["qb_status"]
          stimulus_id: string | null
          sub_topic: string | null
          subject_id: string
          tags: string[]
          term_id: string | null
          time_suggestion_seconds: number | null
          topic: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          class_id: string
          correct_answer?: string | null
          correct_answers?: Json
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          difficulty?: Database["public"]["Enums"]["qb_difficulty"]
          explanation?: string | null
          id?: string
          marks?: number
          media?: Json
          options?: Json | null
          purpose?: string
          question_number?: number | null
          question_text: string
          question_type?: string
          section_instruction?: string | null
          section_label?: string | null
          section_order?: number | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["qb_status"]
          stimulus_id?: string | null
          sub_topic?: string | null
          subject_id: string
          tags?: string[]
          term_id?: string | null
          time_suggestion_seconds?: number | null
          topic?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          class_id?: string
          correct_answer?: string | null
          correct_answers?: Json
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          difficulty?: Database["public"]["Enums"]["qb_difficulty"]
          explanation?: string | null
          id?: string
          marks?: number
          media?: Json
          options?: Json | null
          purpose?: string
          question_number?: number | null
          question_text?: string
          question_type?: string
          section_instruction?: string | null
          section_label?: string | null
          section_order?: number | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["qb_status"]
          stimulus_id?: string | null
          sub_topic?: string | null
          subject_id?: string
          tags?: string[]
          term_id?: string | null
          time_suggestion_seconds?: number | null
          topic?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_stimulus_id_fkey"
            columns: ["stimulus_id"]
            isOneToOne: false
            referencedRelation: "question_stimuli"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      question_bank_revisions: {
        Row: {
          created_at: string
          editor_user_id: string | null
          id: string
          question_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          editor_user_id?: string | null
          id?: string
          question_id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          editor_user_id?: string | null
          id?: string
          question_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_revisions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      question_stimuli: {
        Row: {
          class_id: string
          content_json: Json
          created_at: string
          created_by: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          media: Json
          subject_id: string
          title: string
        }
        Insert: {
          class_id: string
          content_json?: Json
          created_at?: string
          created_by: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          media?: Json
          subject_id: string
          title: string
        }
        Update: {
          class_id?: string
          content_json?: Json
          created_at?: string
          created_by?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          media?: Json
          subject_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_stimuli_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_stimuli_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          content_json: Json | null
          correct_answer: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          exam_id: string
          id: string
          marks: number
          media: Json
          options: Json | null
          position: number | null
          question_number: number | null
          question_text: string
          question_type: string
          section_id: string | null
          section_instruction: string | null
          section_label: string | null
          section_order: number | null
        }
        Insert: {
          content_json?: Json | null
          correct_answer?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exam_id: string
          id?: string
          marks?: number
          media?: Json
          options?: Json | null
          position?: number | null
          question_number?: number | null
          question_text: string
          question_type?: string
          section_id?: string | null
          section_instruction?: string | null
          section_label?: string | null
          section_order?: number | null
        }
        Update: {
          content_json?: Json | null
          correct_answer?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exam_id?: string
          id?: string
          marks?: number
          media?: Json
          options?: Json | null
          position?: number | null
          question_number?: number | null
          question_text?: string
          question_type?: string
          section_id?: string | null
          section_instruction?: string | null
          section_label?: string | null
          section_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "exam_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      recycle_bin_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          original_primary_key: Json | null
          reason: string | null
          record_id: string
          snapshot: Json | null
          table_name: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          original_primary_key?: Json | null
          reason?: string | null
          record_id: string
          snapshot?: Json | null
          table_name: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          original_primary_key?: Json | null
          reason?: string | null
          record_id?: string
          snapshot?: Json | null
          table_name?: string
        }
        Relationships: []
      }
      report_cards: {
        Row: {
          academic_session_id: string
          average: number | null
          class_id: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          overall_grade: string | null
          position: number | null
          principal_comment: string | null
          published: boolean
          student_id: string
          teacher_comment: string | null
          term_id: string
          total_score: number | null
        }
        Insert: {
          academic_session_id: string
          average?: number | null
          class_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          overall_grade?: string | null
          position?: number | null
          principal_comment?: string | null
          published?: boolean
          student_id: string
          teacher_comment?: string | null
          term_id: string
          total_score?: number | null
        }
        Update: {
          academic_session_id?: string
          average?: number | null
          class_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          overall_grade?: string | null
          position?: number | null
          principal_comment?: string | null
          published?: boolean
          student_id?: string
          teacher_comment?: string | null
          term_id?: string
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          class_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          layout: Json
          name: string
          notes: string | null
          section: string | null
          session_id: string | null
          status: string
          term_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          class_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          layout?: Json
          name: string
          notes?: string | null
          section?: string | null
          session_id?: string | null
          status?: string
          term_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          class_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          layout?: Json
          name?: string
          notes?: string | null
          section?: string | null
          session_id?: string | null
          status?: string
          term_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      result_component_scores: {
        Row: {
          component_code: string
          component_id: string | null
          component_name: string | null
          created_at: string | null
          id: string
          max_score: number
          result_id: string
          score: number
          weight_percentage: number | null
        }
        Insert: {
          component_code: string
          component_id?: string | null
          component_name?: string | null
          created_at?: string | null
          id?: string
          max_score: number
          result_id: string
          score: number
          weight_percentage?: number | null
        }
        Update: {
          component_code?: string
          component_id?: string | null
          component_name?: string | null
          created_at?: string | null
          id?: string
          max_score?: number
          result_id?: string
          score?: number
          weight_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "result_component_scores_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "assessment_components"
            referencedColumns: ["id"]
          },
        ]
      }
      result_import_log: {
        Row: {
          class_id: string | null
          created_at: string
          exam_id: string | null
          exam_type: string | null
          id: string
          imported_by: string | null
          imported_rows: number
          max_score: number | null
          notes: string | null
          rejected_rows: number
          session_id: string | null
          subject_id: string | null
          term_id: string | null
          total_rows: number
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          exam_id?: string | null
          exam_type?: string | null
          id?: string
          imported_by?: string | null
          imported_rows?: number
          max_score?: number | null
          notes?: string | null
          rejected_rows?: number
          session_id?: string | null
          subject_id?: string | null
          term_id?: string | null
          total_rows?: number
        }
        Update: {
          class_id?: string | null
          created_at?: string
          exam_id?: string | null
          exam_type?: string | null
          id?: string
          imported_by?: string | null
          imported_rows?: number
          max_score?: number | null
          notes?: string | null
          rejected_rows?: number
          session_id?: string | null
          subject_id?: string | null
          term_id?: string | null
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "result_import_log_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_import_log_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_import_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_import_log_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_import_log_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      result_processing_runs: {
        Row: {
          class_id: string
          created_at: string
          duration_ms: number | null
          errors: Json
          exam_type: string
          id: string
          is_reprocess: boolean
          processed_by: string | null
          rows_written: number
          session_id: string
          students_processed: number
          subject_id: string | null
          subjects_processed: number
          term_id: string
          warnings: Json
        }
        Insert: {
          class_id: string
          created_at?: string
          duration_ms?: number | null
          errors?: Json
          exam_type?: string
          id?: string
          is_reprocess?: boolean
          processed_by?: string | null
          rows_written?: number
          session_id: string
          students_processed?: number
          subject_id?: string | null
          subjects_processed?: number
          term_id: string
          warnings?: Json
        }
        Update: {
          class_id?: string
          created_at?: string
          duration_ms?: number | null
          errors?: Json
          exam_type?: string
          id?: string
          is_reprocess?: boolean
          processed_by?: string | null
          rows_written?: number
          session_id?: string
          students_processed?: number
          subject_id?: string | null
          subjects_processed?: number
          term_id?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "result_processing_runs_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_processing_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_processing_runs_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_processing_runs_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      result_publication_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          class_id: string
          created_at: string
          exam_type: string
          id: string
          notes: string | null
          publication_id: string | null
          session_id: string
          term_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          class_id: string
          created_at?: string
          exam_type: string
          id?: string
          notes?: string | null
          publication_id?: string | null
          session_id: string
          term_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          class_id?: string
          created_at?: string
          exam_type?: string
          id?: string
          notes?: string | null
          publication_id?: string | null
          session_id?: string
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "result_publication_audit_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "result_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      result_publications: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          class_id: string
          created_at: string
          created_by: string | null
          exam_type: string
          id: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          session_id: string
          status: Database["public"]["Enums"]["result_pub_status"]
          term_id: string
          unpublished_at: string | null
          unpublished_by: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          class_id: string
          created_at?: string
          created_by?: string | null
          exam_type?: string
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["result_pub_status"]
          term_id: string
          unpublished_at?: string | null
          unpublished_by?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          class_id?: string
          created_at?: string
          created_by?: string | null
          exam_type?: string
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["result_pub_status"]
          term_id?: string
          unpublished_at?: string | null
          unpublished_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "result_publications_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_publications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_publications_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          academic_session_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          exam_id: string
          grade: string | null
          id: string
          recorded_by: string | null
          remark: string | null
          score: number
          student_id: string
        }
        Insert: {
          academic_session_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exam_id: string
          grade?: string | null
          id?: string
          recorded_by?: string | null
          remark?: string | null
          score: number
          student_id: string
        }
        Update: {
          academic_session_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exam_id?: string
          grade?: string | null
          id?: string
          recorded_by?: string | null
          remark?: string | null
          score?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "results_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      role_function_permissions: {
        Row: {
          created_at: string
          function_code: string
          id: string
          is_allowed: boolean
          module_slug: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          function_code: string
          id?: string
          is_allowed?: boolean
          module_slug: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          function_code?: string
          id?: string
          is_allowed?: boolean
          module_slug?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_module_permissions: {
        Row: {
          can_delete: boolean
          can_edit: boolean
          can_read: boolean
          can_write: boolean
          created_at: string
          id: string
          module_slug: string
          role: string
          updated_at: string
        }
        Insert: {
          can_delete?: boolean
          can_edit?: boolean
          can_read?: boolean
          can_write?: boolean
          created_at?: string
          id?: string
          module_slug: string
          role: string
          updated_at?: string
        }
        Update: {
          can_delete?: boolean
          can_edit?: boolean
          can_read?: boolean
          can_write?: boolean
          created_at?: string
          id?: string
          module_slug?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_code: string
          role: string
        }
        Insert: {
          created_at?: string
          permission_code: string
          role: string
        }
        Update: {
          created_at?: string
          permission_code?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      role_submodule_permissions: {
        Row: {
          can_delete: boolean
          can_edit: boolean
          can_read: boolean
          can_write: boolean
          created_at: string
          id: string
          module_slug: string
          role: string
          submodule_slug: string
          updated_at: string
        }
        Insert: {
          can_delete?: boolean
          can_edit?: boolean
          can_read?: boolean
          can_write?: boolean
          created_at?: string
          id?: string
          module_slug: string
          role: string
          submodule_slug: string
          updated_at?: string
        }
        Update: {
          can_delete?: boolean
          can_edit?: boolean
          can_read?: boolean
          can_write?: boolean
          created_at?: string
          id?: string
          module_slug?: string
          role?: string
          submodule_slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_settings: {
        Row: {
          ca1_weight: number
          ca2_weight: number
          ca3_weight: number
          cumulative_method: string
          exam_weight: number
          grading_scale: Json
          id: number
          promotion_min_average: number
          school_name: string | null
          scoring_scheme: string
          updated_at: string
        }
        Insert: {
          ca1_weight?: number
          ca2_weight?: number
          ca3_weight?: number
          cumulative_method?: string
          exam_weight?: number
          grading_scale?: Json
          id?: number
          promotion_min_average?: number
          school_name?: string | null
          scoring_scheme?: string
          updated_at?: string
        }
        Update: {
          ca1_weight?: number
          ca2_weight?: number
          ca3_weight?: number
          cumulative_method?: string
          exam_weight?: number
          grading_scale?: Json
          id?: number
          promotion_min_average?: number
          school_name?: string | null
          scoring_scheme?: string
          updated_at?: string
        }
        Relationships: []
      }
      school_subscription: {
        Row: {
          billing_cycle: string
          created_at: string
          expires_at: string | null
          id: string
          license_key: string | null
          plan_code: string
          started_at: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          billing_cycle?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          license_key?: string | null
          plan_code: string
          started_at?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          license_key?: string | null
          plan_code?: string
          started_at?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_subscription_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["code"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_current: boolean
          name: string
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean
          name: string
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          name?: string
          start_date?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          academic_session_id: string | null
          address: string | null
          bank_account: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_code: string | null
          bank_name: string | null
          branch_id: string | null
          created_at: string
          date_employed: string
          date_of_birth: string | null
          date_terminated: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          department: string | null
          email: string | null
          employment_session_id: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          level_scope: Database["public"]["Enums"]["level_scope"] | null
          lga: string | null
          nin: string | null
          notes: string | null
          paystack_recipient_code: string | null
          phone: string | null
          photo_url: string | null
          position: string
          qualification: string | null
          salary: number | null
          staff_no: string
          state_of_origin: string | null
          status: Database["public"]["Enums"]["staff_status"]
          user_id: string | null
        }
        Insert: {
          academic_session_id?: string | null
          address?: string | null
          bank_account?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          branch_id?: string | null
          created_at?: string
          date_employed?: string
          date_of_birth?: string | null
          date_terminated?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department?: string | null
          email?: string | null
          employment_session_id?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          full_name: string
          gender?: string | null
          id?: string
          is_active?: boolean
          level_scope?: Database["public"]["Enums"]["level_scope"] | null
          lga?: string | null
          nin?: string | null
          notes?: string | null
          paystack_recipient_code?: string | null
          phone?: string | null
          photo_url?: string | null
          position: string
          qualification?: string | null
          salary?: number | null
          staff_no: string
          state_of_origin?: string | null
          status?: Database["public"]["Enums"]["staff_status"]
          user_id?: string | null
        }
        Update: {
          academic_session_id?: string | null
          address?: string | null
          bank_account?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          branch_id?: string | null
          created_at?: string
          date_employed?: string
          date_of_birth?: string | null
          date_terminated?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department?: string | null
          email?: string | null
          employment_session_id?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          full_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          level_scope?: Database["public"]["Enums"]["level_scope"] | null
          lga?: string | null
          nin?: string | null
          notes?: string | null
          paystack_recipient_code?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string
          qualification?: string | null
          salary?: number | null
          staff_no?: string
          state_of_origin?: string | null
          status?: Database["public"]["Enums"]["staff_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_employment_session_id_fkey"
            columns: ["employment_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_attendance: {
        Row: {
          academic_session_id: string | null
          check_in: string | null
          check_out: string | null
          created_at: string
          date: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          recorded_by: string | null
          remark: string | null
          staff_id: string
          status: Database["public"]["Enums"]["staff_attendance_status"]
        }
        Insert: {
          academic_session_id?: string | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          recorded_by?: string | null
          remark?: string | null
          staff_id: string
          status?: Database["public"]["Enums"]["staff_attendance_status"]
        }
        Update: {
          academic_session_id?: string | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          recorded_by?: string | null
          remark?: string | null
          staff_id?: string
          status?: Database["public"]["Enums"]["staff_attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_evaluations: {
        Row: {
          academic_session_id: string | null
          conduct: number | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          evaluator_id: string | null
          id: string
          overall_score: number | null
          performance: number | null
          period: string
          punctuality: number | null
          remarks: string | null
          review_status: Database["public"]["Enums"]["evaluation_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          teamwork: number | null
        }
        Insert: {
          academic_session_id?: string | null
          conduct?: number | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          evaluator_id?: string | null
          id?: string
          overall_score?: number | null
          performance?: number | null
          period: string
          punctuality?: number | null
          remarks?: string | null
          review_status?: Database["public"]["Enums"]["evaluation_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          teamwork?: number | null
        }
        Update: {
          academic_session_id?: string | null
          conduct?: number | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          evaluator_id?: string | null
          id?: string
          overall_score?: number | null
          performance?: number | null
          period?: string
          punctuality?: number | null
          remarks?: string | null
          review_status?: Database["public"]["Enums"]["evaluation_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          teamwork?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_evaluations_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_evaluations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_evaluations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_leave: {
        Row: {
          academic_session_id: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          end_date: string
          id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          start_date: string
        }
        Insert: {
          academic_session_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_date: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          start_date: string
        }
        Update: {
          academic_session_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_date?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_leave_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_leave_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_leave_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      student_enrollments: {
        Row: {
          class_id: string
          id: string
          recorded_at: string
          session_id: string
          status: string
          student_id: string
        }
        Insert: {
          class_id: string
          id?: string
          recorded_at?: string
          session_id: string
          status?: string
          student_id: string
        }
        Update: {
          class_id?: string
          id?: string
          recorded_at?: string
          session_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_trait_ratings: {
        Row: {
          academic_session_id: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          rating: Database["public"]["Enums"]["trait_rating"]
          recorded_by: string | null
          student_id: string
          term_id: string
          trait_item_id: string
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          rating: Database["public"]["Enums"]["trait_rating"]
          recorded_by?: string | null
          student_id: string
          term_id: string
          trait_item_id: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          rating?: Database["public"]["Enums"]["trait_rating"]
          recorded_by?: string | null
          student_id?: string
          term_id?: string
          trait_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_trait_ratings_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_trait_ratings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_trait_ratings_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_trait_ratings_trait_item_id_fkey"
            columns: ["trait_item_id"]
            isOneToOne: false
            referencedRelation: "trait_items"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          admission_no: string
          admission_session_id: string | null
          allergies: string | null
          blood_group: string | null
          branch_id: string | null
          class_id: string | null
          contact_email_1: string | null
          contact_email_2: string | null
          contact_phone_1: string | null
          contact_phone_2: string | null
          created_at: string
          date_of_birth: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          disabilities: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          enrollment_date: string
          first_name: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender_type"] | null
          genotype: string | null
          graduated_at: string | null
          home_phone: string | null
          id: string
          is_active: boolean
          last_name: string | null
          lga: string | null
          medical_info: string | null
          middle_name: string | null
          nationality: string | null
          parent_id: string | null
          photo_url: string | null
          place_of_birth: string | null
          previous_school: string | null
          religion: string | null
          state_of_origin: string | null
          status: Database["public"]["Enums"]["student_status"]
          user_id: string | null
        }
        Insert: {
          address?: string | null
          admission_no: string
          admission_session_id?: string | null
          allergies?: string | null
          blood_group?: string | null
          branch_id?: string | null
          class_id?: string | null
          contact_email_1?: string | null
          contact_email_2?: string | null
          contact_phone_1?: string | null
          contact_phone_2?: string | null
          created_at?: string
          date_of_birth?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          disabilities?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          enrollment_date?: string
          first_name?: string | null
          full_name: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          genotype?: string | null
          graduated_at?: string | null
          home_phone?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          lga?: string | null
          medical_info?: string | null
          middle_name?: string | null
          nationality?: string | null
          parent_id?: string | null
          photo_url?: string | null
          place_of_birth?: string | null
          previous_school?: string | null
          religion?: string | null
          state_of_origin?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          user_id?: string | null
        }
        Update: {
          address?: string | null
          admission_no?: string
          admission_session_id?: string | null
          allergies?: string | null
          blood_group?: string | null
          branch_id?: string | null
          class_id?: string | null
          contact_email_1?: string | null
          contact_email_2?: string | null
          contact_phone_1?: string | null
          contact_phone_2?: string | null
          created_at?: string
          date_of_birth?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          disabilities?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          enrollment_date?: string
          first_name?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          genotype?: string | null
          graduated_at?: string | null
          home_phone?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          lga?: string | null
          medical_info?: string | null
          middle_name?: string | null
          nationality?: string | null
          parent_id?: string | null
          photo_url?: string | null
          place_of_birth?: string | null
          previous_school?: string | null
          religion?: string | null
          state_of_origin?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_admission_session_id_fkey"
            columns: ["admission_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_teachers: {
        Row: {
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          is_primary: boolean
          staff_id: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          is_primary?: boolean
          staff_id: string
          subject_id: string
        }
        Update: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          is_primary?: boolean
          staff_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_teachers_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_teachers_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_teachers_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          academic_session_id: string | null
          class_id: string | null
          code: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          teacher_id: string | null
          uses_ca3: boolean
        }
        Insert: {
          academic_session_id?: string | null
          class_id?: string | null
          code?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name: string
          teacher_id?: string | null
          uses_ca3?: boolean
        }
        Update: {
          academic_session_id?: string | null
          class_id?: string | null
          code?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name?: string
          teacher_id?: string | null
          uses_ca3?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "subjects_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          annual_price: number
          code: string
          created_at: string
          features: string[]
          monthly_price: number
          name: string
          tier_rank: number
          updated_at: string
        }
        Insert: {
          annual_price?: number
          code: string
          created_at?: string
          features?: string[]
          monthly_price?: number
          name: string
          tier_rank: number
          updated_at?: string
        }
        Update: {
          annual_price?: number
          code?: string
          created_at?: string
          features?: string[]
          monthly_price?: number
          name?: string
          tier_rank?: number
          updated_at?: string
        }
        Relationships: []
      }
      system_jobs: {
        Row: {
          job_name: string
          last_message: string | null
          last_run_at: string | null
          last_status: string | null
          updated_at: string
        }
        Insert: {
          job_name: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          updated_at?: string
        }
        Update: {
          job_name?: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      terms: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_current: boolean
          name: Database["public"]["Enums"]["term_name"]
          session_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean
          name: Database["public"]["Enums"]["term_name"]
          session_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          name?: Database["public"]["Enums"]["term_name"]
          session_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable: {
        Row: {
          academic_session_id: string | null
          class_id: string
          created_at: string
          day_of_week: number
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          end_time: string
          id: string
          room: string | null
          start_time: string
          subject_id: string
          teacher_id: string | null
        }
        Insert: {
          academic_session_id?: string | null
          class_id: string
          created_at?: string
          day_of_week: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_time: string
          id?: string
          room?: string | null
          start_time: string
          subject_id: string
          teacher_id?: string | null
        }
        Update: {
          academic_session_id?: string | null
          class_id?: string
          created_at?: string
          day_of_week?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          end_time?: string
          id?: string
          room?: string | null
          start_time?: string
          subject_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      trait_categories: {
        Row: {
          academic_session_id: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          display_order: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_order?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_order?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trait_categories_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      trait_items: {
        Row: {
          academic_session_id: string | null
          category_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          display_order: number
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          academic_session_id?: string | null
          category_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_order?: number
          id?: string
          label: string
          updated_at?: string
        }
        Update: {
          academic_session_id?: string | null
          category_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_order?: number
          id?: string
          label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trait_items_academic_session_id_fkey"
            columns: ["academic_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trait_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "trait_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          created_at: string
          granted: boolean
          permission_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          permission_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          permission_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      staff_directory: {
        Row: {
          branch_id: string | null
          department: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          phone: string | null
          photo_url: string | null
          position: string | null
          staff_no: string | null
          user_id: string | null
        }
        Insert: {
          branch_id?: string | null
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          staff_no?: string | null
          user_id?: string | null
        }
        Update: {
          branch_id?: string | null
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          staff_no?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      student_academic_history: {
        Row: {
          admission_no: string | null
          class_level: Database["public"]["Enums"]["class_level"] | null
          class_name: string | null
          full_name: string | null
          session_name: string | null
          start_date: string | null
          status: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      advance_current_term: { Args: never; Returns: Json }
      approve_and_publish_exam: { Args: { _exam_id: string }; Returns: Json }
      approve_results: {
        Args: {
          _class_id: string
          _exam_type?: string
          _notes?: string
          _session_id: string
          _term_id: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          class_id: string
          created_at: string
          created_by: string | null
          exam_type: string
          id: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          session_id: string
          status: Database["public"]["Enums"]["result_pub_status"]
          term_id: string
          unpublished_at: string | null
          unpublished_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "result_publications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_approve_results: { Args: { _user_id: string }; Returns: boolean }
      canonical_role: { Args: { _role: string }; Returns: string }
      check_user_function_permission: {
        Args: { _function_code: string; _module_slug: string; _user_id: string }
        Returns: boolean
      }
      claim_super_admin: { Args: never; Returns: boolean }
      class_level_bucket: {
        Args: { _level: string }
        Returns: Database["public"]["Enums"]["level_scope"]
      }
      class_matches_user_scope: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      copy_exam_questions: {
        Args: {
          _dest_class_ids: string[]
          _dest_session_id?: string
          _dest_term_id?: string
          _mode?: string
          _options?: Json
          _source_exam_id: string
        }
        Returns: Json
      }
      create_session_with_terms: {
        Args: {
          _end_date: string
          _make_current?: boolean
          _name: string
          _start_date: string
        }
        Returns: string
      }
      current_plan_code: { Args: never; Returns: string }
      exam_answer_text: { Args: { _value: string }; Returns: string }
      exam_answers_equal: { Args: { _a: string; _b: string }; Returns: boolean }
      exam_end_at: { Args: { _exam_id: string }; Returns: string }
      exam_grade_units: {
        Args: { _exam_id: string }
        Returns: {
          correct_answer: string
          marks: number
          options: Json
          question_id: string
          question_text: string
          question_type: string
          sub_key: string
        }[]
      }
      exam_grading_maintenance: { Args: { _dry_run?: boolean }; Returns: Json }
      exam_has_attempts: { Args: { _exam_id: string }; Returns: boolean }
      exam_live_stats: {
        Args: { _exam_id: string }
        Returns: {
          absent: number
          eligible: number
          in_progress: number
          started: number
          submitted: number
        }[]
      }
      exam_mcq_key: {
        Args: { _answer: string; _options: Json }
        Returns: string
      }
      exam_normalize_content: { Args: { _content: Json }; Returns: Json }
      exam_option_entries: {
        Args: { _options: Json }
        Returns: {
          key: string
          value: string
        }[]
      }
      exam_release_at: { Args: { _exam_id: string }; Returns: string }
      exam_score_answers: {
        Args: { _answers: Json; _exam_id: string; _preserve_manual?: boolean }
        Returns: Json
      }
      get_current_session_id: { Args: never; Returns: string }
      get_user_effective_permissions: {
        Args: { _user_id: string }
        Returns: Json
      }
      get_user_level_scope: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["level_scope"]
      }
      get_user_module_permissions: {
        Args: { _user_id: string }
        Returns: {
          can_delete: boolean
          can_edit: boolean
          can_read: boolean
          can_write: boolean
          module_slug: string
        }[]
      }
      hard_delete_row: {
        Args: { _id: string; _reason?: string; _table: string }
        Returns: Json
      }
      has_permission: {
        Args: { _code: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_class_teacher_of: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      is_class_teacher_of_student: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      is_hod: { Args: { _user_id: string }; Returns: boolean }
      is_parent_of_student: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      is_principal: { Args: { _user_id: string }; Returns: boolean }
      is_result_published: {
        Args: {
          _class_id: string
          _exam_type: string
          _session_id: string
          _term_id: string
        }
        Returns: boolean
      }
      is_school_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_teacher_role: { Args: { _user_id: string }; Returns: boolean }
      list_recycle_bin: {
        Args: { _table?: string }
        Returns: {
          delete_reason: string
          deleted_at: string
          deleted_by: string
          record_id: string
          snapshot: Json
          table_name: string
        }[]
      }
      my_permissions: {
        Args: never
        Returns: {
          permission_code: string
        }[]
      }
      my_teaching_assignments: {
        Args: never
        Returns: {
          class_id: string
          subject_id: string
        }[]
      }
      my_teaching_class_ids: {
        Args: never
        Returns: {
          class_id: string
        }[]
      }
      publish_results: {
        Args: {
          _class_id: string
          _exam_type?: string
          _notes?: string
          _session_id: string
          _term_id: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          class_id: string
          created_at: string
          created_by: string | null
          exam_type: string
          id: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          session_id: string
          status: Database["public"]["Enums"]["result_pub_status"]
          term_id: string
          unpublished_at: string | null
          unpublished_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "result_publications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_payment_transaction: {
        Args: {
          _amount: number
          _fee_id: string
          _paid_at: string
          _payment_method: string
          _raw_payload: Json
          _reference: string
        }
        Returns: Json
      }
      recycle_bin_primary_key: {
        Args: { _snapshot: Json; _table: string }
        Returns: Json
      }
      recycle_bin_record_id: {
        Args: { _snapshot: Json; _table: string }
        Returns: string
      }
      recycle_bin_tables: { Args: never; Returns: string[] }
      resolve_assessment_structure: {
        Args: {
          _class_id?: string
          _session_id?: string
          _subject_id?: string
          _term_id?: string
        }
        Returns: {
          components: Json
          structure_id: string
          structure_name: string
          total_max_score: number
        }[]
      }
      resolve_grading_scale: {
        Args: {
          _class_id?: string
          _education_level?: string
          _subject_id?: string
        }
        Returns: {
          bands: Json
          scale_id: string
          scale_name: string
        }[]
      }
      resolve_report_template: {
        Args: { _class_id: string; _term_id: string }
        Returns: {
          class_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          layout: Json
          name: string
          notes: string | null
          section: string | null
          session_id: string | null
          status: string
          term_id: string | null
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "report_templates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      restore_row: { Args: { _id: string; _table: string }; Returns: Json }
      rollover_session: {
        Args: {
          _from_session_id: string
          _mappings: Json
          _to_session_id: string
        }
        Returns: number
      }
      rollover_session_dry_run: {
        Args: {
          _from_session_id: string
          _mappings: Json
          _to_session_id: string
        }
        Returns: {
          action: string
          from_class_id: string
          from_class_name: string
          full_name: string
          recommendation: string
          student_id: string
          to_class_id: string
          to_class_name: string
        }[]
      }
      save_exam_to_bank: {
        Args: {
          _dup_mode?: string
          _exam_id: string
          _metadata?: Json
          _question_ids?: string[]
        }
        Returns: Json
      }
      scrub_answer_keys: { Args: { _j: Json }; Returns: Json }
      send_exam_back: {
        Args: { _exam_id: string; _feedback: string }
        Returns: Json
      }
      soft_delete_row: {
        Args: { _id: string; _reason?: string; _table: string }
        Returns: Json
      }
      student_can_start_exam: { Args: { _exam_id: string }; Returns: boolean }
      student_can_view_exam: {
        Args: { _exam_id: string; _user_id: string }
        Returns: boolean
      }
      student_get_exam_questions: {
        Args: { _exam_id: string }
        Returns: {
          content_json: Json
          correct_answer: string
          id: string
          marks: number
          media: Json
          options: Json
          position: number
          question_text: string
          question_type: string
          section_id: string
          section_instruction: string
          section_order: number
          section_title: string
        }[]
      }
      student_visible_exams: {
        Args: never
        Returns: {
          allow_late_entry: boolean
          allow_resume: boolean
          attempt_id: string
          attempt_status: string
          class_id: string
          closes_at: string
          duration_minutes: number
          id: string
          instructions: string
          is_mandatory: boolean
          max_score: number
          opens_at: string
          purpose: string
          release_at: string
          subject_id: string
          subject_name: string
          time_zone: string
          title: string
          type: Database["public"]["Enums"]["exam_type"]
        }[]
      }
      submit_exam_attempt: {
        Args: {
          _answers: Json
          _duration_seconds: number
          _exam_id: string
          _started_at: string
          _student_id: string
          _submitted_at: string
        }
        Returns: Json
      }
      submit_exam_for_review: { Args: { _exam_id: string }; Returns: Json }
      teaches_class: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      teaches_class_subject: {
        Args: { _class_id: string; _subject_id: string; _user_id: string }
        Returns: boolean
      }
      teaches_exam_subject: {
        Args: { _exam_id: string; _user_id: string }
        Returns: boolean
      }
      unpublish_results: {
        Args: {
          _class_id: string
          _exam_type?: string
          _notes?: string
          _session_id: string
          _term_id: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          class_id: string
          created_at: string
          created_by: string | null
          exam_type: string
          id: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          session_id: string
          status: Database["public"]["Enums"]["result_pub_status"]
          term_id: string
          unpublished_at: string | null
          unpublished_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "result_publications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      allocation_status: "allocated" | "returned" | "overdue" | "lost"
      app_role:
        | "super_admin"
        | "admin"
        | "teacher"
        | "student"
        | "parent"
        | "admin1"
        | "admin2"
        | "admin3"
        | "head_of_section"
        | "school_admin"
        | "principal"
        | "vice_principal_academic"
        | "vice_principal_admin"
        | "hod"
        | "class_teacher"
      assignment_status: "draft" | "published" | "closed"
      attendance_status: "present" | "absent" | "late" | "excused"
      ca_type:
        | "ca1"
        | "ca2"
        | "ca3"
        | "test"
        | "project"
        | "classwork"
        | "homework"
        | "other"
        | "exam"
      class_level: "nursery" | "primary" | "jss" | "sss"
      employment_type: "full_time" | "part_time" | "contract" | "volunteer"
      equipment_condition: "new" | "good" | "fair" | "poor" | "out_of_service"
      evaluation_review_status: "pending" | "approved"
      exam_status: "draft" | "published" | "closed" | "pending_review"
      exam_type: "cbt" | "written" | "practical" | "oral"
      fee_status: "paid" | "unpaid" | "partial"
      gender_type: "male" | "female" | "other"
      lab_item_type: "apparatus" | "equipment" | "chemical"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      leave_type:
        | "annual"
        | "sick"
        | "personal"
        | "maternity"
        | "paternity"
        | "study"
        | "other"
        | "unpaid"
      level_scope: "creche_nursery" | "primary" | "secondary"
      meeting_status: "requested" | "confirmed" | "completed" | "cancelled"
      notification_channel: "in_app" | "email" | "sms"
      notification_status: "queued" | "sent" | "failed" | "read"
      payroll_status: "draft" | "approved" | "paid"
      promotion_recommendation: "pass" | "repeat" | "graduate"
      promotion_status: "promoted" | "retained" | "graduated"
      qb_difficulty: "easy" | "medium" | "hard"
      qb_question_type:
        | "mcq"
        | "true_false"
        | "fill_blank"
        | "short_answer"
        | "essay"
        | "matching"
        | "multi_select"
      qb_status: "draft" | "approved" | "archived"
      recommendation_status: "pending" | "approved" | "rejected"
      resource_type: "pdf" | "ebook" | "journal" | "video" | "article" | "other"
      result_pub_status: "draft" | "approved" | "published"
      staff_attendance_status:
        | "present"
        | "absent"
        | "late"
        | "half_day"
        | "leave"
      staff_status:
        | "active"
        | "on_leave"
        | "suspended"
        | "terminated"
        | "retired"
      student_status: "active" | "graduated" | "withdrawn" | "suspended"
      submission_status: "submitted" | "late" | "graded" | "returned"
      term_name: "first" | "second" | "third"
      trait_rating: "M" | "SP" | "P" | "NA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      allocation_status: ["allocated", "returned", "overdue", "lost"],
      app_role: [
        "super_admin",
        "admin",
        "teacher",
        "student",
        "parent",
        "admin1",
        "admin2",
        "admin3",
        "head_of_section",
        "school_admin",
        "principal",
        "vice_principal_academic",
        "vice_principal_admin",
        "hod",
        "class_teacher",
      ],
      assignment_status: ["draft", "published", "closed"],
      attendance_status: ["present", "absent", "late", "excused"],
      ca_type: [
        "ca1",
        "ca2",
        "ca3",
        "test",
        "project",
        "classwork",
        "homework",
        "other",
        "exam",
      ],
      class_level: ["nursery", "primary", "jss", "sss"],
      employment_type: ["full_time", "part_time", "contract", "volunteer"],
      equipment_condition: ["new", "good", "fair", "poor", "out_of_service"],
      evaluation_review_status: ["pending", "approved"],
      exam_status: ["draft", "published", "closed", "pending_review"],
      exam_type: ["cbt", "written", "practical", "oral"],
      fee_status: ["paid", "unpaid", "partial"],
      gender_type: ["male", "female", "other"],
      lab_item_type: ["apparatus", "equipment", "chemical"],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      leave_type: [
        "annual",
        "sick",
        "personal",
        "maternity",
        "paternity",
        "study",
        "other",
        "unpaid",
      ],
      level_scope: ["creche_nursery", "primary", "secondary"],
      meeting_status: ["requested", "confirmed", "completed", "cancelled"],
      notification_channel: ["in_app", "email", "sms"],
      notification_status: ["queued", "sent", "failed", "read"],
      payroll_status: ["draft", "approved", "paid"],
      promotion_recommendation: ["pass", "repeat", "graduate"],
      promotion_status: ["promoted", "retained", "graduated"],
      qb_difficulty: ["easy", "medium", "hard"],
      qb_question_type: [
        "mcq",
        "true_false",
        "fill_blank",
        "short_answer",
        "essay",
        "matching",
        "multi_select",
      ],
      qb_status: ["draft", "approved", "archived"],
      recommendation_status: ["pending", "approved", "rejected"],
      resource_type: ["pdf", "ebook", "journal", "video", "article", "other"],
      result_pub_status: ["draft", "approved", "published"],
      staff_attendance_status: [
        "present",
        "absent",
        "late",
        "half_day",
        "leave",
      ],
      staff_status: [
        "active",
        "on_leave",
        "suspended",
        "terminated",
        "retired",
      ],
      student_status: ["active", "graduated", "withdrawn", "suspended"],
      submission_status: ["submitted", "late", "graded", "returned"],
      term_name: ["first", "second", "third"],
      trait_rating: ["M", "SP", "P", "NA"],
    },
  },
} as const
