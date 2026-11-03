import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface BrowserInfo {
  name: string;
  version: number;
  supported: boolean;
}

// Minimum versions that reliably support modern JS/CSS features we ship.
const MIN = {
  chrome: 110,
  edge: 110,
  firefox: 115,
  safari: 15,
  opera: 96,
  samsung: 20,
};

function detect(ua: string): BrowserInfo {
  const s = ua || "";
  if (/MSIE |Trident\//i.test(s)) return { name: "Internet Explorer", version: 0, supported: false };
  let m: RegExpMatchArray | null;
  if ((m = s.match(/Edg\/(\d+)/))) return { name: "Edge", version: +m[1], supported: +m[1] >= MIN.edge };
  if ((m = s.match(/OPR\/(\d+)/))) return { name: "Opera", version: +m[1], supported: +m[1] >= MIN.opera };
  if ((m = s.match(/SamsungBrowser\/(\d+)/))) return { name: "Samsung Internet", version: +m[1], supported: +m[1] >= MIN.samsung };
  if ((m = s.match(/Firefox\/(\d+)/))) return { name: "Firefox", version: +m[1], supported: +m[1] >= MIN.firefox };
  if ((m = s.match(/Chrome\/(\d+)/))) return { name: "Chrome", version: +m[1], supported: +m[1] >= MIN.chrome };
  if ((m = s.match(/Version\/(\d+).*Safari\//))) return { name: "Safari", version: +m[1], supported: +m[1] >= MIN.safari };
  return { name: "your browser", version: 0, supported: true };
}

const DISMISS_KEY = "mv:browser-banner-dismissed";

export function UnsupportedBrowserBanner() {
  const [info, setInfo] = useState<BrowserInfo | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const detected = detect(navigator.userAgent);
    setInfo(detected);
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!info || info.supported || dismissed) return null;

  return (
    <div
      role="alert"
      className="fixed top-0 inset-x-0 z-[100] bg-amber-500/95 text-amber-950 shadow-md"
    >
      <div className="max-w-6xl mx-auto flex items-start gap-3 px-4 py-2 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1">
          <strong className="font-semibold">
            {info.name}
            {info.version ? ` ${info.version}` : ""} isn't fully supported.
          </strong>{" "}
          Some pages may not display correctly. Please update to the latest{" "}
          <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer noopener" className="underline font-medium">Chrome</a>,{" "}
          <a href="https://www.microsoft.com/edge" target="_blank" rel="noreferrer noopener" className="underline font-medium">Edge</a>,{" "}
          <a href="https://www.mozilla.org/firefox/new/" target="_blank" rel="noreferrer noopener" className="underline font-medium">Firefox</a>, or{" "}
          <a href="https://support.apple.com/downloads/safari" target="_blank" rel="noreferrer noopener" className="underline font-medium">Safari</a>{" "}
          for the best experience.
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
            setDismissed(true);
          }}
          className="p-1 rounded hover:bg-amber-600/30"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
