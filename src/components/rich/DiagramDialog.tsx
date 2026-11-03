import { lazy, Suspense, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ExcalidrawHost = lazy(async () => {
  const mod = await import("@excalidraw/excalidraw");
  const { Excalidraw, exportToBlob } = mod;
  return {
    default: function Host({ onReady }: { onReady: (api: { export: () => Promise<string> }) => void }) {
      const apiRef = useRef<unknown>(null);
      return (
        <div style={{ height: 480 }}>
          <Excalidraw
            excalidrawAPI={(api: unknown) => {
              apiRef.current = api;
              onReady({
                export: async () => {
                  const a = apiRef.current as { getSceneElements: () => unknown[]; getAppState: () => unknown; getFiles: () => unknown };
                  const blob = await exportToBlob({
                    elements: a.getSceneElements() as never,
                    appState: { ...(a.getAppState() as object), exportBackground: true } as never,
                    files: a.getFiles() as never,
                    mimeType: "image/png",
                  });
                  return await new Promise<string>((resolve) => {
                    const r = new FileReader();
                    r.onload = () => resolve(String(r.result));
                    r.readAsDataURL(blob);
                  });
                },
              });
            }}
          />
        </div>
      );
    },
  };
});

interface Props {
  open: boolean;
  onClose: () => void;
  onInsert: (dataUrl: string) => void;
}

export function DiagramDialog({ open, onClose, onInsert }: Props) {
  const [api, setApi] = useState<{ export: () => Promise<string> } | null>(null);
  const [busy, setBusy] = useState(false);

  async function insert() {
    if (!api) return;
    setBusy(true);
    try { const url = await api.export(); onInsert(url); onClose(); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Draw diagram</DialogTitle>
          <DialogDescription>Draw graphs, geometry, free-body diagrams, circuits, etc. The drawing is inserted as an image.</DialogDescription>
        </DialogHeader>
        <Suspense fallback={<div className="h-[480px] flex items-center justify-center text-sm text-muted-foreground">Loading canvas…</div>}>
          <ExcalidrawHost onReady={setApi} />
        </Suspense>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={insert} disabled={!api || busy}>{busy ? "Inserting…" : "Insert"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
