import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/paginated-fetch";

export function fetchAdminRoleRows() {
  return fetchAllPaged(() =>
    supabase.from("user_roles").select("id,user_id,role").order("id"),
  );
}