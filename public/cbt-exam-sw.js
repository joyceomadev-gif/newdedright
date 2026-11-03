/**
 * Scoped Service Worker for CBT Exam Module
 *
 * Strategy:
 * - Navigation: network-first → /index.html fallback (SPA)
 * - Static assets (JS/CSS/fonts): stale-while-revalidate
 * - Supabase storage: always network (signed URLs expire)
 * - Everything else: network-only
 */

const CACHE_NAME = "cbt-exam-shell-v3";
const PRECACHE_URLS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip Supabase storage (signed URLs expire)
  if (url.hostname.includes("supabase") && url.pathname.includes("/storage/")) return;

  // Skip non-GET
  if (event.request.method !== "GET") return;

  // 1. Navigation requests → network-first, fallback to cached index.html
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match("/index.html").then(r => r || new Response("Offline — Please connect to the network.", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })))
    );
    return;
  }

  // 2. Static assets → stale-while-revalidate
  if (url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico)(\?.*)?$/) ||
      url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }
});

// Message handler for explicit cache control
self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_EXAM_SHELL") {
    event.waitUntil(
      caches.open(CACHE_NAME).then((c) => c.addAll(event.data.urls || ["/"]))
    );
  }
  if (event.data?.type === "CLEAR_EXAM_CACHE") {
    event.waitUntil(caches.delete(CACHE_NAME));
  }
});
