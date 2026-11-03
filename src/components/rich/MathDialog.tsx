import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Mathlive web-component – loaded on demand (client only)
let mathliveLoaded: Promise<void> | null = null;
function loadMathlive() {
  if (typeof window === "undefined") return Promise.resolve();
  if (!mathliveLoaded) mathliveLoaded = import("mathlive").then(() => undefined);
  return mathliveLoaded;
}

interface Props {
  open: boolean;
  initial?: string;
  onClose: () => void;
  onInsert: (latex: string) => void;
}

export function MathDialog({ open, initial = "", onClose, onInsert }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [value, setValue] = useState(initial);

  useEffect(() => { if (open) loadMathlive().then(() => setReady(true)); }, [open]);
  useEffect(() => { setValue(initial); }, [initial, open]);

  useEffect(() => {
    if (!ready || !open || !hostRef.current) return;
    const host = hostRef.current;
    host.innerHTML = "";
    const el = document.createElement("math-field") as HTMLElement & { value: string };
    el.setAttribute("virtual-keyboard-mode", "auto");
    el.setAttribute(
      "style",
      "width:100%;min-height:120px;font-size:1.25rem;padding:.5rem;border:1px solid hsl(var(--border));border-radius:.5rem;background:hsl(var(--background));color:hsl(var(--foreground));"
    );
    el.value = value;
    const handleInput = () => setValue(el.value);
    el.addEventListener("input", handleInput);
    host.appendChild(el);
    return () => {
      el.removeEventListener("input", handleInput);
      host.innerHTML = "";
    };
  }, [ready, open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-2xl"
        onInteractOutside={(e) => {
          const path = e.composedPath ? e.composedPath() : [];
          const isMathlive = path.some((el) => {
            if (!(el instanceof HTMLElement)) return false;
            const tag = el.tagName.toLowerCase();
            return (
              tag === "math-field" ||
              el.classList.contains("ML__keyboard") ||
              el.classList.contains("mathlive-virtual-keyboard") ||
              el.getAttribute("data-ml-keyboard") != null
            );
          });
          if (isMathlive) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          const path = e.composedPath ? e.composedPath() : [];
          const isMathlive = path.some((el) => {
            if (!(el instanceof HTMLElement)) return false;
            const tag = el.tagName.toLowerCase();
            return (
              tag === "math-field" ||
              el.classList.contains("ML__keyboard") ||
              el.classList.contains("mathlive-virtual-keyboard") ||
              el.getAttribute("data-ml-keyboard") != null
            );
          });
          if (isMathlive) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Insert equation</DialogTitle>
          <DialogDescription>Use the toolbar / virtual keyboard for fractions, integrals, Greek letters, matrices, etc. Output is LaTeX.</DialogDescription>
        </DialogHeader>
        <div ref={hostRef} />
        <p className="text-xs text-muted-foreground">LaTeX: <code className="font-mono">{value || "—"}</code></p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onInsert(value.trim()); onClose(); }} disabled={!value.trim()}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
