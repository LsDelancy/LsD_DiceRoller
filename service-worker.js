const CACHE_NAME = "dice-roller-v12";
const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Cache the official Supabase browser client after the first
  // successful online load so the installed PWA can still start
  // when offline later.
  if (
    url.hostname === "cdn.jsdelivr.net" &&
    url.pathname.includes("/@supabase/supabase-js@2.116.0")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);

        try {
          const response = await fetch(event.request);
          cache.put(event.request, response.clone());
          return response;
        } catch {
          if (cached) return cached;
          throw new Error("Supabase client unavailable.");
        }
      })
    );

    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, copy);
        });

        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          return caches.match("./index.html");
        })
      )
  );
});

