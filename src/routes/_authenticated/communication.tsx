import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichEditor } from "@/components/rich/RichEditor";
import { RichView } from "@/components/rich/RichView";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MessageSquare, Megaphone, CalendarDays, Bell, Send, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { softDelete } from "@/lib/soft-delete";

export const Route = createFileRoute("/_authenticated/communication")({
  component: CommunicationPage,
});

function CommunicationPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Communication</h1>
        <p className="text-sm text-muted-foreground">
          Messaging, announcements, parent-teacher meetings, and notifications.
        </p>
      </div>
      <Tabs defaultValue="messages">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="messages"><MessageSquare className="h-4 w-4 mr-1.5" />Messages</TabsTrigger>
          <TabsTrigger value="announcements"><Megaphone className="h-4 w-4 mr-1.5" />Announcements</TabsTrigger>
          <TabsTrigger value="meetings"><CalendarDays className="h-4 w-4 mr-1.5" />Meetings</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-1.5" />Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="messages" className="mt-4"><Messages /></TabsContent>
        <TabsContent value="announcements" className="mt-4"><Announcements /></TabsContent>
        <TabsContent value="meetings" className="mt-4"><Meetings /></TabsContent>
        <TabsContent value="notifications" className="mt-4"><Notifications /></TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------------- Messages -------------------------------- */

type Profile = { id: string; full_name: string; email: string | null };

