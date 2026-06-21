// Family Kitchen — Service Worker
// Handles push notifications + PWA offline caching

const CACHE_NAME = "family-kitchen-v1";
const STATIC_ASSETS = ["/", "/index.html"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(()=>{}))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// Network first, fallback to cache
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// Push notifications
self.addEventListener("push", e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || "Family Kitchen", {
      body:    data.body  || "",
      icon:    "/icon-192.png",
      badge:   "/icon-72.png",
      data:    data.data  || { url: "/" },
      vibrate: [200, 100, 200],
      tag:     "family-kitchen",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(
    clients.matchAll({ type:"window", includeUncontrolled:true }).then(list => {
      for (const client of list) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
