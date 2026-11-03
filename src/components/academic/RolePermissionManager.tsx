import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, Plus, Save, Loader2, UserCheck, Lock, ChevronDown, ChevronRight, CornerDownRight, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MODULES } from "@/lib/modules";

const BUILTIN_ROLES = [
  { id: "super_admin", label: "Super Admin", desc: "Full system administration & security bypass" },
  { id: "admin", label: "Administrator", desc: "Full administrative access" },
  { id: "head_of_section", label: "Head of Section", desc: "Sectional academic & staff supervisor" },
  { id: "teacher", label: "Teacher / Educator", desc: "Classroom instruction, result entry & CBT" },
  { id: "student", label: "Student", desc: "CBT tests, result cards & library" },
  { id: "parent", label: "Parent / Guardian", desc: "Student progress & report cards" },
];

import { useAuth } from "@/lib/auth-context";

interface PermRow {
  module_slug: string;
  can_read: boolean;
  can_write: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export function RolePermissionManager() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isSuperAdminUser = roles.includes("super_admin");
  const [selectedRole, setSelectedRole] = useState<string>("teacher");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [editedPerms, setEditedPerms] = useState<Record<string, PermRow>>({});
  const [editedSubmodulePerms, setEditedSubmodulePerms] = useState<Record<string, Record<string, PermRow>>>({});
  const [editedFunctionPerms, setEditedFunctionPerms] = useState<Record<string, Record<string, boolean>>>({});

