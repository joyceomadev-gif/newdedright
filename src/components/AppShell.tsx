import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut, Bell, Menu, ShieldAlert } from "lucide-react";
import { BrandLogo, BrandName } from "@/lib/branding";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { MODULES, QUESTION_BANK_NAV } from "@/lib/modules";
import { bankReadAllowed, parseBankSearch } from "@/lib/question-bank";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { usePermissions } from "@/hooks/usePermissions";

export function AppShell() {
  const { user, roles, signOut, isStaff } = useAuth();
  const { canAccess, canAccessSubmodule, isLoading: permissionsLoading } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const visibleModules = MODULES.filter((m) => canAccess(m.slug, "read"));
  const canReadBank =
    !permissionsLoading &&
    bankReadAllowed(
      isStaff,
      canAccess("exams", "read"),
      canAccessSubmodule("exams", "question-bank", "read"),
    );
  const bankActive = location.pathname === QUESTION_BANK_NAV.to;

  // Route-level permission enforcement
  const currentModule = MODULES.find(
    (m) => location.pathname === m.to || (m.to !== "/" && location.pathname.startsWith(m.to + "/"))
  );
  const isDenied = bankActive
    ? !canReadBank
    : currentModule
      ? !canAccess(currentModule.slug, "read")
      : false;

  const initials = (user?.user_metadata?.full_name || user?.email || "U")
    .split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-muted">
      {/* Top bar */}
      <header className="h-14 bg-primary text-primary-foreground flex items-center px-4 gap-3 shadow">
        <Button variant="ghost" size="icon" className="lg:hidden text-primary-foreground hover:bg-white/10" onClick={() => setOpen(!open)}>
          <Menu className="h-5 w-5" />
        </Button>
        <BrandLogo className="h-8 w-auto rounded bg-white/10 p-0.5" />
        <h1 className="font-semibold text-lg"><BrandName /></h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
            <Bell className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
                <Avatar className="h-8 w-8"><AvatarFallback>{initials}</AvatarFallback></Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-medium">{user?.user_metadata?.full_name || "User"}</div>
                <div className="text-xs text-muted-foreground font-normal">{user?.email}</div>
                <div className="text-xs text-muted-foreground font-normal mt-1">
                  {roles.length ? roles.join(", ") : "No role assigned"}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className={`${open ? "block" : "hidden"} lg:block w-60 bg-sidebar border-r border-sidebar-border shrink-0`}>
          <nav className="p-2 space-y-0.5">
            {visibleModules.map((m) => {
              const active = location.pathname === m.to || location.pathname.startsWith(m.to + "/");
              const Icon = m.icon;
              return (
                <div key={m.slug}>
                  {m.slug === "exams" && canReadBank && (
                    <Link
                      to={QUESTION_BANK_NAV.to}
                      search={parseBankSearch({})}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${bankActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}
                    >
                      <QUESTION_BANK_NAV.icon className="h-4 w-4" />
                      <span>{QUESTION_BANK_NAV.label}</span>
                    </Link>
                  )}
                <Link
                  key={m.slug}
                  to={m.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{m.label}</span>
                </Link>
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          {isDenied ? (
            <Card className="p-8 text-center max-w-lg mx-auto mt-12 space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-bold">Access Denied</h2>
              <p className="text-sm text-muted-foreground">
                You do not have permission to view the{" "}
                <strong>{bankActive ? QUESTION_BANK_NAV.label : currentModule?.label}</strong> module.
                Please contact your school administrator if you believe this is an error.
              </p>
            </Card>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <footer className="border-t bg-background text-center text-xs text-muted-foreground py-3">
        © 2026 edition — <BrandName />
      </footer>
    </div>
  );
}
