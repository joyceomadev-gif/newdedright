import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "School Portal — Account Access" },
    { name: "description", content: "Access your school account and management portal." },
    { property: "og:title", content: "School Portal — Account Access" },
    { property: "og:description", content: "Access your school account and management portal." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  return <Navigate to={session ? "/dashboard" : "/login"} />;
}