function Messages() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [peer, setPeer] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");

  const { data: contacts } = useQuery({
    queryKey: ["comm", "contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["comm", "messages", user?.id, peer],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const conversations = useMemo(() => {
    const map = new Map<string, { peer: string; last: string; unread: number }>();
    (messages ?? []).forEach((m) => {
      const other = m.sender_id === user?.id ? m.receiver_id : m.sender_id;
      const e = map.get(other);
      if (!e) {
        map.set(other, {
          peer: other,
          last: m.created_at,
          unread: m.receiver_id === user?.id && !m.read_at ? 1 : 0,
        });
      } else if (m.receiver_id === user?.id && !m.read_at) {
        e.unread += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.last < b.last ? 1 : -1));
  }, [messages, user?.id]);

  const thread = useMemo(() => {
    if (!peer) return [];
    return (messages ?? [])
      .filter((m) =>
        (m.sender_id === user?.id && m.receiver_id === peer) ||
        (m.sender_id === peer && m.receiver_id === user?.id),
      )
      .slice()
      .reverse();
  }, [messages, peer, user?.id]);

  // Mark unread incoming messages from this peer as read whenever the thread opens/updates.
  useEffect(() => {
    if (!peer || !user?.id) return;
    const unreadIds = thread
      .filter((m) => m.receiver_id === user.id && m.sender_id === peer && !m.read_at)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    (async () => {
      const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
      if (!error) qc.invalidateQueries({ queryKey: ["comm", "messages"] });
    })();
  }, [peer, user?.id, thread, qc]);


  const send = useMutation({
    mutationFn: async () => {
      if (!user?.id || !peer || !body.trim()) throw new Error("Missing data");
      const { error } = await supabase.from("messages").insert({
        sender_id: user.id,
        receiver_id: peer,
        subject: subject || null,
        content: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody(""); setSubject("");
      qc.invalidateQueries({ queryKey: ["comm", "messages"] });
      toast.success("Message sent");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const nameOf = (id: string) => contacts?.find((c) => c.id === id)?.full_name ?? id.slice(0, 8);

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <Card className="p-3 space-y-2 max-h-[70vh] overflow-auto">
        <div className="text-sm font-medium px-1">Conversations</div>
        {conversations.length === 0 && <p className="text-xs text-muted-foreground px-1">No messages yet.</p>}
        {conversations.map((c) => (
          <button
            key={c.peer}
            onClick={() => setPeer(c.peer)}
            className={`w-full text-left rounded-md px-2 py-1.5 hover:bg-accent ${peer === c.peer ? "bg-accent" : ""}`}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="truncate">{nameOf(c.peer)}</span>
              {c.unread > 0 && <Badge className="ml-2">{c.unread}</Badge>}
            </div>
          </button>
        ))}
        <div className="pt-2 border-t">
          <Label className="text-xs">Start new conversation</Label>
          <Select value={peer ?? ""} onValueChange={setPeer}>
            <SelectTrigger><SelectValue placeholder="Choose contact" /></SelectTrigger>
            <SelectContent>
              {(contacts ?? []).filter((c) => c.id !== user?.id).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-3 flex flex-col h-[70vh]">
        {peer ? (
          <>
            <div className="border-b pb-2 mb-2 font-medium">{nameOf(peer)}</div>
            <div className="flex-1 overflow-auto space-y-2 pr-1">
              {thread.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {m.subject && <div className="font-medium text-xs mb-0.5 opacity-80">{m.subject}</div>}
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      <div className="text-[10px] opacity-70 mt-1 flex items-center gap-1">
                        <span>{new Date(m.created_at).toLocaleString()}</span>
                        {mine && <span>· {m.read_at ? "Read" : "Sent"}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {thread.length === 0 && <p className="text-sm text-muted-foreground">No messages yet. Say hello.</p>}
            </div>
            <div className="border-t pt-2 space-y-2">
              <Input placeholder="Subject (optional)" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <div className="flex gap-2">
                <Textarea placeholder="Type a message…" value={body} onChange={(e) => setBody(e.target.value)} rows={2} />
                <Button onClick={() => send.mutate()} disabled={send.isPending || !body.trim()}>
                  {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
            Select a conversation to start chatting.
          </div>
        )}
      </Card>
    </div>
  );
}

/* ----------------------------- Announcements ----------------------------- */

function Announcements() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "all", expires_at: "", published: true });

  const { data: items, isLoading } = useQuery({
    queryKey: ["comm", "announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        published: form.published,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        posted_by: user?.id ?? null,
      };
      if (!payload.title || !payload.body) throw new Error("Title and body required");
      const { error } = await supabase.from("announcements").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setForm({ title: "", body: "", audience: "all", expires_at: "", published: true });
      qc.invalidateQueries({ queryKey: ["comm", "announcements"] });
      toast.success("Announcement posted");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("announcements", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "announcements"] }),
  });

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1.5" />New announcement</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New announcement</DialogTitle>
                <DialogDescription>Post a circular visible to your selected audience.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>Body</Label><RichEditor rows={5} value={form.body} onChange={(v) => setForm({ ...form, body: v })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Audience</Label>
                    <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="students">Students</SelectItem>
                        <SelectItem value="parents">Parents</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Expires (optional)</Label><Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.published} onCheckedChange={(v) => setForm({ ...form, published: v })} />
                  <Label className="!m-0">Published</Label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Post
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
        <div className="space-y-3">
          {(items ?? []).map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{a.title}</h3>
                    <Badge variant="secondary">{a.audience}</Badge>
                    {!a.published && <Badge variant="outline">Draft</Badge>}
                  </div>
                  <RichView content={a.body} className="text-sm mt-1" />
                  <p className="text-xs text-muted-foreground mt-2">
                    Posted {new Date(a.created_at).toLocaleString()}
                    {a.expires_at && ` · expires ${new Date(a.expires_at).toLocaleString()}`}
                  </p>
                </div>
                {isAdmin && (
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(a.id)}>Delete</Button>
                )}
              </div>
            </Card>
          ))}
          {(items ?? []).length === 0 && <p className="text-sm text-muted-foreground">No announcements yet.</p>}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Meetings ------------------------------- */

function Meetings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    parent_id: "", teacher_id: "", student_id: "",
    scheduled_at: "", duration_minutes: 30, location: "", agenda: "",
  });

  const { data: meetings } = useQuery({
    queryKey: ["comm", "meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parent_teacher_meetings")
        .select("*")
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: parents } = useQuery({
    queryKey: ["comm", "parents"],
    queryFn: async () => (await supabase.from("parents").select("id, full_name").order("full_name")).data ?? [],
  });
  const { data: teachers } = useQuery({
    queryKey: ["comm", "teachers"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("staff_directory").select("id, full_name, position").order("full_name");
      return (data ?? []) as { id: string; full_name: string; position: string | null }[];
    },
  });
  const { data: students } = useQuery({
    queryKey: ["comm", "students"],
    queryFn: async () => (await supabase.from("students").select("id, full_name, admission_no").order("full_name")).data ?? [],
  });

  const nameOf = <T extends { id: string; full_name: string }>(arr: T[] | undefined, id: string | null) =>
    arr?.find((a) => a.id === id)?.full_name ?? "—";

  const create = useMutation({
    mutationFn: async () => {
      if (!form.parent_id || !form.teacher_id || !form.scheduled_at) throw new Error("Parent, teacher and date required");
      const { error } = await supabase.from("parent_teacher_meetings").insert({
        parent_id: form.parent_id,
        teacher_id: form.teacher_id,
        student_id: form.student_id || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        duration_minutes: Number(form.duration_minutes) || 30,
        location: form.location || null,
        agenda: form.agenda || null,
        status: "requested",
        requested_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setForm({ parent_id: "", teacher_id: "", student_id: "", scheduled_at: "", duration_minutes: 30, location: "", agenda: "" });
      qc.invalidateQueries({ queryKey: ["comm", "meetings"] });
      toast.success("Meeting requested");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [statusAction, setStatusAction] = useState<{
    id: string;
    next: "confirmed" | "completed" | "cancelled";
    existingNotes: string | null;
  } | null>(null);
  const [statusNotes, setStatusNotes] = useState("");

  const setStatus = useMutation({
    mutationFn: async ({ id, status, notes, existingNotes }: {
      id: string; status: string; notes: string; existingNotes: string | null;
    }) => {
      const stamp = new Date().toLocaleString();
      const trimmed = notes.trim();
      const appended = trimmed
        ? `${existingNotes ? existingNotes + "\n\n" : ""}[${stamp} · ${status}] ${trimmed}`
        : existingNotes;
      const { error } = await supabase
        .from("parent_teacher_meetings")
        .update({ status: status as never, notes: appended })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm", "meetings"] });
      setStatusAction(null);
      setStatusNotes("");
      toast.success("Meeting updated");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openStatus = (id: string, next: "confirmed" | "completed" | "cancelled", existingNotes: string | null) => {
    setStatusAction({ id, next, existingNotes });
    setStatusNotes("");
  };


  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1.5" />Schedule meeting</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule parent-teacher meeting</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Parent</Label>
                  <Select value={form.parent_id} onValueChange={(v) => setForm({ ...form, parent_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose parent" /></SelectTrigger>
                    <SelectContent>{(parents ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Teacher</Label>
                  <Select value={form.teacher_id} onValueChange={(v) => setForm({ ...form, teacher_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose teacher" /></SelectTrigger>
                    <SelectContent>{(teachers ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Student (optional)</Label>
                <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger>
                  <SelectContent>{(students ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.admission_no})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date & time</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
                <div><Label>Duration (min)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></div>
              </div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Office 12 / Google Meet" /></div>
              <div><Label>Agenda</Label><Textarea value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} rows={3} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(meetings ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap">{new Date(m.scheduled_at).toLocaleString()}<div className="text-xs text-muted-foreground">{m.duration_minutes} min</div></TableCell>
                <TableCell>{nameOf(parents, m.parent_id)}</TableCell>
                <TableCell>{nameOf(teachers, m.teacher_id)}</TableCell>
                <TableCell>{nameOf(students, m.student_id)}</TableCell>
                <TableCell>{m.location || "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{m.status}</Badge>
                  {m.status_changed_at && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(m.status_changed_at).toLocaleString()}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {m.status === "requested" && (
                    <Button size="sm" variant="outline" onClick={() => openStatus(m.id, "confirmed", m.notes)}>Confirm</Button>
                  )}
                  {m.status === "confirmed" && (
                    <Button size="sm" variant="outline" onClick={() => openStatus(m.id, "completed", m.notes)}>Complete</Button>
                  )}
                  {m.status !== "cancelled" && m.status !== "completed" && (
                    <Button size="sm" variant="ghost" onClick={() => openStatus(m.id, "cancelled", m.notes)}>Cancel</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(meetings ?? []).length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No meetings scheduled.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!statusAction} onOpenChange={(o) => !o && setStatusAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusAction?.next === "confirmed" && "Confirm meeting"}
              {statusAction?.next === "completed" && "Mark meeting completed"}
              {statusAction?.next === "cancelled" && "Cancel meeting"}
            </DialogTitle>
            <DialogDescription>
              The status change is timestamped automatically. Add an optional note for the record.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea rows={3} value={statusNotes} onChange={(e) => setStatusNotes(e.target.value)} placeholder="e.g. Confirmed via phone with parent" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStatusAction(null)}>Close</Button>
            <Button
              onClick={() => statusAction && setStatus.mutate({
                id: statusAction.id,
                status: statusAction.next,
                notes: statusNotes,
                existingNotes: statusAction.existingNotes,
              })}
              disabled={setStatus.isPending}
            >
              {setStatus.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/* ----------------------------- Notifications ----------------------------- */

function Notifications() {
  const { user, isStaff } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ recipient_user_id: "", channel: "in_app", subject: "", body: "" });

  const { data: list } = useQuery({
    queryKey: ["comm", "notifications", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: people } = useQuery({
    queryKey: ["comm", "profiles-all"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name").order("full_name")).data ?? [],
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!form.recipient_user_id || !form.body.trim()) throw new Error("Recipient and message required");
      const { error } = await supabase.from("notifications").insert({
        recipient_user_id: form.recipient_user_id,
        channel: form.channel as never,
        subject: form.subject || null,
        body: form.body.trim(),
        status: form.channel === "in_app" ? "sent" : "queued",
        sent_at: form.channel === "in_app" ? new Date().toISOString() : null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setForm({ recipient_user_id: "", channel: "in_app", subject: "", body: "" });
      qc.invalidateQueries({ queryKey: ["comm", "notifications"] });
      toast.success("Notification queued");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ status: "read", read_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "notifications"] }),
  });

  return (
    <div className="space-y-4">
      {isStaff && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Send className="h-4 w-4 mr-1.5" />Send notification</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send notification</DialogTitle>
                <DialogDescription>In-app delivers immediately. Email/SMS are queued for the configured provider.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Recipient</Label>
                  <Select value={form.recipient_user_id} onValueChange={(v) => setForm({ ...form, recipient_user_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose user" /></SelectTrigger>
                    <SelectContent>{(people ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Channel</Label>
                  <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_app">In-app</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                <div><Label>Message</Label><RichEditor rows={4} value={form.body} onChange={(v) => setForm({ ...form, body: v })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={() => send.mutate()} disabled={send.isPending}>
                  {send.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Send
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Body</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list ?? []).map((n) => (
              <TableRow key={n.id}>
                <TableCell className="whitespace-nowrap">{new Date(n.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge variant="secondary">{n.channel}</Badge></TableCell>
                <TableCell>{n.subject || "—"}</TableCell>
                <TableCell className="max-w-md truncate">{n.body}</TableCell>
                <TableCell><Badge>{n.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {n.recipient_user_id === user?.id && n.status !== "read" && (
                    <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>Mark read</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(list ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No notifications.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <p className="text-xs text-muted-foreground">
        Email and SMS notifications are recorded as queued. To deliver them, an email provider or SMS connector (e.g. Twilio) must be enabled — contact ZGIL Solutions at sales@zgils.com to configure delivery.
      </p>
    </div>
  );
}
