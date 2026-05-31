const CACHE_PREFIX = "guilherme-portella-site-";
const CACHE_NAME = `${CACHE_PREFIX}v20260531-errors`;
const OFFLINE_PATH = "./erro/";
const PRECACHE_PATHS = [
  OFFLINE_PATH,
  "./static/css/main.css?v=20260531-errors",
  "./static/js/site.js?v=20260531-errors",
];

function scopedURL(path) {
  return new URL(path, self.registration.scope).toString();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_PATHS.map(scopedURL)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const acceptsHTML = request.headers.get("accept")?.includes("text/html");

  if (request.mode === "navigate" || acceptsHTML) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(scopedURL(OFFLINE_PATH));

        if (cached) {
          return cached;
        }

        return new Response("Offline", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }),
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      return cached || Response.error();
    }),
  );
});
