// ===== TRS:80 PWA Service Worker =====
// Safe: GET-only + same-origin. Won't touch cross-origin requests or POST/PUT.

const CACHE_NAME = "trs80-shell-v2"; // <— bump this when you change PRECACHE_URLS

// Compute base path dynamically (e.g., "/TRS80/")
const BASE = new URL('./', self.location).pathname;

// Keep precache tiny (shell only). Missing files are ignored during install.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.webmanifest",

  // Core modules (add/remove to match your repo; missing ones are ignored):
  "./modules/overview.js",
  "./modules/lance.js",
  "./modules/sheet.js",
  "./modules/image.js",
  "./modules/rolls.js"      // <— added
];

// ---- Install: best-effort precache (ignores missing files) ----
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of PRECACHE_URLS) {
      try { await cache.add(url); } catch (_) { /* ignore 404s */ }
    }
  })());
});

// ---- Activate: purge old caches on version bump ----
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
  })());
});

// Helpers for path checks under BASE
const under = (path) => (p) => p.startsWith(BASE + path);
const isAssets = under("assets/");
const isData   = under("data/");

// ---- Fetch with safeguards ----
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                 // don't touch POST/PUT/etc.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // leave cross-origin alone

  const path = url.pathname;

  // A) Navigations → network-first (fallback to cached index.html when offline)
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const clone = net.clone();
        const c = await caches.open(CACHE_NAME);
        c.put(req, clone);
        return net;
      } catch {
        return (await caches.match("./index.html")) ||
               (await caches.match(req)) ||
               new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }

  // B) App shell files → cache-first (fast offline)
  const isShell = PRECACHE_URLS.some(u => url.pathname.endsWith(u.replace("./", "/")));
  if (isShell) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
        return res;
      }))
    );
    return;
  }

  // C) Project data (assets/ & data/) → stale-while-revalidate (snappy + updates)
  if (isAssets(path) || isData(path)) {
    event.respondWith(
      caches.match(req).then(cached => {
        const net = fetch(req).then(res => {
          caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
          return res;
        }).catch(() => cached || Promise.reject("offline"));
        return cached || net;
      })
    );
    return;
  }

  // D) Default → network-first with cache fallback
  event.respondWith(
    fetch(req).then(res => {
      caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req))
  );
});
