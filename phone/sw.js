/* Feather on the phone: the app itself is kept on the phone, so it opens with no signal.
   (Your Feather lives in the phone's storage, encrypted; this file only keeps the app's own files.) */
const CACHE = "feather-shell-v4";
const SHELL = ["/feather/", "/feather/app.js", "/feather/crypto.js", "/feather/merge.js", "/feather/style.css",
  "/feather/manifest.webmanifest", "/feather/icon-256.png", "/feather/icon-512.png", "/feather/quill.svg",
  "/feather/fonts/JetBrainsMono-Regular.ttf", "/feather/fonts/JetBrainsMono-Bold.ttf", "/feather/fonts/Newsreader-400-normal.woff2",
  "/feather/fonts/Newsreader-400-italic.woff2", "/feather/fonts/Newsreader-500-normal.woff2", "/feather/fonts/MonsieurLaDoulaise.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("feather-") && k !== CACHE && k !== "feather-pics").map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Android's share menu: "Feather" receives files, links and text here. They wait (on this phone only) until you
// open Feather, which asks where they go and keeps files encrypted.
function idb() {
  return new Promise((ok, no) => {
    const r = indexedDB.open("feather", 1);
    r.onupgradeneeded = () => { for (const n of ["kv", "files"]) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
async function addShared(item) {
  const d = await idb();
  await new Promise((ok, no) => {
    const t = d.transaction("kv", "readwrite"), o = t.objectStore("kv"), g = o.get("shared");
    g.onsuccess = () => { const a = g.result || []; a.push(item); o.put(a, "shared"); };
    t.oncomplete = ok; t.onerror = () => no(t.error);
  });
}
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.origin === location.origin && url.pathname === "/feather/share") {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const files = fd.getAll("file").filter((f) => f && typeof f !== "string" && f.size);
        await addShared({ t: Date.now(), title: String(fd.get("title") || ""), text: String(fd.get("text") || ""), url: String(fd.get("url") || ""),
          files: files.map((f) => ({ name: f.name || "file", type: f.type || "", size: f.size, blob: f })) });
      } catch (err) { /* nothing to keep */ }
      return Response.redirect("/feather/#share", 303);
    })());
    return;
  }
  if (url.origin !== location.origin || e.request.method !== "GET" || !url.pathname.startsWith("/feather/")) return;
  e.respondWith((async () => {  // network first (so updates arrive), the kept copy when there's no signal
    try {
      const r = await fetch(e.request);
      if (r.ok) { const c = await caches.open(url.pathname.startsWith("/feather/banners/") ? "feather-pics" : CACHE); c.put(e.request, r.clone()); }
      return r;
    } catch (err) {
      return (await caches.match(e.request, { ignoreSearch: true })) || (await caches.match("/feather/")) || Response.error();
    }
  })());
});
