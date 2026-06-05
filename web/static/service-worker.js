const CACHE_PREFIX = "guilherme-portella-site-";
const CACHE_NAME = `${CACHE_PREFIX}v20260605-css-split`;
const OFFLINE_PATH = "./erro/";
const CSS_VERSION = "20260605-css-split";
const CSS_PATHS = [
  "./static/css/main.css",
  "./static/css/globals.css",
  "./static/css/pages/home.css",
  "./static/css/pages/blog.css",
  "./static/css/pages/projects.css",
  "./static/css/pages/games.css",
  "./static/css/pages/notes.css",
  "./static/css/pages/article.css",
  "./static/css/components/faq.css",
  "./static/css/pages/about.css",
  "./static/css/pages/curiosities.css",
  "./static/css/pages/errors.css",
  "./static/css/utilities/page-effects.css",
  "./static/css/components/footer.css",
  "./static/css/utilities/motion.css",
  "./static/css/utilities/keyframes.css",
  "./static/css/utilities/responsive.css",
  "./static/css/utilities/compact-typography.css",
];
const PRECACHE_PATHS = [
  OFFLINE_PATH,
  ...CSS_PATHS.map((path) => `${path}?v=${CSS_VERSION}`),
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
