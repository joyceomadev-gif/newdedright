import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { MODULES } from "@/lib/modules";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  GraduationCap,
  Heart,
  ShieldCheck,
  School,
  Wallet,
  Megaphone,
  CalendarDays,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function StatCard({
  value,
  label,
  icon: Icon,
  color,
}: {
  value: number | string;
  label: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className={`rounded-lg p-5 text-white shadow-sm ${color}`}>
      <div className="text-3xl md:text-4xl font-bold leading-none">{value}</div>
      <div className="mt-6 flex items-center gap-2 text-sm border-t border-white/30 pt-3">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DashboardPage() {
  const { roles, user } = useAuth();
  const qc = useQueryClient();

  async function claimSuperAdmin() {
    const { data, error } = await supabase.rpc("claim_super_admin");
    if (error) return toast.error(error.message);
    if (data) {
      toast.success("You are now Super Admin. Refreshing…");
      qc.invalidateQueries();
      window.location.reload();
    } else {
      toast.error("A Super Admin already exists. Ask them to assign you a role.");
    }
  }

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [students, staff, parents, classes, fees] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("staff").select("id", { count: "exact", head: true }),
        supabase.from("parents").select("id", { count: "exact", head: true }),
        supabase.from("classes").select("id", { count: "exact", head: true }),
        supabase.from("fees").select("amount, amount_paid"),
      ]);
      const billed = (fees.data ?? []).reduce((s, f) => s + Number(f.amount ?? 0), 0);
      const collected = (fees.data ?? []).reduce(
        (s, f) => s + Number(f.amount_paid ?? 0),
        0,
      );
      return {
        students: students.count ?? 0,
        teachers: staff.count ?? 0,
        parents: parents.count ?? 0,
        classes: classes.count ?? 0,
        billed,
        collected,
        outstanding: Math.max(0, billed - collected),
      };
    },
  });

  const { data: currentTerm } = useQuery({
    queryKey: ["current-term"],
    queryFn: async () => {
      const { data: term } = await supabase
        .from("terms")
        .select("id, name, start_date, end_date, session_id")
        .eq("is_current", true)
        .maybeSingle();
      if (!term) return null;
      const { data: session } = await supabase
        .from("sessions")
        .select("name, start_date, end_date")
        .eq("id", term.session_id)
        .maybeSingle();
      return { term, session };
    },
  });

  const { data: upcomingExams } = useQuery({
    queryKey: ["upcoming-exams"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("exams")
        .select("id, title, exam_date, type, class_id, classes(name)")
        .gte("exam_date", today)
        .order("exam_date", { ascending: true })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: announcements } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, title, body, audience, created_at")
        .eq("published", true)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const visibleTiles = MODULES.filter(
    (m) =>
      m.slug !== "dashboard" &&
      (roles.length === 0 ? false : m.roles.some((r) => roles.includes(r))),
  );

  const termDaysLeft = (() => {
    if (!currentTerm?.term?.end_date) return null;
    const diff = Math.ceil(
      (new Date(currentTerm.term.end_date).getTime() - Date.now()) / 86400000,
    );
    return diff;
  })();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {user && roles.length === 0 && (
        <Card className="p-5 border-primary/40 bg-primary/5 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <ShieldCheck className="h-6 w-6 text-primary shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">No role assigned yet</div>
            <div className="text-sm text-muted-foreground">
              If you're the first user, claim Super Admin to bootstrap the system. Otherwise, ask
              your administrator to assign you a role.
            </div>
          </div>
          <Button onClick={claimSuperAdmin}>Claim Super Admin</Button>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <StatCard value={stats?.students ?? 0} label="Students" icon={Users} color="bg-[var(--stat-red)]" />
        <StatCard value={stats?.teachers ?? 0} label="Staff" icon={GraduationCap} color="bg-[var(--stat-green)]" />
        <StatCard value={stats?.parents ?? 0} label="Parents" icon={Heart} color="bg-[var(--stat-blue)]" />
        <StatCard value={stats?.classes ?? 0} label="Classes" icon={School} color="bg-[var(--stat-orange,#d97706)]" />
        <StatCard
          value={formatCurrency(stats?.outstanding ?? 0)}
          label="Outstanding fees"
          icon={Wallet}
          color="bg-[var(--stat-purple,#7c3aed)]"
        />
      </div>

      {/* Term milestone */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <CalendarDays className="h-8 w-8 text-primary" />
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">Current academic period</div>
            {currentTerm?.term ? (
              <div className="font-semibold text-lg">
                {currentTerm.term.name} · {currentTerm.session?.name ?? "—"}
              </div>
            ) : (
              <div className="font-semibold text-lg text-muted-foreground">
                No active term set
              </div>
            )}
            {currentTerm?.term && (
              <div className="text-sm text-muted-foreground">
                {formatDate(currentTerm.term.start_date)} → {formatDate(currentTerm.term.end_date)}
              </div>
            )}
          </div>
          {termDaysLeft !== null && (
            <Badge variant={termDaysLeft < 14 ? "destructive" : "secondary"}>
              {termDaysLeft >= 0 ? `${termDaysLeft} days left` : "Term ended"}
            </Badge>
          )}
        </div>
      </Card>

      {/* Announcements + Upcoming exams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> Announcements
            </h2>
            <Link to="/communication" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          {announcements && announcements.length > 0 ? (
            <ul className="space-y-3">
              {announcements.map((a) => (
                <li key={a.id} className="border-l-2 border-primary pl-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{a.title}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {a.audience}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{a.body}</p>
                  <span className="text-xs text-muted-foreground">{formatDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No announcements yet.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Upcoming exams
            </h2>
            <Link to="/exams" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          {upcomingExams && upcomingExams.length > 0 ? (
            <ul className="space-y-2">
              {upcomingExams.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 text-sm border-b last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {(e as { classes?: { name?: string } }).classes?.name ?? "—"} · {e.type}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(e.exam_date)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No upcoming exams scheduled.
            </p>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold text-base mb-4">Quick access</h2>
        {visibleTiles.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No modules available yet — your account has no roles assigned. Ask a Super Admin to
            assign you a role.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {visibleTiles.map((m) => {
              const Icon = m.icon;
              return (
                <Link
                  key={m.slug}
                  to={m.to}
                  className="bg-tile text-tile-foreground rounded-md p-6 flex flex-col items-center justify-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <Icon className="h-7 w-7" />
                  <span className="text-xs font-medium text-center">{m.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
