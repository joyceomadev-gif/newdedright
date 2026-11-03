import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATES_LIST, getLgasForState } from "@/lib/nigeria-states";

interface StateLgaSelectProps {
  stateValue: string;
  lgaValue: string;
  onStateChange: (v: string) => void;
  onLgaChange: (v: string) => void;
  stateLabel?: string;
  lgaLabel?: string;
  className?: string;
}

/**
 * Two linked dropdowns: State of origin → LGA (Local Government Area).
 * When State changes, LGA resets to empty.
 */
export function StateLgaSelect({
  stateValue,
  lgaValue,
  onStateChange,
  onLgaChange,
  stateLabel = "State of origin",
  lgaLabel = "LGA",
  className,
}: StateLgaSelectProps) {
  const lgas = useMemo(() => getLgasForState(stateValue), [stateValue]);

  const handleStateChange = (v: string) => {
    onStateChange(v);
    // Reset LGA when state changes
    if (v !== stateValue) onLgaChange("");
  };

  return (
    <div className={className}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium">{stateLabel}</label>
          <Select value={stateValue || undefined} onValueChange={handleStateChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {STATES_LIST.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">{lgaLabel}</label>
          <Select
            value={lgaValue || undefined}
            onValueChange={onLgaChange}
            disabled={!stateValue}
          >
            <SelectTrigger>
              <SelectValue placeholder={stateValue ? "Select LGA" : "Select state first"} />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {lgas.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
