import { useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sigma, PenSquare, Eye, EyeOff } from "lucide-react";
import { MathDialog } from "./MathDialog";
import { DiagramDialog } from "./DiagramDialog";
import { RichView } from "./RichView";

interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

export function RichEditor({ value, onChange, rows = 4, placeholder, maxLength, className }: Props) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [mathOpen, setMathOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  function insertAtCursor(text: string) {
    const ta = taRef.current;
    if (!ta) { onChange((value ?? "") + text); return; }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + text.length; });
  }

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-1">
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setMathOpen(true)} title="Insert math equation">
          <Sigma className="h-4 w-4 mr-1" />Math
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setDiagOpen(true)} title="Draw a diagram or graph">
          <PenSquare className="h-4 w-4 mr-1" />Diagram
        </Button>
        <div className="ml-auto">
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? <><EyeOff className="h-4 w-4 mr-1" />Hide preview</> : <><Eye className="h-4 w-4 mr-1" />Preview</>}
          </Button>
        </div>
      </div>
      <Textarea
        ref={taRef}
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
      {showPreview && (
        <div className="rounded-md border bg-background p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Preview</div>
          <RichView content={value} />
        </div>
      )}
      <MathDialog open={mathOpen} onClose={() => setMathOpen(false)} onInsert={(latex) => insertAtCursor(`$$${latex}$$`)} />
      <DiagramDialog open={diagOpen} onClose={() => setDiagOpen(false)} onInsert={(dataUrl) => insertAtCursor(`\n![diagram](${dataUrl})\n`)} />
    </div>
  );
}
