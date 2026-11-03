import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface SessionRow {
  id: string;
  name: string;
  is_current: boolean | null;
}

/** All academic sessions, newest first, with the current one flagged. */
export function useSessions() {
  return useQuery({
    queryKey: ["sessions", "all"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, name, is_current")
        .order("name", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });
}

/** Id of the session flagged as current (undefined while loading). */
export function useCurrentSessionId(): string | undefined {
  const { data } = useSessions();
  return data?.find((s) => s.is_current)?.id ?? data?.[0]?.id;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  /** Show an "All sessions" entry — useful for filters. */
  allowAll?: boolean;
  className?: string;
  /** Auto-select the current session when value is empty. */
  autoDefault?: boolean;
}

export const ALL_SESSIONS = "__all__";

/** Academic session picker, defaulting to the current session. */
export function SessionSelect({
  value, onChange, label = "Academic session", allowAll = false, className, autoDefault = true,
}: Props) {
  const { data: sessions } = useSessions();
  const currentId = useCurrentSessionId();

  useEffect(() => {
    if (autoDefault && !value && currentId) onChange(currentId);
  }, [autoDefault, value, currentId, onChange]);

  return (
    <div className={className ?? "space-y-1"}>
      {label && <Label className="text-xs font-medium">{label}</Label>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value={ALL_SESSIONS}>All sessions</SelectItem>}
          {(sessions ?? []).map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}{s.is_current ? " (current)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
