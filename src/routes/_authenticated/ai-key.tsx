import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, KeyRound, ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { checkAiKey, type AiKeyStatus } from "@/lib/ai-key.functions";

export const Route = createFileRoute("/_authenticated/ai-key")({
  component: AiKeyPage,
  head: () => ({
    meta: [
      { title: "AI Key Health — De-Bright Admin" },
      {
        name: "description",
        content:
          "Admin-only console to verify that the Lovable AI key has synced to the backend and test the AI gateway connection.",
      },
      { property: "og:title", content: "AI Key Health — De-Bright Admin" },
      {
        property: "og:description",
        content: "Verify AI key sync and test the AI gateway without exposing the secret.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AiKeyPage() {
  const { isAdmin, loading } = useAuth();
  const run = useServerFn(checkAiKey);
  const [status, setStatus] = useState<AiKeyStatus | null>(null);

  const test = useMutation({
    mutationFn: async () => (await run({})) as AiKeyStatus,
    onSuccess: (res) => {
      setStatus(res);
      if (res.ok) toast.success("AI key is live on the backend.");
      else toast.error(res.message);
    },
    onError: (e: Error) => toast.error(e.message || "Test failed."),
  });

  if (loading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        You need admin access to manage the AI key.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">AI key health</h1>
        <p className="text-sm text-muted-foreground">
          Check that the AI key stored in the backend is live. The key value itself is never sent to
          the browser — only a short fingerprint so you can tell rotations apart.
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => test.mutate()} disabled={test.isPending}>
            {test.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Test AI key
          </Button>
          {status && (
            <Badge variant={status.ok ? "default" : "destructive"} className="gap-1">
              {status.ok ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
              {status.ok ? "Healthy" : "Problem"}
            </Badge>
          )}
        </div>

        {status && (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Configured in backend" value={status.configured ? "Yes" : "No"} />
            <Row label="Key fingerprint" value={status.fingerprint ?? "—"} mono />
            <Row label="Key length" value={status.keyLength ? `${status.keyLength} chars` : "—"} />
            <Row label="Gateway status" value={status.gatewayStatus?.toString() ?? "—"} />
            <Row label="Round trip" value={status.latencyMs != null ? `${status.latencyMs} ms` : "—"} />
            <Row label="Checked at" value={new Date(status.checkedAt).toLocaleString()} />
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Result</dt>
              <dd>{status.message}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="flex items-center gap-2 text-base font-medium">
          <KeyRound className="h-4 w-4" /> Rotating the key
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Note the current fingerprint above.</li>
          <li>Request a rotation from the build assistant (the key is minted and stored server-side).</li>
          <li>Wait about a minute for the backend environment to pick up the new value.</li>
          <li>Run <strong>Test AI key</strong> again — a new fingerprint plus a healthy badge confirms the rotation synced.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          The previous key keeps working for roughly an hour after a rotation, so AI features stay
          online during the switch.
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono" : undefined}>{value}</dd>
    </div>
  );
}
