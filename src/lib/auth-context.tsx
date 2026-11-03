import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "super_admin"
  | "admin"
  | "admin1"
  | "admin2"
  | "admin3"
  | "head_of_section"
  | "teacher"
  | "student"
  | "parent";

export const ADMIN_ROLES: AppRole[] = ["super_admin", "admin", "admin1", "admin2", "admin3"];
export const STAFF_ROLES: AppRole[] = [...ADMIN_ROLES, "head_of_section", "teacher"];

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isStaff: boolean;
  isAdmin: boolean;
  /** Class IDs where the current user is the assigned class teacher. */
  myClassIds: string[];
  /** (class_id, subject_id) pairs the current user is the assigned subject teacher for. */
  myAssignments: Array<{ class_id: string; subject_id: string }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [myClassIds, setMyClassIds] = useState<string[]>([]);
  const [myAssignments, setMyAssignments] = useState<Array<{ class_id: string; subject_id: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let lastUserId: string | null = null;

    const loadUserContext = (uid: string) => {
      // Defer to next tick so we never block the auth callback.
      setTimeout(() => {
        fetchRoles(uid);
        fetchMyClassIds(uid);
        fetchMyAssignments();
      }, 0);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      // Only react to identity transitions. TOKEN_REFRESHED (~hourly + tab
      // focus) and INITIAL_SESSION otherwise cause repeated RPC storms and
      // slow the app under concurrent load.
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;

      if (sess?.user) {
        if (sess.user.id === lastUserId) return; // same identity, skip re-fetch
        lastUserId = sess.user.id;
        loadUserContext(sess.user.id);
      } else {
        lastUserId = null;
        setRoles([]);
        setMyClassIds([]);
        setMyAssignments([]);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        lastUserId = data.session.user.id;
        loadUserContext(data.session.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchMyAssignments() {
    const { data, error } = await supabase.rpc("my_teaching_assignments");
    if (error || !data) { setMyAssignments([]); return; }
    setMyAssignments(
      (data as Array<{ class_id: string | null; subject_id: string | null }>)
        .filter((r) => r.class_id && r.subject_id)
        .map((r) => ({ class_id: r.class_id as string, subject_id: r.subject_id as string })),
    );
  }

  async function fetchRoles(userId: string) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  }

  async function fetchMyClassIds(userId: string) {
    // Authoritative: use SECURITY DEFINER RPC that matches staff by user_id
    // OR by email (covers cases where staff.user_id was not backfilled yet).
    const rpc = await supabase.rpc("my_teaching_class_ids");
    if (!rpc.error && rpc.data) {
      const ids = new Set<string>();
      (rpc.data as Array<{ class_id: string | null }>).forEach((r) => {
        if (r.class_id) ids.add(r.class_id);
      });
      setMyClassIds(Array.from(ids));
      return;
    }
    // Fallback: direct lookups by user_id and by email-matched staff records.
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? null;
    const staffByUser = await supabase.from("staff").select("id").eq("user_id", userId);
    const staffByEmail = email
      ? await supabase.from("staff").select("id").ilike("email", email)
      : { data: [] as { id: string }[] };
    const staffIds = Array.from(
      new Set([
        ...((staffByUser.data ?? []).map((s) => s.id)),
        ...((staffByEmail.data ?? []).map((s) => s.id)),
      ]),
    );
    if (staffIds.length === 0) {
      setMyClassIds([]);
      return;
    }
    const [cls, subj, tt] = await Promise.all([
      supabase.from("classes").select("id").in("class_teacher_id", staffIds),
      supabase.from("subjects").select("class_id").in("teacher_id", staffIds),
      supabase.from("timetable").select("class_id").in("teacher_id", staffIds),
    ]);
    const ids = new Set<string>();
    (cls.data ?? []).forEach((c) => c.id && ids.add(c.id));
    (subj.data ?? []).forEach((s) => s.class_id && ids.add(s.class_id));
    (tt.data ?? []).forEach((t) => t.class_id && ids.add(t.class_id));
    setMyClassIds(Array.from(ids));
  }


  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    roles,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    hasRole: (r) => roles.includes(r),
    isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
    isAdmin: roles.some((r) => ADMIN_ROLES.includes(r)),
    myClassIds,
    myAssignments,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