  // Query custom roles created in DB
  const { data: customRoles = [] } = useQuery({
    queryKey: ["custom-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_roles").select("*").order("role_name");
      if (error) {
        console.warn("Could not fetch custom roles:", error);
        return [];
      }
      return data || [];
    },
  });

  const allRoles = useMemo(() => {
    const customList = customRoles.map((cr) => ({
      id: cr.role_name.toLowerCase().replace(/\s+/g, "_"),
      label: cr.role_name,
      desc: cr.description || "Custom assigned role",
    }));
    return [...BUILTIN_ROLES, ...customList];
  }, [customRoles]);

  // Query permissions for selected role
  const { data: dbPermissions = [], isLoading: loadingPerms } = useQuery({
    queryKey: ["role-permissions-manage", selectedRole],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_module_permissions")
        .select("module_slug, can_read, can_write, can_edit, can_delete")
        .eq("role", selectedRole);
      if (error) {
        toast.error("Failed to load role permissions");
        return [];
      }
      return data || [];
    },
  });

  // Combine static modules with DB values
  const currentMatrix = useMemo(() => {
    const dbMap: Record<string, PermRow> = {};
    dbPermissions.forEach((p) => {
      dbMap[p.module_slug] = {
        module_slug: p.module_slug,
        can_read: p.can_read,
        can_write: p.can_write,
        can_edit: p.can_edit,
        can_delete: p.can_delete,
      };
    });

    const matrix: Record<string, PermRow> = {};
    MODULES.forEach((m) => {
      if (editedPerms[m.slug]) {
        matrix[m.slug] = editedPerms[m.slug];
      } else if (dbMap[m.slug]) {
        matrix[m.slug] = dbMap[m.slug];
      } else {
        const isBuiltinAllowed = m.roles.includes(selectedRole as any);
        matrix[m.slug] = {
          module_slug: m.slug,
          can_read: selectedRole === "super_admin" || selectedRole === "admin" || isBuiltinAllowed,
          can_write: selectedRole === "super_admin" || selectedRole === "admin",
          can_edit: selectedRole === "super_admin" || selectedRole === "admin",
          can_delete: selectedRole === "super_admin",
        };
      }
    });
    return matrix;
  }, [dbPermissions, editedPerms, selectedRole]);

  function toggleExpand(slug: string) {
    setExpandedModules((prev) => ({ ...prev, [slug]: !prev[slug] }));
  }

  function toggleFlag(slug: string, field: "can_read" | "can_write" | "can_edit" | "can_delete", val: boolean) {
    const current = currentMatrix[slug];
    const updated = { ...current, [field]: val };
    setEditedPerms((prev) => ({ ...prev, [slug]: updated }));
  }

  function toggleSubmoduleFlag(moduleSlug: string, subSlug: string, field: "can_read" | "can_write" | "can_edit" | "can_delete") {
    setEditedSubmodulePerms((prev) => {
      const modSub = prev[moduleSlug] || {};
      const current = modSub[subSlug] || {
        module_slug: moduleSlug,
        can_read: currentMatrix[moduleSlug]?.can_read ?? true,
        can_write: currentMatrix[moduleSlug]?.can_write ?? true,
        can_edit: currentMatrix[moduleSlug]?.can_edit ?? true,
        can_delete: currentMatrix[moduleSlug]?.can_delete ?? false,
      };
      return {
        ...prev,
        [moduleSlug]: {
          ...modSub,
          [subSlug]: { ...current, [field]: !current[field] },
        },
      };
    });
  }

  function toggleFunctionFlag(moduleSlug: string, funcCode: string, subSlug?: string) {
    setEditedFunctionPerms((prev) => {
      const modFunc = prev[moduleSlug] || {};
      const subPerm = subSlug ? editedSubmodulePerms[moduleSlug]?.[subSlug] : null;
      const defaultVal = subPerm ? subPerm.can_write : (currentMatrix[moduleSlug]?.can_write ?? true);
      const current = modFunc[funcCode] !== undefined ? modFunc[funcCode] : defaultVal;
      return {
        ...prev,
        [moduleSlug]: {
          ...modFunc,
          [funcCode]: !current,
        },
      };
    });
  }

  // Create custom role mutation
  const createRoleMutation = useMutation({
    mutationFn: async () => {
      if (!newRoleName.trim()) throw new Error("Role name is required");
      const slugName = newRoleName.trim().toLowerCase().replace(/\s+/g, "_");
      const { error } = await supabase.from("custom_roles").insert({
        role_name: slugName,
        description: newRoleDesc.trim() || null,
      });
      if (error) throw error;
      return slugName;
    },
    onSuccess: (newRoleSlug) => {
      toast.success(`Custom role "${newRoleName}" created successfully`);
      setSelectedRole(newRoleSlug);
      setNewRoleName("");
      setNewRoleDesc("");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const isAdminTargetRole = ["super_admin", "admin", "admin1", "admin2", "admin3"].includes(selectedRole);

  // Save permissions mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (selectedRole === "super_admin") {
        throw new Error("Super Admin permissions are fixed with full system bypass and cannot be modified.");
      }
      if (isAdminTargetRole && !isSuperAdminUser) {
        throw new Error("Forbidden: Only Super Admins can alter administrative role permissions.");
      }

      // 1. Module level permissions
      const payloadModules = Object.values(currentMatrix).map((p) => ({
        role: selectedRole,
        module_slug: p.module_slug,
        can_read: p.can_read,
        can_write: p.can_write,
        can_edit: p.can_edit,
        can_delete: p.can_delete,
      }));

      const { error: errMod } = await supabase.from("role_module_permissions").upsert(payloadModules, {
        onConflict: "role,module_slug",
      });
      if (errMod) throw errMod;

      // 2. Submodule level permissions (if edited)
      const payloadSubmodules: any[] = [];
      Object.entries(editedSubmodulePerms).forEach(([modSlug, subs]) => {
        Object.entries(subs).forEach(([subSlug, perm]) => {
          payloadSubmodules.push({
            role: selectedRole,
            module_slug: modSlug,
            submodule_slug: subSlug,
            can_read: perm.can_read,
            can_write: perm.can_write,
            can_edit: perm.can_edit,
            can_delete: perm.can_delete,
          });
        });
      });

      if (payloadSubmodules.length > 0) {
        const { error: errSub } = await supabase.from("role_submodule_permissions").upsert(payloadSubmodules, {
          onConflict: "role,module_slug,submodule_slug",
        });
        if (errSub) throw new Error(`Submodule permissions save failed: ${errSub.message}`);
      }

      // 3. Function level permissions (if edited)
      const payloadFunctions: any[] = [];
      Object.entries(editedFunctionPerms).forEach(([modSlug, funcs]) => {
        Object.entries(funcs).forEach(([code, isAllowed]) => {
          payloadFunctions.push({
            role: selectedRole,
            module_slug: modSlug,
            function_code: code,
            is_allowed: isAllowed,
          });
        });
      });

      if (payloadFunctions.length > 0) {
        const { error: errFunc } = await supabase.from("role_function_permissions").upsert(payloadFunctions, {
          onConflict: "role,module_slug,function_code",
        });
        if (errFunc) throw new Error(`Function permissions save failed: ${errFunc.message}`);
      }
    },
    onSuccess: () => {
      toast.success(`Granular permissions for "${selectedRole}" saved successfully`);
      setEditedPerms({});
      setEditedSubmodulePerms({});
      setEditedFunctionPerms({});
      qc.invalidateQueries({ queryKey: ["role-permissions-manage", selectedRole] });
      qc.invalidateQueries({ queryKey: ["user-effective-permissions"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const activeRoleObj = allRoles.find((r) => r.id === selectedRole);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Granular Role, Submodule &amp; Action Manager
            </h3>
            <p className="text-xs text-muted-foreground">
              Configure Module, Submodule, and Function permissions (**Read**, **Write**, **Edit**, **Delete**) enforced across UI menus and backend database RPCs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add Custom Role
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" /> Create Custom System Role
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Role Name</Label>
                    <Input
                      placeholder="e.g. Bursar, Counselor, Vice Principal"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description (Optional)</Label>
                    <Input
                      placeholder="e.g. Manages fee collection and financial ledgers"
                      value={newRoleDesc}
                      onChange={(e) => setNewRoleDesc(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={() => createRoleMutation.mutate()} disabled={createRoleMutation.isPending}>
                    {createRoleMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Create Role
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || selectedRole === "super_admin" || (isAdminTargetRole && !isSuperAdminUser)}
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Permission Changes
            </Button>
          </div>
        </div>

        {/* Role Selector Badges */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t">
          {allRoles.map((r) => {
            const isSelected = r.id === selectedRole;
            const isBuiltin = BUILTIN_ROLES.some((br) => br.id === r.id);
            return (
              <Badge
                key={r.id}
                variant={isSelected ? "default" : "outline"}
                className={`cursor-pointer px-3 py-1.5 transition-all text-xs flex items-center gap-1.5 ${
                  isSelected ? "shadow-sm" : "hover:bg-accent"
                }`}
                onClick={() => {
                  setSelectedRole(r.id);
                  setEditedPerms({});
                  setEditedSubmodulePerms({});
                  setEditedFunctionPerms({});
                }}
              >
                {r.id === "super_admin" && <KeyRound className="h-3 w-3 text-amber-400" />}
                {r.label}
                {!isBuiltin && <span className="text-[10px] opacity-70">(Custom)</span>}
              </Badge>
            );
          })}
        </div>

        {activeRoleObj && (
          <div className="text-xs bg-muted/40 p-2.5 rounded-md border flex items-center justify-between">
            <div>
              <span className="font-medium text-foreground">{activeRoleObj.label}</span>:{" "}
              <span className="text-muted-foreground">{activeRoleObj.desc}</span>
            </div>
            {selectedRole === "super_admin" && (
              <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
                <Lock className="h-3 w-3" /> Full Security Bypass
              </Badge>
            )}
          </div>
        )}
      </Card>

      {/* Permissions Matrix */}
      <Card className="overflow-hidden">
        {loadingPerms ? (
          <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading permissions matrix...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[300px]">Module / Submodule / Action</TableHead>
                <TableHead className="text-center w-[90px]">Read</TableHead>
                <TableHead className="text-center w-[90px]">Write</TableHead>
                <TableHead className="text-center w-[90px]">Edit</TableHead>
                <TableHead className="text-center w-[90px]">Delete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MODULES.map((m) => {
                const Icon = m.icon;
                const row = currentMatrix[m.slug] || { can_read: false, can_write: false, can_edit: false, can_delete: false };
                const isSuper = selectedRole === "super_admin";
                const hasSubOrFunc = (m.submodules && m.submodules.length > 0) || (m.functions && m.functions.length > 0);
                const isExpanded = Boolean(expandedModules[m.slug]);

                return (
                  <div key={m.slug} className="contents">
                    <TableRow className="hover:bg-muted/20">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {hasSubOrFunc ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 p-0 hover:bg-muted"
                              onClick={() => toggleExpand(m.slug)}
                            >
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </Button>
                          ) : (
                            <div className="w-5" />
                          )}
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span>{m.label}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">({m.slug})</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={row.can_read}
                          disabled={isSuper}
                          onCheckedChange={(val) => toggleFlag(m.slug, "can_read", Boolean(val))}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={row.can_write}
                          disabled={isSuper}
                          onCheckedChange={(val) => toggleFlag(m.slug, "can_write", Boolean(val))}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={row.can_edit}
                          disabled={isSuper}
                          onCheckedChange={(val) => toggleFlag(m.slug, "can_edit", Boolean(val))}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={row.can_delete}
                          disabled={isSuper}
                          onCheckedChange={(val) => toggleFlag(m.slug, "can_delete", Boolean(val))}
                        />
                      </TableCell>
                    </TableRow>

                    {/* Submodules Rows */}
                    {isExpanded && m.submodules?.map((sub) => {
                      const subPerms = editedSubmodulePerms[m.slug]?.[sub.slug] || {
                        can_read: row.can_read,
                        can_write: row.can_write,
                        can_edit: row.can_edit,
                        can_delete: row.can_delete,
                      };

                      return (
                        <div key={`${m.slug}-${sub.slug}`} className="contents">
                          <TableRow className="bg-muted/10 hover:bg-muted/30">
                            <TableCell className="pl-10">
                              <div className="flex items-center gap-2 text-xs">
                                <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium text-foreground">{sub.label}</span>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono">
                                  {sub.slug}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={subPerms.can_read}
                                disabled={isSuper}
                                onCheckedChange={() => toggleSubmoduleFlag(m.slug, sub.slug, "can_read")}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={subPerms.can_write}
                                disabled={isSuper}
                                onCheckedChange={() => toggleSubmoduleFlag(m.slug, sub.slug, "can_write")}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={subPerms.can_edit}
                                disabled={isSuper}
                                onCheckedChange={() => toggleSubmoduleFlag(m.slug, sub.slug, "can_edit")}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={subPerms.can_delete}
                                disabled={isSuper}
                                onCheckedChange={() => toggleSubmoduleFlag(m.slug, sub.slug, "can_delete")}
                              />
                            </TableCell>
                          </TableRow>

                          {/* Functions under Submodule */}
                          {sub.functions?.map((func) => {
                            const isAllowed = editedFunctionPerms[m.slug]?.[func.code] !== undefined
                              ? editedFunctionPerms[m.slug][func.code]
                              : subPerms.can_write;

                            return (
                              <TableRow key={`${m.slug}-${sub.slug}-${func.code}`} className="bg-muted/15 hover:bg-muted/35">
                                <TableCell className="pl-16" colSpan={3}>
                                  <div className="flex items-center gap-2 text-xs">
                                    <CornerDownRight className="h-3.5 w-3.5 text-primary/70" />
                                    <span className="font-semibold text-primary">{func.label}</span>
                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-mono">
                                      {func.code}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center" colSpan={2}>
                                  <Button
                                    variant={isAllowed ? "default" : "outline"}
                                    size="sm"
                                    className="h-6 text-[10px] px-2.5"
                                    disabled={isSuper}
                                    onClick={() => toggleFunctionFlag(m.slug, func.code, sub.slug)}
                                  >
                                    {isAllowed ? "Allowed" : "Denied"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </div>
                      );
                    })}

                    {/* Direct Module Functions Rows */}
                    {isExpanded && m.functions?.map((func) => {
                      const isAllowed = editedFunctionPerms[m.slug]?.[func.code] !== undefined
                        ? editedFunctionPerms[m.slug][func.code]
                        : row.can_write;

                      return (
                        <TableRow key={`${m.slug}-${func.code}`} className="bg-muted/15 hover:bg-muted/35">
                          <TableCell className="pl-12" colSpan={3}>
                            <div className="flex items-center gap-2 text-xs">
                              <CornerDownRight className="h-3.5 w-3.5 text-primary/70" />
                              <span className="font-semibold text-primary">{func.label}</span>
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-mono">
                                {func.code}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-center" colSpan={2}>
                            <Button
                              variant={isAllowed ? "default" : "outline"}
                              size="sm"
                              className="h-6 text-[10px] px-2.5"
                              disabled={isSuper}
                              onClick={() => toggleFunctionFlag(m.slug, func.code)}
                            >
                              {isAllowed ? "Allowed" : "Denied"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </div>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
