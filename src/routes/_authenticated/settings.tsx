import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SignedAvatarImage } from "@/lib/storage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  User, Globe, Accessibility, ShieldCheck, DatabaseBackup,
  Loader2, Upload, Download, LogOut, KeyRound, Trash2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const PREFS_KEY = "lovable.user.prefs.v1";

type Prefs = {
  language: string;
  dateFormat: string;
  timezone: string;
  currency: string;
  numberFormat: string;
  theme: "light" | "dark" | "system";
  fontSize: number; // 80-140 (%)
  highContrast: boolean;
  reduceMotion: boolean;
  underlineLinks: boolean;
  dyslexicFont: boolean;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  marketingEmails: boolean;
  shareUsageAnalytics: boolean;
};

const DEFAULT_PREFS: Prefs = {
  language: "en",
  dateFormat: "yyyy-MM-dd",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  currency: "NGN",
  numberFormat: "en-NG",
  theme: "system",
  fontSize: 100,
  highContrast: false,
  reduceMotion: false,
  underlineLinks: false,
  dyslexicFont: false,
  emailNotifications: true,
  inAppNotifications: true,
  marketingEmails: false,
  shareUsageAnalytics: true,
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { return DEFAULT_PREFS; }
}

function savePrefs(p: Prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

function applyPrefs(p: Prefs) {
  const root = document.documentElement;
  // Theme
  const wantDark = p.theme === "dark" || (p.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", wantDark);
  // Font size as root font scaling
  root.style.fontSize = `${p.fontSize}%`;
  // High contrast
  root.classList.toggle("high-contrast", p.highContrast);
  // Reduce motion
  root.classList.toggle("reduce-motion", p.reduceMotion);
  // Underline links
  root.classList.toggle("underline-links", p.underlineLinks);
  // Dyslexic-friendly font (uses system serif as fallback if no special font loaded)
  root.classList.toggle("dyslexia-friendly", p.dyslexicFont);
  // Lang attr
  root.lang = p.language;
}

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());

  useEffect(() => { applyPrefs(prefs); savePrefs(prefs); }, [prefs]);

  if (!user) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, preferences, accessibility, security, and data.</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="profile"><User className="mr-1 h-4 w-4" />Profile</TabsTrigger>
          <TabsTrigger value="language"><Globe className="mr-1 h-4 w-4" />Language & Localization</TabsTrigger>
          <TabsTrigger value="accessibility"><Accessibility className="mr-1 h-4 w-4" />Accessibility</TabsTrigger>
          <TabsTrigger value="security"><ShieldCheck className="mr-1 h-4 w-4" />Security & Privacy</TabsTrigger>
          <TabsTrigger value="backup"><DatabaseBackup className="mr-1 h-4 w-4" />Backup & Restore</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4"><ProfileTab userId={user.id} qc={qc} /></TabsContent>
        <TabsContent value="language" className="mt-4"><LanguageTab prefs={prefs} setPrefs={setPrefs} /></TabsContent>
        <TabsContent value="accessibility" className="mt-4"><AccessibilityTab prefs={prefs} setPrefs={setPrefs} /></TabsContent>
        <TabsContent value="security" className="mt-4"><SecurityTab prefs={prefs} setPrefs={setPrefs} userEmail={user.email ?? ""} /></TabsContent>
        <TabsContent value="backup" className="mt-4"><BackupTab userId={user.id} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Profile ---------------- */

function ProfileTab({ userId, qc }: { userId: string; qc: ReturnType<typeof useQueryClient> }) {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["settings", "profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: roles } = useQuery({
    queryKey: ["settings", "roles", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.role as string);
    },
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({
        full_name: fullName.trim(), phone: phone.trim() || null, avatar_url: avatarUrl || null,
      }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["settings", "profile", userId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update profile"),
  });

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("staff-photos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("staff-photos").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      toast.success("Photo uploaded — click Save to apply");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) return <Card className="p-6 text-sm"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading profile…</Card>;

  const initials = (fullName || "U").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Card className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20">
          {avatarUrl && <SignedAvatarImage bucket="staff-photos" src={avatarUrl} alt={fullName} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="space-y-1">
          <Label htmlFor="avatar-upload" className="text-sm font-medium">Profile photo</Label>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline" disabled={uploading}>
              <label htmlFor="avatar-upload" className="cursor-pointer">
                {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                Upload
              </label>
            </Button>
            <input
              id="avatar-upload" type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
            />
            {avatarUrl && (
              <Button size="sm" variant="ghost" onClick={() => setAvatarUrl("")}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG or JPG, up to ~5 MB.</p>
        </div>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={profile?.email ?? ""} disabled />
          <p className="text-[11px] text-muted-foreground">Change email under Security & Privacy.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234…" />
        </div>
        <div className="space-y-1.5">
          <Label>Roles</Label>
          <div className="flex flex-wrap gap-1 min-h-9 items-center">
            {(roles ?? []).length ? roles!.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)
              : <span className="text-xs text-muted-foreground">No roles assigned</span>}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending || !fullName.trim()}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save changes
        </Button>
      </div>
    </Card>
  );
}

/* ---------------- Language ---------------- */

const LANGUAGES = [
  { v: "en", l: "English" },
  { v: "fr", l: "Français" },
  { v: "es", l: "Español" },
  { v: "ar", l: "العربية" },
  { v: "ha", l: "Hausa" },
  { v: "yo", l: "Yorùbá" },
  { v: "ig", l: "Igbo" },
  { v: "sw", l: "Kiswahili" },
];

const TIMEZONES = [
  "UTC", "Africa/Lagos", "Africa/Nairobi", "Africa/Johannesburg",
  "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Asia/Dubai",
];

const CURRENCIES = ["NGN", "USD", "EUR", "GBP", "GHS", "KES", "ZAR", "XOF"];

function LanguageTab({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  const sample = useMemo(() => {
    const now = new Date();
    let dateStr = "";
    try {
      dateStr = new Intl.DateTimeFormat(prefs.numberFormat, {
        dateStyle: "long", timeStyle: "short", timeZone: prefs.timezone,
      }).format(now);
    } catch { dateStr = now.toString(); }
    let amount = "";
    try {
      amount = new Intl.NumberFormat(prefs.numberFormat, { style: "currency", currency: prefs.currency }).format(123456.78);
    } catch { amount = "123,456.78"; }
    return { dateStr, amount };
  }, [prefs]);

  return (
    <Card className="p-6 space-y-6 max-w-2xl">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Display language">
          <Select value={prefs.language} onValueChange={(v) => setPrefs({ ...prefs, language: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => <SelectItem key={l.v} value={l.v}>{l.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Number / region format">
          <Select value={prefs.numberFormat} onValueChange={(v) => setPrefs({ ...prefs, numberFormat: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en-NG">English (Nigeria)</SelectItem>
              <SelectItem value="en-US">English (US)</SelectItem>
              <SelectItem value="en-GB">English (UK)</SelectItem>
              <SelectItem value="fr-FR">Français (France)</SelectItem>
              <SelectItem value="es-ES">Español (España)</SelectItem>
              <SelectItem value="ar-SA">العربية</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Time zone">
          <Select value={prefs.timezone} onValueChange={(v) => setPrefs({ ...prefs, timezone: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Currency">
          <Select value={prefs.currency} onValueChange={(v) => setPrefs({ ...prefs, currency: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date format">
          <Select value={prefs.dateFormat} onValueChange={(v) => setPrefs({ ...prefs, dateFormat: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yyyy-MM-dd">2025-12-31 (ISO)</SelectItem>
              <SelectItem value="dd/MM/yyyy">31/12/2025</SelectItem>
              <SelectItem value="MM/dd/yyyy">12/31/2025</SelectItem>
              <SelectItem value="d MMM yyyy">31 Dec 2025</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Separator />

      <div className="rounded border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-medium">Preview</p>
        <p className="text-sm">Date & time: <strong>{sample.dateStr}</strong></p>
        <p className="text-sm">Currency: <strong>{sample.amount}</strong></p>
      </div>

      <p className="text-xs text-muted-foreground">
        Preferences are saved on this device. Apply will refresh the page.
      </p>
      <div className="flex justify-end">
        <Button onClick={() => { toast.success("Preferences applied"); }}>Apply</Button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/* ---------------- Accessibility ---------------- */

function AccessibilityTab({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  return (
    <Card className="p-6 space-y-6 max-w-2xl">
      <Field label="Theme">
        <Select value={prefs.theme} onValueChange={(v: any) => setPrefs({ ...prefs, theme: v })}>
          <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Text size</Label>
          <span className="text-xs text-muted-foreground">{prefs.fontSize}%</span>
        </div>
        <Slider min={80} max={140} step={5} value={[prefs.fontSize]} onValueChange={([v]) => setPrefs({ ...prefs, fontSize: v })} />
        <p className="text-xs text-muted-foreground">Adjust the base text size for the entire app.</p>
      </div>

      <Separator />

      <ToggleRow
        label="High contrast mode"
        hint="Increase contrast for better readability."
        checked={prefs.highContrast}
        onChange={(v) => setPrefs({ ...prefs, highContrast: v })}
      />
      <ToggleRow
        label="Reduce motion"
        hint="Disable non-essential animations and transitions."
        checked={prefs.reduceMotion}
        onChange={(v) => setPrefs({ ...prefs, reduceMotion: v })}
      />
      <ToggleRow
        label="Always underline links"
        hint="Adds underlines to links across the app."
        checked={prefs.underlineLinks}
        onChange={(v) => setPrefs({ ...prefs, underlineLinks: v })}
      />
      <ToggleRow
        label="Dyslexia-friendly font"
        hint="Use a higher-spacing system font for body text."
        checked={prefs.dyslexicFont}
        onChange={(v) => setPrefs({ ...prefs, dyslexicFont: v })}
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setPrefs(DEFAULT_PREFS)}>Reset to defaults</Button>
      </div>
    </Card>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* ---------------- Security & Privacy ---------------- */

function SecurityTab({ prefs, setPrefs, userEmail }: { prefs: Prefs; setPrefs: (p: Prefs) => void; userEmail: string }) {
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  async function changePassword() {
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwBusy(false);
    if (error) return toast.error(error.message);
    setNewPassword(""); setConfirmPassword("");
    toast.success("Password updated");
  }

  async function changeEmail() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { toast.error("Enter a valid email"); return; }
    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setEmailBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Confirmation email sent to your new address");
    setNewEmail("");
  }

  async function signOutEverywhere() {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) toast.error(error.message);
    else toast.success("Signed out of all devices");
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><KeyRound className="h-4 w-4" /><p className="font-medium">Password</p></div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="New password">
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password">
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={changePassword} disabled={pwBusy || !newPassword}>
            {pwBusy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Update password
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <p className="font-medium">Email address</p>
        <p className="text-xs text-muted-foreground">Current: <strong>{userEmail}</strong></p>
        <div className="flex flex-col md:flex-row gap-2">
          <Input type="email" placeholder="new@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <Button onClick={changeEmail} disabled={emailBusy || !newEmail}>
            {emailBusy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Change email
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">You'll receive a confirmation link at the new address.</p>
      </Card>

      <Card className="p-6 space-y-4">
        <p className="font-medium">Privacy preferences</p>
        <ToggleRow
          label="Email notifications"
          hint="Receive important updates by email."
          checked={prefs.emailNotifications}
          onChange={(v) => setPrefs({ ...prefs, emailNotifications: v })}
        />
        <ToggleRow
          label="In-app notifications"
          hint="Show alerts inside the app."
          checked={prefs.inAppNotifications}
          onChange={(v) => setPrefs({ ...prefs, inAppNotifications: v })}
        />
        <ToggleRow
          label="Marketing emails"
          hint="Tips, product news, and promotional content."
          checked={prefs.marketingEmails}
          onChange={(v) => setPrefs({ ...prefs, marketingEmails: v })}
        />
        <ToggleRow
          label="Share anonymous usage analytics"
          hint="Help improve the product. No personal data is shared."
          checked={prefs.shareUsageAnalytics}
          onChange={(v) => setPrefs({ ...prefs, shareUsageAnalytics: v })}
        />
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><LogOut className="h-4 w-4" /><p className="font-medium">Sessions</p></div>
        <p className="text-xs text-muted-foreground">Sign out from this account on all devices and browsers.</p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={signOutEverywhere}>Sign out everywhere</Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Backup & Restore ---------------- */

function BackupTab({ userId }: { userId: string }) {
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [importPreview, setImportPreview] = useState<any | null>(null);

  const { data: isAdmin } = useQuery({
    queryKey: ["settings", "isAdmin", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    },
  });

  async function exportPersonal() {
    setExporting(true);
    try {
      const [profile, roles, prefsRaw] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        Promise.resolve(localStorage.getItem(PREFS_KEY)),
      ]);
      const payload = {
        kind: "personal-backup",
        version: 1,
        exported_at: new Date().toISOString(),
        user_id: userId,
        profile: profile.data,
        roles: roles.data,
        preferences: prefsRaw ? JSON.parse(prefsRaw) : null,
      };
      downloadJson(payload, `personal-backup-${userId.slice(0, 8)}.json`);
      toast.success("Personal data exported");
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally { setExporting(false); }
  }

  async function exportAdmin() {
    setExporting(true);
    try {
      const tables = [
        "school_settings", "branches", "sessions", "terms", "classes", "subjects",
        "students", "parents", "staff", "fee_structures", "library_books",
      ] as const;
      const result: Record<string, any> = {};
      for (const t of tables) {
        const { data, error } = await supabase.from(t as any).select("*");
        if (error) throw new Error(`${t}: ${error.message}`);
        result[t] = data ?? [];
      }
      const payload = {
        kind: "admin-snapshot",
        version: 1,
        exported_at: new Date().toISOString(),
        tables: result,
      };
      downloadJson(payload, `admin-snapshot-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success("Snapshot exported");
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally { setExporting(false); }
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        if (!json?.kind || (json.kind !== "personal-backup" && json.kind !== "admin-snapshot")) {
          toast.error("Unrecognized backup file"); return;
        }
        setImportPreview(json);
      } catch {
        toast.error("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }

  async function applyRestore() {
    if (!importPreview) return;
    setRestoring(true);
    try {
      if (importPreview.kind === "personal-backup") {
        if (importPreview.preferences) {
          localStorage.setItem(PREFS_KEY, JSON.stringify(importPreview.preferences));
        }
        const p = importPreview.profile;
        if (p) {
          const { error } = await supabase.from("profiles").update({
            full_name: p.full_name, phone: p.phone, avatar_url: p.avatar_url,
          }).eq("id", userId);
          if (error) throw error;
        }
        toast.success("Personal data restored. Reloading…");
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast.message("Snapshot restore is read-only", { description: "Use the exported JSON to inspect or migrate data manually. Bulk restore requires a database admin." });
      }
    } catch (e: any) {
      toast.error(e.message ?? "Restore failed");
    } finally {
      setRestoring(false);
      setImportPreview(null);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><Download className="h-4 w-4" /><p className="font-medium">Export</p></div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="border rounded p-4 space-y-2">
            <p className="text-sm font-medium">Personal data</p>
            <p className="text-xs text-muted-foreground">Your profile, roles, and on-device preferences.</p>
            <Button size="sm" onClick={exportPersonal} disabled={exporting}>
              {exporting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
              Download JSON
            </Button>
          </div>
          <div className="border rounded p-4 space-y-2">
            <p className="text-sm font-medium">School snapshot</p>
            <p className="text-xs text-muted-foreground">
              Full export of core tables (admin only). Useful for off-site backups and audits.
            </p>
            <Button size="sm" onClick={exportAdmin} disabled={exporting || !isAdmin}>
              {exporting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
              Download snapshot
            </Button>
            {!isAdmin && <p className="text-[11px] text-muted-foreground">Requires admin role.</p>}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><Upload className="h-4 w-4" /><p className="font-medium">Restore</p></div>
        <p className="text-xs text-muted-foreground">
          Upload a previously exported JSON file. Personal backups restore your profile and preferences.
          School snapshots are inspected only — bulk database restore must be performed by a database administrator.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <label className="cursor-pointer">
              <Upload className="h-3 w-3 mr-1" />Choose file
              <input type="file" accept="application/json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
              />
            </label>
          </Button>
          {importPreview && (
            <Badge variant="secondary">
              {importPreview.kind} · v{importPreview.version} · {new Date(importPreview.exported_at).toLocaleString()}
            </Badge>
          )}
        </div>

        {importPreview && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Confirm restore</AlertTitle>
            <AlertDescription className="space-y-2">
              {importPreview.kind === "personal-backup" ? (
                <p className="text-xs">This will overwrite your profile name, phone, avatar, and on-device preferences with the values in the file.</p>
              ) : (
                <p className="text-xs">Snapshot restore from the UI is disabled. The file will be inspected, not written.</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={applyRestore} disabled={restoring}>
                  {restoring && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {importPreview.kind === "personal-backup" ? "Restore" : "OK"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setImportPreview(null)}>Cancel</Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </Card>
    </div>
  );
}

function downloadJson(obj: any, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
