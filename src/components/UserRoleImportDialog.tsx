import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { BulkImportDialog } from "@/components/BulkImportDialog";
import { Button } from "@/components/ui/button";
import { importUserWithRoles } from "@/lib/user-import.functions";
import { parseUserImportRow } from "@/lib/user-import";

export function UserRoleImportDialog() {
  const importUser = useServerFn(importUserWithRoles);
  const qc = useQueryClient();
  return (
    <BulkImportDialog
      title="Import users & roles"
      description="Excel or CSV: email, full_name, phone (optional), roles. Separate multiple roles with commas, semicolons, or |. New users receive a password-setup invitation. Existing profiles and passwords remain unchanged; roles are added, never removed. Super administrator accounts are excluded."
      templateName="users-and-roles-import-template"
      templateHeaders={["email", "full_name", "phone", "roles"]}
      requiredHeaders={["email", "full_name", "roles"]}
      trigger={<Button size="sm" variant="outline"><Upload className="h-3.5 w-3.5 mr-1.5" />Import users & roles</Button>}
      onImportRow={async (row) => { await importUser({ data: parseUserImportRow(row) }); }}
      onCompleted={() => {
        qc.invalidateQueries({ queryKey: ["admin-profiles"] });
        qc.invalidateQueries({ queryKey: ["admin-roles"] });
      }}
    />
  );
}