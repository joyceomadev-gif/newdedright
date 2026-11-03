import { supabase } from "@/integrations/supabase/client";

/**
 * Send a record to the Recycle Bin. Only Super Admins can restore or
 * permanently delete it afterwards.
 */
export async function softDelete(
  table: string,
  id: string,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc("soft_delete_row", {
    _table: table,
    _id: id,
    _reason: reason ?? undefined,
  });
  if (error) throw error;
}

export async function restoreRow(table: string, id: string): Promise<void> {
  const { error } = await supabase.rpc("restore_row", {
    _table: table,
    _id: id,
  });
  if (error) throw error;
}

export async function hardDeleteRow(
  table: string,
  id: string,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc("hard_delete_row", {
    _table: table,
    _id: id,
    _reason: reason ?? undefined,
  });
  if (error) throw error;
}

export type RecycleBinRow = {
  table_name: string;
  record_id: string;
  deleted_at: string;
  deleted_by: string | null;
  delete_reason: string | null;
  snapshot: Record<string, unknown>;
};

export async function listRecycleBin(table?: string): Promise<RecycleBinRow[]> {
  const rows: RecycleBinRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.rpc("list_recycle_bin", {
      _table: table ?? undefined,
    }).order("table_name").order("record_id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as RecycleBinRow[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
