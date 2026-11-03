/**
 * Hook for registering the CBT Exam Service Worker
 * 
 * - Registers on student/exam routes
 * - Pre-caches current page assets on first load (for offline resilience)
 * - Handles SW updates gracefully
 */

import { useEffect } from "react";

const SW_URL = "/cbt-exam-sw.js";
const SW_SCOPE = "/";

export function useExamServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const path = window.location.pathname;
    const isExamRoute = path.startsWith("/student") || path.startsWith("/exams");
    if (!isExamRoute) return;

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });

        // Pre-cache the current page and its assets on first visit
        if (reg.active) {
          preCacheCurrentPage(reg);
        } else {
          // SW is installing — wait for it to activate, then pre-cache
          reg.addEventListener("updatefound", () => {
            const sw = reg.installing;
            if (sw) {
              sw.addEventListener("statechange", () => {
                if (sw.state === "activated") preCacheCurrentPage(reg);
              });
            }
          });
        }
      } catch (e) {
        console.log("[ExamSW] Registration failed:", e);
      }
    };

    registerSW();
  }, []);
}

/**
 * Pre-cache the current page and all linked assets (JS/CSS) so the exam shell
 * works offline even on first visit.
 */
function preCacheCurrentPage(reg: ServiceWorkerRegistration) {
  // Collect the current page URL + all script/link assets in the DOM
  const urls = new Set<string>([window.location.href, "/"]);

  document.querySelectorAll("script[src], link[rel=stylesheet]").forEach((el) => {
    const src = el.getAttribute("src") || el.getAttribute("href");
    if (src) {
      try {
        urls.add(new URL(src, window.location.origin).href);
      } catch {}
    }
  });

  if (reg.active) {
    reg.active.postMessage({
      type: "CACHE_EXAM_SHELL",
      urls: Array.from(urls),
    });
  }
}

export function sendMessageToSW(message: { type: string; urls?: string[] }) {
  navigator.serviceWorker?.controller?.postMessage(message);
}

export function clearExamCache() {
  sendMessageToSW({ type: "CLEAR_EXAM_CACHE" });
}
