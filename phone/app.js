/* Feather on your phone (stage 1): unlock, home, reading with Read to me, flashcards, quick notes, in step with
   your laptops through your PC. Your Feather is kept on the phone encrypted with the same key as your laptops
   (made from your password); the key itself only lives in memory while Feather is unlocked. */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const now = () => Math.floor(Date.now() / 1000);
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => x.toString(16).padStart(2, "0")).join("");
const LOCK_AFTER = 5 * 60 * 1000;  // locks after 5 minutes away (or idle)

// ---------- the phone's own storage (IndexedDB): settings, your Feather (encrypted), books (encrypted) ----------
const DB = (() => {
  let db;
  const open = () => db || (db = new Promise((ok, no) => {
    const r = indexedDB.open("feather", 1);
    r.onupgradeneeded = () => { for (const n of ["kv", "files"]) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  }));
  const tx = async (store, mode, fn) => { const d = await open(); return new Promise((ok, no) => { const t = d.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); }); };
  return {
    get: (k, s = "kv") => tx(s, "readonly", (o) => o.get(k)),
    put: (k, v, s = "kv") => tx(s, "readwrite", (o) => o.put(v, k)),
    del: (k, s = "kv") => tx(s, "readwrite", (o) => o.delete(k)),
    keys: (s = "files") => tx(s, "readonly", (o) => o.getAllKeys()),
  };
})();

// ---------- state ----------
let M = {};          // this phone: which Feather, sync base, device name, reading theme... (not secret)
let S = null;        // your Feather, while unlocked
let K = null, RAW = null;  // the key (CryptoKey, and its bytes for fingerprint set-up), while unlocked
let editSeq = 0, syncing = false, firstRound = true, hiddenAt = 0, lastTouch = Date.now();
const V = { view: "home", sync: { state: "idle" } };

async function saveMeta() { await DB.put("meta", M); }
async function saveStore() { if (S && K) await DB.put("store", await FC.box(K, S, "feather-phone-store")); }
function changed() { editSeq++; M.dirty = true; saveMeta(); saveStore(); kick(3000); }

function toast(t, ms = 2600) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), ms); }

// ---------- talking to your PC (the same page that serves this app) ----------
async function post(msg, timeout = 45000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch("/api/feather", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(msg), signal: ac.signal });
    if (r.status === 403) throw Object.assign(new Error("This phone's Tailscale login isn't allowed on your PC."), { why: "owner" });
    return await r.json();
  } finally { clearTimeout(t); }
}
async function call(inner) {
  const out = await post({ op: "feather", sid: M.sid, box: await FC.box(K, { ...inner, host: M.host, name: M.name, kind: "phone" }) });
  if (!out.ok) throw Object.assign(new Error(out.why === "key" ? "Your password doesn't match this Feather." : out.why === "nohub" ? "Your PC hasn't met this Feather yet." : "Your PC said no (" + (out.why || "?") + ")."), { why: out.why });
  return FC.unbox(K, out.box);
}
async function hello() {
  const r = await post({ op: "feather", act: "hello" }, 15000);
  if (!r.ok || !(r.feathers || []).length) throw new Error("Your PC doesn't know this Feather's details yet. Open Feather on a laptop (or plug the stick into the PC) once, then try again.");
  const f = r.feathers[0];
  if (M.sid && M.sid !== f.sid) return;  // keep the one this phone already holds
  M.sid = f.sid; M.salt = f.salt; M.pc = r.pc; await saveMeta();
}

// ---------- sync: the same three-way merge as the laptops, done on your PC ----------
let kickT = null;
function kick(ms = 0) { clearTimeout(kickT); kickT = setTimeout(syncNow, ms); }
setInterval(() => { if (S && !document.hidden) syncNow(); }, 60000);

async function syncNow() {
  if (!S || !K || syncing) return;
  syncing = true; V.sync.state = "busy"; paintSync();
  try {
    const sent = JSON.parse(JSON.stringify(S)), seq = editSeq, dirty = !!M.dirty;
    const req = { act: "sync", base: M.base || null, store: dirty ? sent : null, files: {}, fbase: {}, first: firstRound };
    let r = await call(req);
    if (r.resend) { req.store = sent; r = await call(req); }
    if (r.why) throw Object.assign(new Error(r.why), { why: r.why });
    if (r.store) S = editSeq === seq ? r.store : FM.mergeStore(sent, S, r.store, M.name);
    if (r.h) M.base = r.h;
    M.dirty = editSeq !== seq;
    if (r.news && r.news.length) {
      M.unseen = M.unseen || {};
      for (const e of r.news) foldNews(M.unseen, e);
      M.unseen.closed = firstRound;
    }
    M.devices = r.devices || M.devices; M.pc = r.pc || M.pc; M.files = r.files || M.files || {};
    M.lastOk = Date.now(); V.sync = { state: "ok" }; firstRound = false;
    await saveMeta(); await saveStore();
    fetchBooks();
    fetchSonia();
    sendDrops();
    askPending();
    if (V.view === "home" || V.view === "more" || V.view === "shelf") render();
    if (V.view === "book" && RD.book) bookLive();
  } catch (e) {
    V.sync = { state: e.why && e.why !== "busy" ? "bad" : "off", err: e.message || String(e) };
  } finally { syncing = false; paintSync(); }
}
function foldNews(u, e) {
  u.from = u.from || {}; u.from[e.host || "?"] = e.name || "another laptop";
  for (const [k, v] of Object.entries(e)) {
    if (["t", "host", "name"].includes(k)) continue;
    if (typeof v === "number") u[k] = (u[k] || 0) + v;
    else if (k === "paper") { u.paper = u.paper || {}; for (const [nb, x] of Object.entries(v)) { const y = u.paper[nb] = u.paper[nb] || { title: x.title, strokes: 0 }; y.strokes += x.strokes || 0; if (x.new) y.new = true; } }
    else if (k === "cards") { u.cards = u.cards || { added: 0, reviewed: 0 }; u.cards.added += v.added || 0; u.cards.reviewed += v.reviewed || 0; }
    else if (k === "reading") u.reading = { ...(u.reading || {}), ...v };
  }
}
// books are copied to the phone in the background, so they open (and read aloud) with no signal
let booking = false;
async function fetchBooks() {
  if (booking || !S) return;
  booking = true;
  try {
    const have = new Set(await DB.keys());
    for (const [rel, h] of Object.entries(M.files || {})) {
      if (!/^readings\/[0-9a-f]{12}\.book\.enc$/.test(rel)) continue;
      const cur = have.has(rel) ? await DB.get(rel, "files") : null;
      if (cur && cur.h === h) continue;
      let buf = [], off = 0, total = null;
      while (total === null || off < total) {
        const r = await call({ act: "get", rel, off, n: 3 * 1024 * 1024 });
        if (r.missing || r.h !== h) { buf = null; break; }
        const b = FC.unb64(r.data); buf.push(b); off += b.length; total = r.total;
        if (!b.length) break;
      }
      if (!buf) continue;
      const all = new Uint8Array(off); let p = 0; for (const b of buf) { all.set(b, p); p += b.length; }
      if (await FC.sha(all) === h) await DB.put(rel, { h, bytes: all }, "files");
    }
    for (const rel of have) if (rel.startsWith("readings/") && !(M.files || {})[rel]) await DB.del(rel, "files");
  } catch (e) { /* next time */ } finally { booking = false; }
}

// ---------- unlock ----------
async function unlockWith(raw) {
  const key = await FC.keyOf(raw);
  const boxed = await DB.get("store");
  if (boxed) {
    try { S = await FC.unbox(key, boxed, "feather-phone-store"); } catch (e) { throw new Error("That's not this Feather's password."); }
    K = key; RAW = raw;
  } else {  // first time on this phone: your PC checks the password by opening what the phone sends
    K = key; RAW = raw; S = {};
    try { await syncNow(); } catch (e) { /* reported below */ }
    if (V.sync.state === "bad") { K = RAW = S = null; throw new Error(V.sync.err); }
    if (V.sync.state !== "ok") { K = RAW = S = null; throw new Error("Couldn't reach your PC. The first unlock on this phone needs it (Tailscale on)."); }
  }
  lastTouch = Date.now();
  firstRound = true;
  kick(0);
}
function lock() {
  stopSpeech();
  S = K = RAW = null;
  location.hash = "#home";
  render();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); if (S) syncNow(); }
  else if (S && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER) lock();
  else if (S) kick(500);
});
["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, () => (lastTouch = Date.now()), { passive: true }));
setInterval(() => { if (S && !speaking() && Date.now() - lastTouch > LOCK_AFTER) lock(); }, 15000);

// fingerprint or face: the key is wrapped with a secret only this phone's fingerprint unlock can produce (WebAuthn PRF)
const PRF_SALT = FC.te.encode("feather-unlock-v1");
async function prfKey(credId) {
  const a = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: "public-key", id: FC.unb64(credId) }],
    userVerification: "required", timeout: 60000, extensions: { prf: { eval: { first: PRF_SALT } } } } });
  const res = a.getClientExtensionResults().prf;
  if (!res || !res.results || !res.results.first) throw new Error("This phone can't do fingerprint unlock for Feather. Your password still works.");
  return crypto.subtle.importKey("raw", res.results.first, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function fingerprintOn() {
  if (!window.PublicKeyCredential) throw new Error("No fingerprint unlock in this browser.");
  const c = await navigator.credentials.create({ publicKey: { rp: { name: "Feather", id: location.hostname }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "feather", displayName: "Feather" },
    challenge: crypto.getRandomValues(new Uint8Array(32)), pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" }, timeout: 60000, extensions: { prf: {} } } });
  if (!(c.getClientExtensionResults().prf || {}).enabled) throw new Error("This phone can't do fingerprint unlock for Feather. Your password still works.");
  const credId = FC.b64(new Uint8Array(c.rawId));
  const wk = await prfKey(credId);
  M.fp = { credId, wrapped: FC.b64(await FC.seal(wk, RAW, "feather-fp")) };
  await saveMeta();
}
async function fingerprintUnlock() {
  const wk = await prfKey(M.fp.credId);
  return FC.open(wk, FC.unb64(M.fp.wrapped), "feather-fp");
}

// ---------- the time of day (Feather's sky and accent) ----------
const ACC = [[5, "#f2c65f"], [10, "#c6f432"], [17, "#ff9a4d"], [20, "#b8c7e6"]];
function accentNow(d = new Date()) { const h = d.getHours(); let c = ACC[ACC.length - 1][1]; for (const [a, col] of ACC) if (h >= a) c = col; return h < 5 ? ACC[3][1] : c; }
function tod() { const h = new Date().getHours(); return h >= 5 && h < 10 ? "morning" : h >= 10 && h < 17 ? "day" : h >= 17 && h < 20 ? "evening" : "night"; }
function applyAccent() { document.documentElement.style.setProperty("--lime", accentNow()); }
applyAccent(); setInterval(applyAccent, 60000);
function skyDeco(t) {
  if (t === "night") { let s = "", seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 28; k++) s += `<circle cx="${(r() * 100).toFixed(1)}%" cy="${(r() * 60).toFixed(1)}%" r="${r() < 0.7 ? 1 : 1.5}" fill="#fff"/>`;
    return `<svg class="deco" aria-hidden="true">${s}<circle cx="86%" cy="30%" r="14" fill="#e9e6d6"/><circle cx="83%" cy="27%" r="14" fill="#0c1024"/></svg>`; }
  const sun = { morning: ["82%", "80%", "#ffd9a0"], day: ["72%", "62%", "#fff6cf"], evening: ["78%", "84%", "#ffb072"] }[t];
  return `<svg class="deco" aria-hidden="true"><circle cx="${sun[0]}" cy="${sun[1]}" r="46" fill="${sun[2]}" opacity=".25"/><circle cx="${sun[0]}" cy="${sun[1]}" r="28" fill="${sun[2]}"/>
    <path d="M0 175 C60 155 110 181 170 165 C240 147 300 177 420 155 L420 260 L0 260Z" fill="#0b0b0b"/></svg>`;
}
const greet = () => { const h = new Date().getHours(), n = (S.settings || {}).name; return h >= 21 || h < 5 ? (n ? `The Quiet Hours, ${n}…` : "The Quiet Hours…") : (h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening") + (n ? ", " + n : ""); };
const clock = () => { const d = new Date(); return d.toTimeString().slice(0, 5) + " · " + d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "").toLowerCase(); };

// ---------- pieces ----------
function unseenN() {
  const u = M.unseen; if (!u || !u.from) return 0;
  const c = u.cards || {};
  return Object.keys(u.paper || {}).length + Object.keys(u.reading || {}).length + (c.reviewed || c.added ? 1 : 0) + (u.jots || 0);
}
function syncPill() {
  const s = V.sync.state, n = unseenN(), more = n ? ` · ${n} new` : "", open = V.syncOpen ? " ▴" : "";
  const b = (cls, txt) => `<button type="button" class="pill${cls}${n ? " new" : ""}" id="sp" aria-expanded="${V.syncOpen ? "true" : "false"}" aria-label="${txt}${more}, tap for details"><i>●</i> ${txt}${more}${open}</button>`;
  if (s === "ok") return b("", "in sync");
  if (s === "busy" || s === "idle") return b(" wait", "syncing");
  if (s === "off") return b(" wait", "offline · saved here");
  return b(" bad", "not syncing");
}
document.addEventListener("click", (e) => {  // the sync pill, on any screen: the sync card drops down on Home
  const p = e.target.closest && e.target.closest("#sp"); if (!p || !S) return;
  e.preventDefault(); e.stopPropagation();
  V.syncOpen = !V.syncOpen;
  if (V.view !== "home") location.hash = "#home"; else render();
});
function paintSync() { const p = $("#sp"); if (p) p.outerHTML = syncPill(); }
function tabs(on) {
  const t = [["home", "Home"], ["read", "Read"], ["cards", "Cards"], ["shelf", "Shelf"], ["more", "More"]];
  const due = S ? dueCards().length : 0;
  return `<nav class="tabs" aria-label="Sections">${t.map(([k, l]) => `<a href="#${k}" class="${k === on ? "on" : ""}">${l}${k === "cards" && due ? ` <i>${due}</i>` : ""}</a>`).join("")}</nav>${on === "cards" ? "" : askBubble()}`;
}
const quill = (w = 22) => `<img src="/feather/quill.svg" alt="" style="width:${w}px;height:${Math.round(w * 1.19)}px">`;
function sheet(html, bind) {
  const bg = document.createElement("div"); bg.className = "sheet-bg"; bg.innerHTML = `<div class="sheet fade" role="dialog">${html}</div>`;
  bg.onclick = (e) => { if (e.target === bg) bg.remove(); };
  document.body.append(bg); bind && bind(bg, () => bg.remove()); return bg;
}

// ---------- views ----------
function vLock() {
  const fp = M.fp && window.PublicKeyCredential;
  $("#app").innerHTML = `<div class="lock fade">${quill(100)}<div class="word">Feather</div><div class="small" style="color:#f2f2ec">locked · everything here is encrypted</div>
    ${fp ? `<button class="fp" id="fpb" aria-label="Unlock with fingerprint"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--lime)" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M6 10a6 6 0 0 1 12 0v3"/><path d="M9 20c.6-2 1-4 1-7v-3a2 2 0 0 1 4 0v3c0 2.5-.3 5-1 7"/><path d="M6 14c0 2-.3 3.5-1 5"/><path d="M18 16c0 1.5-.2 3-.6 4"/></svg></button>
      <div class="serif" style="font-size:20px;color:#f2f2ec;margin-top:14px">Touch to unlock</div>` : ""}
    <form id="pf" style="${fp ? "margin-top:auto" : ""}"><label class="k" for="pw" style="color:#f2f2ec">${M.sid ? "Your Feather password" : "Connecting to your PC…"}</label>
      <input id="pw" type="password" autocomplete="current-password" ${M.sid ? "" : "disabled"}>
      <button class="btn go" id="go" ${M.sid ? "" : "disabled"}>Unlock</button><div class="small" id="msg" style="color:#f2f2ec;min-height:20px"></div></form>
    <div class="small muted" style="text-align:center">same password as your laptops · works with no signal</div></div>`;
  const msg = $("#msg");
  $("#pf").onsubmit = async (e) => {
    e.preventDefault();
    const pw = $("#pw").value; if (!pw) return;
    $("#go").disabled = true; msg.innerHTML = `<span class="spin"></span> opening…`;
    try { await unlockWith(await FC.scrypt(pw, M.salt)); route(); }
    catch (err) { msg.textContent = err.message; $("#go").disabled = false; }
  };
  if (fp) $("#fpb").onclick = async () => {
    msg.innerHTML = `<span class="spin"></span>`;
    try { await unlockWith(await fingerprintUnlock()); route(); } catch (err) { msg.textContent = err.message === "That's not this Feather's password." ? "Fingerprint key is out of date: use your password once." : err.message; }
  };
  if (!M.sid) hello().then(vLock).catch((e) => { msg.textContent = e.message || "Couldn't reach your PC. Is Tailscale on?"; $("label[for=pw]").textContent = "Not connected yet"; });
}

function dueCards() { const t = now(); return Object.values(S.cards || {}).filter((c) => (c.due || 0) <= t).sort((a, b) => (a.due || 0) - (b.due || 0)); }
function lastReading() {
  const rp = S.readpos || {}, rs = S.readings || {};
  const rid = Object.keys(rp).filter((r) => rs[r]).sort((a, b) => (rp[b].t || 0) - (rp[a].t || 0))[0] || Object.keys(rs).sort((a, b) => (rs[b].t || 0) - (rs[a].t || 0))[0];
  return rid ? { rid, r: rs[rid], pos: rp[rid] || { ch: 0, p: 0 } } : null;
}
function fromCard() {
  const u = M.unseen; if (!u || !u.from) return "";
  const who = Object.values(u.from).map((x) => (/^the /i.test(x) ? x : "the " + x)), name = who.length > 1 ? who.slice(0, -1).join(", ") + " and " + who.at(-1) : who[0];
  const bits = [];
  const nb = Object.values(u.paper || {}); if (nb.length) bits.push(`<b>Paper:</b> ${nb.slice(0, 2).map((x) => esc(x.title) + (x.strokes ? `, ${x.strokes} new strokes` : ", new")).join(" · ")}`);
  const rd = Object.values(u.reading || {}); if (rd.length) bits.push(`<b>Reading:</b> ${rd.slice(0, 2).map((x) => `${esc(x.title)}, now ${esc(x.where)}`).join(" · ")}`);
  const c = u.cards || {}; if (c.reviewed || c.added) bits.push(`<b>Flashcards:</b> ${[c.reviewed ? c.reviewed + " reviewed" : "", c.added ? c.added + " new" : ""].filter(Boolean).join(", ")}`);
  if (u.jots) bits.push(`<b>Quick notes:</b> ${u.jots}`);
  return `<section class="card lime fade" style="position:relative"><div class="k" style="color:var(--lime)">From ${esc(name)}${u.closed ? " · while you were away" : ""}</div>
    <div class="small" style="margin-top:6px;line-height:1.6;color:#e6e6df">${bits.join("<br>") || "Small changes, all in."}</div>
    <button class="icon" id="fdx" aria-label="Dismiss" style="position:absolute;top:6px;right:6px;border:0">✕</button></section>`;
}
// ---------- the top of Home: Archie's pictures, tinted by the time of day, a quote (like the laptops) ----------
const HB = { list: null, focus: {}, i: -1, at: 0, quotes: null, deck: [], q: null, qAt: 0, loading: false };
const QFALL = [["Learning never exhausts the mind.", "Leonardo da Vinci"], ["Well begun is half done.", "Aristotle"],
  ["It does not matter how slowly you go as long as you do not stop.", "Confucius"], ["Little by little, one travels far.", "Spanish proverb"],
  ["Make the best use of what is in your power, and take the rest as it happens.", "Epictetus"], ["A journey of a thousand miles begins with a single step.", "Laozi"],
  ["You have power over your mind, not outside events.", "Marcus Aurelius"], ["Do the thing and you will have the power.", "Ralph Waldo Emerson"]];
function heroLoad() {
  if (HB.loading) return; HB.loading = true;
  fetch("/feather/banners/list.json").then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (j && Array.isArray(j.pictures) && j.pictures.length) { const first = !HB.list || !HB.list.length; HB.list = j.pictures; HB.focus = j.focus || {}; if (first) nextPic(); }
  }).catch(() => {}).finally(() => { setTimeout(() => (HB.loading = false), 20 * 60000); });
  fetch("/feather/quotes.json").then((r) => (r.ok ? r.json() : null)).then((j) => { if (Array.isArray(j) && j.length > QFALL.length) { HB.quotes = j; HB.deck = []; } }).catch(() => {});
}
function picSrc(i) { const n = HB.list[i], f = HB.focus[n.toLowerCase()] || [50, 55]; return [`/feather/banners/${encodeURIComponent(n)}`, `${f[0]}% ${f[1]}%`]; }
function picHTML() {  // the picture already showing stays put when Home redraws (every sync)
  if (!HB.list || !HB.list.length || HB.i < 0) return "";
  const [src, pos] = picSrc(HB.i);
  return `<img class="on" alt="" src="${src}" style="object-position:${pos}" onerror="this.remove()">`;
}
function nextPic() {
  if (!HB.list || !HB.list.length) return;
  HB.i = HB.i < 0 ? Math.floor(Math.random() * HB.list.length) : (HB.i + 1) % HB.list.length; HB.at = Date.now();
  const box = $("#hpic"); if (!box) return;
  const [src, pos] = picSrc(HB.i), im = new Image(); im.alt = ""; im.style.objectPosition = pos;
  im.onload = () => { if (!document.body.contains(box)) return; box.append(im); requestAnimationFrame(() => requestAnimationFrame(() => im.classList.add("on")));
    setTimeout(() => [...box.querySelectorAll("img")].slice(0, -1).forEach((x) => x.remove()), 1700); };
  im.onerror = () => {};  // no signal and not kept on the phone yet: the sky stays
  im.src = src;
}
function pickQuote() {
  const all = HB.quotes || QFALL;
  for (let k = 0; k < 12; k++) {
    if (!HB.deck.length) HB.deck = [...all.keys()].sort(() => Math.random() - 0.5);
    const q = all[HB.deck.pop()];
    if (q && q[0] && q[0].length <= 150) return q;
  }
  return QFALL[Math.floor(Math.random() * QFALL.length)];
}
const quoteSaved = (q) => ((S.settings || {}).quotes || "").includes(`"${q[0]}"`);
function quoteHTML() {
  if (!HB.q || Date.now() - HB.qAt > 45000) { HB.q = pickQuote(); HB.qAt = Date.now(); }
  const q = HB.q, on = quoteSaved(q);
  return `<div class="hqt" id="hqt">“${esc(q[0])}”<span> · ${esc(q[1] || "")}</span></div>
    <button type="button" class="hqs${on ? " on" : ""}" id="hqs" aria-label="${on ? "Saved to your quotes" : "Keep this quote"}">${on ? "★" : "☆"}</button>`;
}
function swapQuote() {
  const box = $("#hq"); if (!box) return;
  HB.q = null; const t = $("#hqt"); if (t) t.style.opacity = 0;
  setTimeout(() => { if (!document.body.contains(box)) return; box.innerHTML = quoteHTML(); bindQuote(); }, 600);
}
function bindQuote() {
  const b = $("#hqs"); if (!b) return;
  b.onclick = () => {
    const q = HB.q; if (!q || quoteSaved(q)) return;
    const st = (S.settings = S.settings || {}), line = `"${q[0]}" (${q[1] || ""})`;
    st.quotes = ((st.quotes || "").replace(/\n+$/, "") + "\n" + line).replace(/^\n+/, "");
    changed(); b.classList.add("on"); b.textContent = "★"; toast("Saved to your quotes · on your laptops too");
  };
}
const clockLine = (t) => `${clock()} · <span style="color:var(--lime)">${t}</span>`;
setInterval(() => {  // the clock, a new quote every 45 s, a new picture every 15 min, while Home is open
  if (!S || V.view !== "home" || document.hidden) return;
  const c = $("#hclk"); if (c) c.innerHTML = clockLine(tod());
  if (Date.now() - HB.qAt > 45000) swapQuote();
  if (HB.list && HB.list.length && Date.now() - HB.at > 15 * 60000) nextPic();
}, 15000);
function heroHTML(t) {
  const night = t === "night";
  return `<header class="hero sky-${t}"><div class="hpic" id="hpic">${picHTML()}</div><div class="tint t-${t}"><i></i><b></b></div>
    ${night ? skyDeco("night").replace('class="deco"', 'class="stars"').replace(/<circle cx="8[63]%"[^>]*\/>/g, "") + `<div class="moon" aria-hidden="true"></div>` : ""}
    <div class="hfade"></div>
    <span class="word">Feather</span><div class="hpill${night ? " n" : ""}">${syncPill()}</div>
    <div class="hbot"><h1>${esc(greet())}</h1><div class="hclk" id="hclk">${clockLine(t)}</div><div class="hq" id="hq">${quoteHTML()}</div></div></header>`;
}
function fromBits(u) {
  const bits = [];
  const nb = Object.values(u.paper || {}); if (nb.length) bits.push(`<b>Paper:</b> ${nb.slice(0, 2).map((x) => esc(x.title) + (x.strokes ? `, ${x.strokes} new strokes` : ", new")).join(" · ")}`);
  const rd = Object.values(u.reading || {}); if (rd.length) bits.push(`<b>Reading:</b> ${rd.slice(0, 2).map((x) => `${esc(x.title)}, now ${esc(x.where)}`).join(" · ")}`);
  const c = u.cards || {}; if (c.reviewed || c.added) bits.push(`<b>Flashcards:</b> ${[c.reviewed ? c.reviewed + " reviewed" : "", c.added ? c.added + " new" : ""].filter(Boolean).join(", ")}`);
  if (u.jots) bits.push(`<b>Quick notes:</b> ${u.jots} · <a href="#more" id="sdj">open</a>`);
  return bits;
}
function syncDrop() {
  const u = M.unseen || {}, n = unseenN();
  const who = Object.values(u.from || {}).map((x) => (/^the /i.test(x) ? x : "the " + x));
  const name = who.length > 1 ? who.slice(0, -1).join(", ") + " and " + who.at(-1) : who[0];
  const hhmm = M.lastOk ? new Date(M.lastOk).toTimeString().slice(0, 5) : "";
  const state = V.sync.state === "ok" ? `last synced ${hhmm}` : V.sync.state === "off" ? "offline · changes wait here" : V.sync.state === "bad" ? esc(V.sync.err || "not syncing") : "syncing…";
  const devs = (M.devices || []).filter((d) => d.host !== M.host).map((d) => `${esc(d.kind === "stick" ? "Feather stick" : d.name)} ${ago(d.seen)}`);
  return `<div class="sdrop-bg" id="sdbg"></div><section class="sdrop fade" aria-label="Sync">
    <div style="display:flex;align-items:center"><span class="k" style="color:var(--lime)">${n && name ? "From " + esc(name) + (u.closed ? " · while you were away" : "") : "Sync"}</span>
      <button type="button" id="sdx" aria-label="Fold away" style="margin-left:auto;width:40px;height:40px;border:none;background:none;color:var(--text);font-size:16px">✕</button></div>
    <div class="small" style="line-height:1.7;color:#e8e8e0">${n ? fromBits(u).join("<br>") || "Small changes, all in." : "Nothing new from your laptops."}</div>
    <div style="height:1px;background:#23271d"></div>
    <div class="small muted">${[state, ...devs].join(" · ")}</div>
    <button type="button" class="btn" id="sdn" style="align-self:flex-start;min-height:40px;color:var(--lime);border-color:var(--limeline)">sync now</button></section>`;
}
function vHome() {
  const t = tod(), lr = lastReading(), due = dueCards().length;
  const dl = (S.deadlines || []).filter((d) => d.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => (a.date > b.date ? 1 : -1))[0];
  let pct = 0, where = "";
  if (lr) { const n = lr.r.pages || 1; pct = Math.round(100 * Math.min(1, (lr.pos.ch + 1) / n)); where = `${lr.r.kind === "pdf" ? "p." : "ch."} ${lr.pos.ch + 1} of ${n}`; }
  const days = (d) => Math.round((new Date(d + "T00:00") - new Date(new Date().toDateString())) / 864e5);
  heroLoad();
  $("#app").innerHTML = `<div class="app">${heroHTML(t)}
    <main class="main">
      ${lr ? `<a class="card cont" href="#book/${lr.rid}"><span class="cover"></span><span style="flex:1;min-width:0"><span class="serif" style="display:block;font-size:20px;color:var(--hi);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(lr.r.name)}</span>
        <span class="small muted">${where} · read or listen</span><span class="bar" style="display:block;margin-top:6px"><i style="width:${pct}%"></i></span></span>
        <button class="play" id="lis" aria-label="Read it to me">▶</button></a>` : `<div class="card small muted">Books from your notes folder show up here once your PC has sent them.</div>`}
      <div class="grid2"><a class="card" href="#cards" style="color:var(--text)"><div class="k">Due today</div><div class="big">${due}</div><div class="small" style="color:var(--lime)">flashcards →</div></a>
        <button type="button" class="card" id="nxt" style="text-align:left;color:var(--text)"><div class="k">Next up</div>${dl ? `<div class="serif" style="font-size:17px;color:var(--hi);margin-top:6px;line-height:1.25">${esc(dl.what || dl.title || dl.text || "")}</div><div class="small muted">${days(dl.date) === 0 ? "today" : days(dl.date) === 1 ? "tomorrow" : "in " + days(dl.date) + " days"}</div>` : `<div class="small muted" style="margin-top:6px">nothing due</div>`}</button></div>
      <button class="card" id="qn" style="text-align:left;border-style:dashed;color:var(--muted)">+ quick note, saved to Feather on every device</button>
      ${homeExtras()}
    </main>${tabs("home")}${V.syncOpen ? syncDrop() : ""}</div>`;
  bindQuote();
  $("#hpic").onclick = () => nextPic();
  if (V.syncOpen) {
    const fold = () => { V.syncOpen = false; M.unseen = {}; saveMeta(); render(); };
    $("#sdx").onclick = fold; $("#sdbg").onclick = fold;
    if ($("#sdj")) $("#sdj").onclick = () => { V.syncOpen = false; M.unseen = {}; saveMeta(); };
    $("#sdn").onclick = async () => { const b = $("#sdn"); b.disabled = true; b.textContent = "syncing…"; await syncNow(); toast(V.sync.state === "ok" ? "In sync" : V.sync.err || "Couldn't reach your PC"); if (V.view === "home") render(); };
  }
  if ($("#lis")) $("#lis").onclick = (e) => { e.preventDefault(); location.hash = "#book/" + lr.rid + "/listen"; };
  $("#qn").onclick = () => noteSheet();
  $("#nxt").onclick = () => calSheet();
  bindHomeExtras();
}

// ---- more on Home, under the quick note: today, Sonia, a mock exam, the world ----
function homeExtras() {
  const d0 = new Date(), today = new Date(d0 - d0.getTimezoneOffset() * 6e4).toISOString().slice(0, 10), hm = d0.toTimeString().slice(0, 5);
  const tl = (S.deadlines || []).filter((x) => x.date === today).sort((a, b) => ((a.time || "99") > (b.time || "99") ? 1 : -1));
  const due = dueCards().length, rv = (S.stats || {}).reviews || {};
  let streak = 0; for (let i = rv[today] ? 0 : 1; ; i++) { const k = new Date(Date.now() - i * 864e5).toLocaleDateString("en-CA"); if (rv[k]) streak++; else break; }
  const left = tl.filter((x) => !x.time || x.time >= hm).length + (due ? 1 : 0);
  const t12 = (t) => { const [h, m] = t.split(":").map(Number); return ((h + 11) % 12 + 1) + ":" + String(m).padStart(2, "0") + (h < 12 ? " AM" : " PM"); };
  const kl = (k) => (CALK.find(([x]) => x === k) || [, k || "event"])[1];
  const row = (when, lime, what, kind, attr) => `<button type="button" class="hxr" ${attr} style="display:flex;align-items:center;gap:12px;padding:0;border:none;background:none;color:var(--text);text-align:left;min-height:38px;width:100%">
      <span class="small" style="width:62px;flex:none;color:${lime ? "var(--lime)" : "var(--muted)"}">${when}</span><span class="serif" style="flex:1;min-width:0;font-size:16px;color:var(--hi);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(what)}</span><span class="small muted" style="flex:none">${kind}</span></button>`;
  const todayCard = `<section class="card" aria-label="Today" style="display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:baseline"><span class="k">Today</span><span class="small muted" style="margin-left:auto">${left ? left + " left" : "all clear"}${streak ? " · " + streak + "-day streak" : ""}</span></div>
      ${tl.map((x) => row(x.time ? t12(x.time) : "all day", x.time && x.time >= hm, x.what || x.title || "", kl(x.kind), 'data-hc="1"')).join("")}
      ${due ? row("—", false, due + " flashcard" + (due === 1 ? "" : "s"), "review", 'data-hk="1"') : ""}
      ${!tl.length && !due ? `<div class="small muted" style="padding:6px 0">Nothing on the calendar today.</div>` : ""}</section>`;
  const X = S.xexams || {}, ex = Object.entries(X).map(([id, e]) => ({ id, e, t: Math.max(0, ...(e.attempts || []).map((a) => a.t || 0)) })).sort((a, b) => b.t - a.t)[0];
  const last = ex && (ex.e.attempts || []).length ? ex.e.attempts[ex.e.attempts.length - 1].score : null;
  const quiz = ex ? `<a class="card" href="#exam/${encodeURIComponent(ex.id)}" style="color:var(--text);display:flex;flex-direction:column;gap:6px"><span class="k">Quiz me</span><span class="serif" style="font-size:16px;line-height:1.25;color:var(--hi)">${esc(ex.e.title || "Mock exam")}</span>
      <span class="small muted">${last != null ? "last: " + last + "%" : "not taken yet"} · ${(ex.e.questions || []).length} questions</span><span class="small" style="color:var(--lime);margin-top:auto">start →</span></a>`
    : `<a class="card" href="#shelf" style="color:var(--text);display:flex;flex-direction:column;gap:6px"><span class="k">Quiz me</span><span class="serif" style="font-size:16px;line-height:1.25;color:var(--hi)">Mock exam</span><span class="small muted">none here yet · get one from Archie on Shelf</span><span class="small" style="color:var(--lime);margin-top:auto">shelf →</span></a>`;
  const W = S.world, ws = (W && W.s) || [];
  const world = ws.length ? `<button type="button" class="card" id="hxw" aria-label="World" style="text-align:left;color:var(--text);display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:baseline;width:100%"><span class="k">World</span><span class="small muted" style="margin-left:auto">from Archie · ${new Date(W.at * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
      ${ws.slice(0, 3).map((s) => `<div style="display:flex;gap:10px;align-items:baseline;width:100%"><span class="serif" style="flex:1;font-size:15px;line-height:1.35;color:var(--hi)">${esc(s.title)}</span><span class="small muted" style="white-space:nowrap">${s.n} src</span></div>`).join("")}
      ${ws.length > 3 ? `<span class="small" style="color:var(--lime)">more →</span>` : ""}</button>` : "";
  return `${todayCard}<div class="grid2" id="hxg" style="grid-template-columns:minmax(0,1fr)">${quiz}</div>${world}`;
}
async function bindHomeExtras() {
  document.querySelectorAll("[data-hc]").forEach((b) => (b.onclick = () => calSheet()));
  document.querySelectorAll("[data-hk]").forEach((b) => (b.onclick = () => { location.hash = "#cards"; }));
  const w = $("#hxw");
  if (w) w.onclick = () => sheet(`<h3>World</h3><div class="small muted">The biggest stories in Archie World right now.</div>
      <div style="display:flex;flex-direction:column;gap:12px">${(S.world.s || []).map((s) => `<div style="display:flex;gap:10px;align-items:baseline"><span class="serif" style="flex:1;font-size:16px;line-height:1.35;color:var(--hi)">${esc(s.title)}</span><span class="small muted" style="white-space:nowrap">${s.n} sources</span></div>`).join("")}</div>
      <button class="btn" id="hwc">Close</button>`, (bg, close) => { $("#hwc", bg).onclick = close; });
  // Sonia: only when there is audio on this phone ahead of where you are, or your PC is making some
  try {
    const so = S.sonia || {}, R = S.readings || {}, P = S.readpos || {};
    const keys = (await DB.keys()).filter((k) => k.startsWith("sonia/")).map((k) => k.slice(6).split("/"));
    const ahead = keys.filter(([rid, ch]) => R[rid] && +ch >= ((P[rid] || {}).ch || 0));
    const rid = ahead.length ? ahead.sort((a, b) => ((P[b[0]] || {}).t || 0) - ((P[a[0]] || {}).t || 0))[0][0] : null;
    if (!rid && !so.left) return;
    const chs = ahead.filter(([r]) => r === rid).map(([, c]) => +c).sort((a, b) => a - b);
    const g = $("#hxg"); if (!g || V.view !== "home") return;
    const a = document.createElement("a"); a.className = "card"; a.href = rid ? `#book/${rid}/listen` : "#read";
    a.style.cssText = "color:var(--text);display:flex;flex-direction:column;gap:6px;border-color:var(--limeline);background:var(--limebg)";
    a.innerHTML = `<span class="k">Sonia</span><span class="serif" style="font-size:16px;line-height:1.25;color:var(--hi)">${rid ? (chs.length === 1 ? "Ch. " + (chs[0] + 1) : "Ch. " + (chs[0] + 1) + "–" + (chs[chs.length - 1] + 1)) + " ready" : "Your PC is on it"}</span>
      <span class="small" style="color:var(--limetext)">${rid ? esc(R[rid].name) : ""}${so.left ? (rid ? " · " : "") + so.left + " more being made" : ""}</span><span class="small" style="color:var(--lime);margin-top:auto">${rid ? "listen →" : "open a book →"}</span>`;
    g.prepend(a); g.style.gridTemplateColumns = "";
  } catch (e) { /* no Sonia card */ }
}

// ---- calendar: Archie's dates, changed here, sent to Archie at the next PC sync (the same queue as the laptops) ----
const CALK = [["deadline", "countdown"], ["exam", "exam"], ["test", "test"], ["quiz", "quiz"], ["due", "due"], ["lab", "lab"], ["class", "class"], ["event", "event"]];
function calSave(it) {
  const items = (S.deadlines = S.deadlines || []), q = (S.calq = S.calq || []);
  const old = it.id ? items.find((x) => x.id === it.id) : null;
  const what = String(it.what || "").split(/\s+/).join(" ").trim().slice(0, 200), date = String(it.date || "").slice(0, 10);
  if (!what || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Give it a name and a date.";
  const kind = CALK.some(([k]) => k === it.kind) ? it.kind : "event", time = /^\d{2}:\d{2}$/.test(it.time || "") ? it.time : null;
  if (old) {
    const nw = { ...old, what, date, kind, time };
    items[items.indexOf(old)] = nw;
    if (old.src === "new") q.forEach((c) => { if (c.item.id === old.id) c.item = nw; });
    else {
      const ch = { op: "edit", item: { ...nw, orig: old.orig, src: old.src }, t: now() };
      const prev = q.find((c) => c.op === "edit" && c.item.id === old.id);
      if (prev) Object.assign(prev, ch); else q.push(ch);
    }
  } else {
    const nw = { id: "new-" + newId(), src: "new", what, date, kind, time };
    items.push(nw); q.push({ op: "add", item: nw, t: now() });
  }
  changed(); return "";
}
function calDel(id) {
  const items = (S.deadlines = S.deadlines || []), q = (S.calq = S.calq || []), old = items.find((x) => x.id === id);
  if (!old) return;
  items.splice(items.indexOf(old), 1);
  S.calq = q.filter((c) => c.item.id !== old.id);
  if (old.src !== "new") S.calq.push({ op: "del", item: old, t: now() });
  changed();
}
function calSheet() {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const list = () => (S.deadlines || []).filter((x) => (x.date || "") >= today).sort((a, b) => ((a.date + (a.time || "99")) > (b.date + (b.time || "99")) ? 1 : -1));
  const fmt = (x) => { const d = new Date(x.date + "T" + (x.time || "00:00")); return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }) + (x.time ? " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""); };
  const left = (d) => { const n = Math.round((new Date(d + "T00:00") - new Date(new Date().toDateString())) / 864e5); return n <= 0 ? "today" : n === 1 ? "tomorrow" : n + " days"; };
  const fs = "width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--line2);border-radius:12px;padding:10px 12px;color:var(--hi);min-height:46px;color-scheme:dark";
  const form = (x) => `<form class="calf" data-id="${x ? esc(x.id) : ""}" style="display:flex;flex-direction:column;gap:8px${x ? ";padding:12px;border:1px solid var(--limeline);border-radius:12px" : ""}">
      <input type="text" name="what" value="${x ? esc(x.what) : ""}" placeholder="what is it? (e.g. First day of classes)" maxlength="200">
      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:8px"><input type="date" name="date" value="${x ? esc(x.date) : today}" style="${fs}"><input type="time" name="time" value="${x && x.time ? esc(x.time) : ""}" aria-label="time (optional)" style="${fs}"></div>
      <select name="kind" aria-label="kind" style="${fs}">${CALK.map(([k, l]) => `<option value="${k}" ${(x ? x.kind : "event") === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <div style="display:flex;gap:8px;justify-content:flex-end">${x ? '<button type="button" class="btn" data-x>Cancel</button>' : ""}<button class="btn go">${x ? "Save" : "Add"}</button></div></form>`;
  sheet("", (bg, close) => {
    const box = $(".sheet", bg);
    const draw = (editId) => {
      const L = list(), pend = (S.calq || []).length;
      box.innerHTML = `<div style="display:flex;align-items:center"><h3>Coming up</h3><button type="button" class="btn" data-close style="margin-left:auto;min-height:40px">Close</button></div>
        <div class="small muted" style="line-height:1.5">From Archie's calendar and countdowns. Changes go to Archie the next time Feather syncs with your PC${pend ? ` · <b style="color:var(--lime)">${pend} change${pend === 1 ? "" : "s"} waiting</b>` : ""}.</div>
        <div style="display:flex;flex-direction:column;gap:8px">${L.length ? L.map((x) => x.id === editId ? form(x) : `<div class="calrow" data-id="${esc(x.id)}" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid var(--line2);border-radius:12px">
            <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px" data-e><span style="color:var(--hi);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.what || x.title || "")}${x.repeat === "weekly" ? ' <span class="small muted">· weekly</span>' : ""}</span>
              <span class="small muted">${esc((CALK.find(([k]) => k === x.kind) || [, x.kind || "event"])[1])} · ${fmt(x)}</span></span>
            <span class="small" style="white-space:nowrap;color:${["today", "tomorrow"].includes(left(x.date)) ? "var(--lime)" : "var(--muted)"}">${left(x.date)}</span>
            <button type="button" data-d aria-label="Remove" style="width:40px;height:40px;border-radius:10px;border:1px solid var(--line2);background:none;color:var(--muted);flex:none">✕</button></div>`).join("") : '<div class="small muted" style="padding:8px 0">Nothing coming up yet.</div>'}</div>
        <div class="k" style="margin-top:6px">Add a date</div>${form(null)}`;
      $("[data-close]", box).onclick = close;
      box.querySelectorAll(".calrow").forEach((row) => {
        $("[data-e]", row).onclick = () => draw(row.dataset.id);
        const d = $("[data-d]", row);
        d.onclick = () => {
          if (!d.dataset.sure) { d.dataset.sure = "1"; d.textContent = "remove?"; d.style.width = "auto"; d.style.padding = "0 10px"; d.style.color = "var(--bad)"; setTimeout(() => { if (d.isConnected) { delete d.dataset.sure; d.textContent = "✕"; d.style.width = "40px"; d.style.padding = ""; d.style.color = "var(--muted)"; } }, 3000); return; }
          calDel(row.dataset.id); draw(); toast("Removed");
        };
      });
      box.querySelectorAll(".calf").forEach((f) => {
        f.onsubmit = (e) => { e.preventDefault(); const err = calSave({ id: f.dataset.id || undefined, what: f.what.value, date: f.date.value, time: f.time.value, kind: f.kind.value }); if (err) return toast(err); draw(); toast(f.dataset.id ? "Saved" : "Added"); };
        const x = $("[data-x]", f); if (x) x.onclick = () => draw();
      });
      if (editId) { const w = $(`.calf[data-id="${editId}"] input[name=what]`, box); if (w) w.focus(); }
    };
    draw();
    bg.onclick = (e) => { if (e.target === bg) close(); };
    const c0 = close; close = () => { c0(); if (V.view === "home") render(); };
  });
}

function noteSheet(prefill = "") {
  sheet(`<h3>Quick note</h3><textarea id="nt" rows="5" placeholder="anything: it lands in Feather on your laptops">${esc(prefill)}</textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="nc">Cancel</button><button class="btn go" id="ns">Save</button></div>`, (bg, close) => {
    const t = $("#nt", bg); setTimeout(() => t.focus(), 50);
    $("#nc", bg).onclick = close;
    $("#ns", bg).onclick = () => { const v = t.value.trim(); if (!v) return close(); const id = newId(); (S.jots = S.jots || {})[id] = { id, t: now(), text: v, link: "", edited: now() }; changed(); close(); toast("Saved · on its way to your laptops"); if (V.view === "more") render(); };
  });
}

// ---- reading ----
function vRead() {
  const rs = Object.values(S.readings || {}).sort((a, b) => ((S.readpos || {})[b.id]?.t || b.t || 0) - ((S.readpos || {})[a.id]?.t || a.t || 0));
  $("#app").innerHTML = `<div class="app"><div class="top"><div class="ttl"><b>Reading</b><span class="small muted">${rs.length} from your notes folder</span></div>${syncPill()}</div>
    <main class="main"><div class="card list">${rs.map((r) => { const pos = (S.readpos || {})[r.id]; return `<a href="#book/${r.id}"><span style="min-width:0"><span class="serif" style="display:block;font-size:17px;color:var(--hi)">${esc(r.name)}</span>
      <span class="small muted">${esc(r.author || r.kind || "")}${pos ? ` · ${r.kind === "pdf" ? "p." : "ch."} ${pos.ch + 1}` : ""}</span></span><span class="muted">→</span></a>`; }).join("") || `<div style="padding:16px" class="small muted">Nothing yet. Books and PDFs in Feather's notes folder on your PC show up here.</div>`}</div></main>${tabs("read")}</div>`;
}

const RD = { rid: null, book: null, ch: 0, theme: null, size: 19 };
async function loadBook(rid) {
  const f = await DB.get(`readings/${rid}.book.enc`, "files");
  if (!f) return null;
  return JSON.parse(FC.td.decode(await FC.open(K, f.bytes, "feather-book")));
}
// [start, end] of each sentence in a paragraph. A period after Mr / Mrs / Dr / an initial / inside a number
// doesn't end a sentence, and a sentence only ends when the next word starts like a new sentence.
const SENT_ABBR = new Set("mr mrs ms mx dr st prof rev revd fr capt col gen lt sgt cpl maj adm hon jr sr messrs mme mlle vs etc eg ie cf al no nos vol vols ch chap p pp fig figs approx esp dept est inc ltd co corp ave rd mt ft jan feb mar apr jun jul aug sep sept oct nov dec mon tue tues wed thu thur thurs fri sat sun".split(" "));
function splitSentences(p) {
  const out = [], re = /[.!?…]+["'”’»)\]]*(?=\s|$)/g;
  let start = 0, m;
  while ((m = re.exec(p))) {
    const end = m.index + m[0].length, punct = m[0];
    const rest = p.slice(end), next = rest.match(/^\s*(["'“‘«(\[]*)(\S?)/);
    if (end < p.length) {
      const ch = next ? next[2] : "";
      if (!/[A-Z0-9À-Þ]/.test(ch) && !(next && next[1])) continue;      // next word doesn't start a sentence
      if (/^\.+["'”’»)\]]*$/.test(punct) && !/\.\./.test(punct)) {
        const word = (p.slice(start, m.index).match(/([A-Za-z.]+)$/) || [, ""])[1].toLowerCase();
        const bare = word.replace(/\./g, "");
        if (SENT_ABBR.has(bare) || /^[a-z]$/.test(bare) || /^([a-z]\.)+[a-z]?$/.test(word)) continue;   // Mrs. / J. / e.g.
      }
    }
    const s = p.slice(start, end), lead = s.length - s.trimStart().length;
    if (s.trim()) out.push([start + lead, end]);
    start = end;
  }
  if (p.slice(start).trim()) { const lead = p.slice(start).length - p.slice(start).trimStart().length; out.push([start + lead, p.length]); }
  for (let i = 0; i < out.length - 1; i++) if (out[i][1] - out[i][0] < 4) { out[i + 1][0] = out[i][0]; out.splice(i, 1); i--; }   // no tiny pieces
  return out.length ? out : [[0, p.length]];
}

function sentences(p) { return splitSentences(p); }
function paraHTML(p, j, marks, now_) {
  // highlights (marks) and the sentence being read, as ranges inside this paragraph
  const cuts = [];
  for (const m of marks) if (m.ch === RD.ch && m.a <= j && m.b >= j) cuts.push([m.a < j ? 0 : m.oa, m.b > j ? p.length : m.ob, "hl"]);
  if (now_) cuts.push([now_[0], now_[1], "now"]);
  if (!cuts.length) return esc(p);
  const pts = [...new Set([0, p.length, ...cuts.flatMap((c) => [c[0], c[1]])])].sort((a, b) => a - b);
  let h = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], seg = esc(p.slice(a, b)); if (!seg) continue;
    const cls = cuts.filter((c) => c[0] <= a && c[1] >= b).map((c) => c[2]);
    h += cls.includes("now") ? `<span class="now">${cls.includes("hl") ? `<mark class="hl">${seg}</mark>` : seg}</span>` : cls.includes("hl") ? `<mark class="hl">${seg}</mark>` : seg;
  }
  return h;
}
async function vBook(rid, listen) {
  const r = (S.readings || {})[rid];
  if (!r) { location.hash = "#read"; return; }
  if (RD.rid !== rid) { RD.book = await loadBook(rid); RD.rid = rid; RD.ch = ((S.readpos || {})[rid] || {}).ch || 0; }
  RD.theme = M.theme || "sepia"; RD.size = M.size || 19;
  if (!RD.book) {
    $("#app").innerHTML = `<div class="app"><div class="top"><a class="icon" href="#read" aria-label="Back">←</a><div class="ttl"><b>${esc(r.name)}</b></div></div>
      <main class="main"><div class="card small">${booking ? `<span class="spin"></span> Copying this book to your phone…` : `This book isn't on the phone yet. It copies over the next time your PC is reachable.`}</div></main>${tabs("read")}</div>`;
    if (booking) setTimeout(() => location.hash.startsWith("#book/" + rid) && render(), 2500);
    return;
  }
  drawBook();
  if (listen) setTimeout(() => startSpeech(), 300);
}
function drawBook() {
  const b = RD.book, rid = RD.rid, r = S.readings[rid], ch = b.ch[RD.ch] || { t: "", p: [] };
  const marks = (S.marks || {})[rid] || [], n = b.ch.length, pdf = b.kind === "pdf";
  const T = { dark: ["Dark", "#0b0b0b"], paper: ["Paper", "#fbfaf6"], sepia: ["Sepia", "#f1e7d0"] };
  const from = (M.unseen && M.unseen.reading && Object.values(M.unseen.reading).some((x) => x.href === "#/read/" + rid)) ? ` · <em>picked up from your laptop</em>` : "";
  $("#app").innerHTML = `<div class="rd" data-theme="${RD.theme}" style="--rsize:${RD.size}px">
    <div class="top"><a class="icon" href="#read" aria-label="Back">←</a><div class="ttl"><b>${esc(r.name)}</b><div class="sub">${pdf ? "p." : "ch."} ${RD.ch + 1} of ${n}${from}</div></div>
      <button class="icon" id="toc" aria-label="Chapters">≡</button></div>
    <div class="themes">${Object.entries(T).map(([k, [l, c]]) => `<button class="btn" data-t="${k}" aria-pressed="${k === RD.theme}"><span class="sw" style="background:${c}"></span>${l}</button>`).join("")}
      <span style="margin-left:auto;display:flex;gap:6px"><button class="icon" data-s="-1" aria-label="Smaller text" style="font:13px News,serif">A</button><button class="icon" data-s="1" aria-label="Larger text" style="font:19px News,serif">A</button></span></div>
    <article class="text" id="tx"><h2>${esc(ch.t)}</h2>${ch.p.map((p, j) => `<p data-j="${j}">${pinMark(j)}${paraHTML(p, j, marks, SP.on && SP.j === j ? SP.sents[SP.k] : null)}</p>`).join("")}
      <div style="display:flex;justify-content:space-between;gap:10px;margin-top:20px"><button class="btn" id="prev" ${RD.ch ? "" : "disabled"}>← ${pdf ? "page" : "chapter"}</button><button class="btn" id="next" ${RD.ch < n - 1 ? "" : "disabled"}>${pdf ? "page" : "chapter"} →</button></div></article>
    <div class="selbar" id="selbar" hidden role="toolbar" aria-label="Selected words"><button class="btn go" data-s="hl">Highlight</button><button class="btn" data-s="note">+ note</button><button class="btn" data-s="card">Card</button><button class="icon" data-s="x" aria-label="Cancel">✕</button></div>
    <div class="player" id="pl">${playerHTML()}</div>
    <button class="cbub" id="cbub" aria-label="This chapter: your notes, highlights, bookmarks, people">${pdf ? "p." : "ch."}${RD.ch + 1}<i class="cdot" ${CH.dot ? "" : "hidden"}></i></button></div>`;
  document.querySelectorAll(".themes [data-t]").forEach((x) => (x.onclick = () => { M.theme = x.dataset.t; saveMeta(); RD.theme = M.theme; $(".rd").dataset.theme = M.theme; document.querySelectorAll(".themes [data-t]").forEach((y) => y.setAttribute("aria-pressed", y === x)); }));
  document.querySelectorAll(".themes [data-s]").forEach((x) => (x.onclick = () => { M.size = Math.max(14, Math.min(28, (M.size || 19) + 2 * x.dataset.s)); RD.size = M.size; saveMeta(); $(".rd").style.setProperty("--rsize", M.size + "px"); }));
  $("#prev").onclick = () => goCh(RD.ch - 1);
  $("#next").onclick = () => goCh(RD.ch + 1);
  $("#toc").onclick = () => sheet(`<h3>${pdf ? "Pages" : "Chapters"}</h3><div class="card list">${b.ch.map((c, i) => `<button class="li" data-i="${i}"><span>${i + 1}. ${esc(c.t || "")}</span>${i === RD.ch ? `<span style="color:var(--lime)">●</span>` : ""}</button>`).join("")}</div>`,
    (bg, close) => bg.querySelectorAll("[data-i]").forEach((x) => (x.onclick = () => { close(); goCh(+x.dataset.i); })));
  $("#tx").onclick = (e) => { if (Date.now() - SEL.t < 700 || !getSelection().isCollapsed) return; const pm = e.target.closest(".pinm"); if (pm) { e.stopPropagation(); return chapterSheet(RD.ch, { f: pm.dataset.f, p: +pm.closest("p").dataset.j }); } const p = e.target.closest("p[data-j]"); if (p) paraSheet(+p.dataset.j); };
  $("#cbub").onclick = () => chapterSheet(RD.ch);
  bindSel();
  if (CH.rid !== RD.rid) { CH.rid = RD.rid; CH.sig = liveSig(); CH.dot = false; }
  bindPlayer();
  if (SP.on) { const cur = document.querySelector(`p[data-j="${SP.j}"] .now`); cur && cur.scrollIntoView({ block: "center" }); }
}
function goCh(i, keepSpeech) {
  const n = RD.book.ch.length; if (i < 0 || i >= n) return;
  if (!keepSpeech) stopSpeech();
  RD.ch = i; savePos(0); drawBook(); window.scrollTo(0, 0);
}
function savePos(j) {
  const rid = RD.rid, b = RD.book, ch = RD.ch;
  (S.readpos = S.readpos || {})[rid] = { ch, p: j, t: now() };
  const bk = Object.values(S.books || {}).find((x) => x.digital === rid);
  if (bk) {
    const pr = bk.progress = bk.progress || {};
    if (pr.page !== ch + 1) {
      pr.page = ch + 1; pr.chapter = b.ch[ch].t;
      const day = new Date().toISOString().slice(0, 10), log = bk.log = bk.log || [];
      const last = log[log.length - 1];
      if (last && new Date(last.t * 1000).toISOString().slice(0, 10) === day) Object.assign(last, { page: ch + 1, chapter: b.ch[ch].t, t: now() });
      else log.push({ t: now(), page: ch + 1, chapter: b.ch[ch].t });
    }
    bk.t = now();
  }
  changed();
}
function addMark(j, a, b, text, note = "") {
  const m = { id: newId(), ch: RD.ch, a: j, oa: a, b: j, ob: b, c: 0, note, text: text.slice(0, 4000), t: now() };
  ((S.marks = S.marks || {})[RD.rid] = S.marks[RD.rid] || []).push(m);
  changed();
  return m;
}
function addCard(front, back) {
  const id = newId(), deck = (S.readings[RD.rid] || {}).name || "Reading";
  (S.cards = S.cards || {})[id] = { id, front, back, deck: deck.slice(0, 60), due: now(), interval: 0, ease: 2.5, reps: 0, t: now() };
  changed();
}
function cardSheet(text) {
  sheet(`<h3>Make a flashcard</h3><label class="k" for="cf">Front (the question)</label><textarea id="cf" rows="3">${esc(text)}</textarea>
    <label class="k" for="cb">Back (the answer)</label><textarea id="cb" rows="3"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="cx">Cancel</button><button class="btn go" id="cs">Add card</button></div>`, (bg, close) => {
    $("#cx", bg).onclick = close;
    $("#cs", bg).onclick = () => { const f = $("#cf", bg).value.trim(), b = $("#cb", bg).value.trim(); if (!f || !b) return toast("A card needs both sides"); addCard(f, b); close(); toast("Card added · due today"); };
  });
}
function paraSheet(j) {
  const p = RD.book.ch[RD.ch].p[j];
  const mine = ((S.marks || {})[RD.rid] || []).filter((m) => m.ch === RD.ch && m.a <= j && m.b >= j);
  sheet(`<h3>This paragraph</h3><div class="small muted" style="max-height:120px;overflow:hidden">${esc(p.slice(0, 280))}${p.length > 280 ? "…" : ""}</div>
    <div class="small" style="color:var(--lime)">To highlight just some words: press and hold on a word, drag the handles, then tap Highlight.</div>
    <div class="acts" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px"><button class="btn" id="ph">Highlight it all</button><button class="btn" id="pn">All + a note</button>
    ${mine.length ? `<button class="btn danger" id="prm" style="grid-column:1/-1">Remove ${mine.length > 1 ? mine.length + " highlights" : "the highlight"} here</button>` : ""}
    <button class="btn" id="pc">Make a card</button><button class="btn" id="pl2">Read from here</button>
    <button class="btn" id="pp">Note here</button><button class="btn" id="pb">${pinsAt(RD.ch, j, "bm").length ? "Remove bookmark" : "Bookmark here"}</button></div>`, (bg, close) => {
    $("#pp", bg).onclick = () => { close(); pinNoteSheet(RD.ch, j); };
    $("#prm", bg) && ($("#prm", bg).onclick = () => { S.marks[RD.rid] = S.marks[RD.rid].filter((m) => !mine.includes(m)); mineChanged(); close(); drawBookKeep(); toast("Highlight removed"); });
    $("#pb", bg).onclick = () => { close(); toggleBookmark(RD.ch, j); };
    $("#ph", bg).onclick = () => { addMark(j, 0, p.length, p); close(); drawBook(); toast("Highlighted · on your laptops too"); };
    $("#pn", bg).onclick = () => { close(); noteForMark(j, 0, p.length, p); };
    $("#pc", bg).onclick = () => { close(); cardSheet(p.slice(0, 600)); };
    $("#pl2", bg).onclick = () => { close(); startSpeech(j); };
  });
}
function noteForMark(j, a, b, text) {
  const resume = SP.on && !SP.paused; if (resume) pauseSpeech();
  sheet(`<h3>Note on this</h3><div class="small muted">${esc(text.slice(0, 200))}</div><textarea id="mn" rows="4" placeholder="type, or use your keyboard's mic"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="mx">Cancel</button><button class="btn go" id="ms">Save</button></div>`, (bg, close) => {
    setTimeout(() => $("#mn", bg).focus(), 50);
    const done = () => { close(); if (resume) resumeSpeech(); };
    $("#mx", bg).onclick = done;
    $("#ms", bg).onclick = () => { addMark(j, a, b, text, $("#mn", bg).value.trim()); done(); drawBook(); toast("Saved with your note"); };
  });
}

// ---- highlighting just the words you select (press and hold, drag the handles) ----
const SEL = { t: 0, cur: null };
function selRange() {
  const s = getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return null;
  const r = s.getRangeAt(0), tx = $("#tx"); if (!tx) return null;
  const pOf = (n) => (n.nodeType === 1 ? n : n.parentElement)?.closest("p[data-j]");
  const pa = pOf(r.startContainer), pb = pOf(r.endContainer);
  if (!pa || !pb || !tx.contains(pa) || !tx.contains(pb)) return null;
  const off = (p, node, o) => { const q = document.createRange(); q.selectNodeContents(p); q.setEnd(node, o); return q.toString().length; };
  const a = +pa.dataset.j, b = +pb.dataset.j, oa = off(pa, r.startContainer, r.startOffset), ob = off(pb, r.endContainer, r.endOffset);
  const text = s.toString().replace(/\s+/g, " ").trim();
  return text ? { a, oa, b, ob, text } : null;
}
function bindSel() {
  const bar = $("#selbar"); if (!bar) return;
  if (!bindSel.on) { bindSel.on = true; document.addEventListener("selectionchange", () => { clearTimeout(SEL.w); SEL.w = setTimeout(selShow, 120); }); }
  bar.onpointerdown = (e) => e.preventDefault();  // keep the selection while tapping the bar
  bar.querySelectorAll("[data-s]").forEach((x) => (x.onclick = () => {
    const sel = SEL.cur; SEL.t = Date.now();
    if (x.dataset.s === "x" || !sel) { getSelection().removeAllRanges(); bar.hidden = true; return; }
    getSelection().removeAllRanges(); bar.hidden = true;
    if (x.dataset.s === "card") return cardSheet(sel.text.slice(0, 600));
    const m = { id: newId(), ch: RD.ch, a: sel.a, oa: sel.oa, b: sel.b, ob: sel.ob, c: 0, note: "", text: sel.text.slice(0, 4000), t: now() };
    if (x.dataset.s === "note") return markNoteSheet(m);
    ((S.marks = S.marks || {})[RD.rid] = S.marks[RD.rid] || []).push(m); mineChanged(); drawBookKeep(); toast("Highlighted · on your laptops too");
  }));
}
function selShow() {
  const bar = $("#selbar"); if (!bar) return;
  const sel = V.view === "book" ? selRange() : null;
  if (sel) { SEL.cur = sel; SEL.t = Date.now(); if (SP.on && !SP.paused) pauseSpeech(); }
  bar.hidden = !sel;
  if (sel) { const pl = $("#pl"); bar.style.bottom = Math.round(innerHeight - pl.getBoundingClientRect().top + 10) + "px"; }
}
function markNoteSheet(m) {
  sheet(`<h3>Note on this</h3><div class="small muted">${esc(m.text.slice(0, 200))}</div><textarea id="mn2" rows="4" placeholder="type, or tap 🎙"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="mmic" aria-label="Talk instead of typing">🎙</button><span style="flex:1"></span><button class="btn" id="mx2">Cancel</button><button class="btn go" id="ms2">Save</button></div>`, (bg, close) => {
    const ta = $("#mn2", bg); setTimeout(() => ta.focus(), 50);
    $("#mmic", bg).onclick = () => listen(ta, $("#mmic", bg));
    $("#mx2", bg).onclick = close;
    $("#ms2", bg).onclick = () => { m.note = ta.value.trim().slice(0, 4000); ((S.marks = S.marks || {})[RD.rid] = S.marks[RD.rid] || []).push(m); mineChanged(); close(); drawBookKeep(); toast("Highlighted with your note"); };
  });
}

// ---- the chapter bubble: this chapter's highlights, notes pinned where you wrote them, bookmarks, tags, people, a recap ----
const CH = { open: null, f: "all", tab: "marks", dot: false, sig: "", t: null };
const TAGS4 = ["loved this", "confusing", "slow", "big moment"];
const pinsOf = () => ((S.pins = S.pins || {})[RD.rid] = S.pins[RD.rid] || []);
const pinsAt = (n, j, k) => pinsOf().filter((x) => x.ch === n && x.p === j && (!k || (k === "bm" ? x.k === "bm" : x.k !== "bm")));
const bookRec = (make) => {  // the Reading-tab entry for this book (the same one the laptops use)
  let bk = Object.values(S.books || {}).find((x) => x.digital === RD.rid);
  if (!bk && make) { const r = S.readings[RD.rid], id = "rd" + RD.rid; bk = (S.books = S.books || {})[id] = { id, title: RD.book.title || r.name, author: RD.book.author || r.author || "", pages: RD.book.ch.length, digital: RD.rid,
    started: now(), t: now(), chapters: {}, quotes: [], people: [], log: [], progress: { page: RD.ch + 1, chapter: RD.book.ch[RD.ch].t } }; }
  return bk;
};
function pinMark(j) {
  const ps = RD.book ? pinsAt(RD.ch, j) : []; if (!ps.length) return "";
  const n = ps.some((x) => x.k !== "bm"), b = ps.some((x) => x.k === "bm");
  return `<span class="pinm ${n && b ? "k-both" : n ? "k-note" : "k-bm"}" data-f="${n ? "note" : "bm"}" role="button" aria-label="${n ? "your note" : "bookmark"} here"></span>`;
}
function liveSig() { return JSON.stringify([((S.marks || {})[RD.rid] || []).map((x) => [x.id, x.note]), pinsOf().map((x) => [x.id, x.note])]); }
function bookLive() {
  const sig = liveSig(); if (sig === CH.sig) return;
  const had = CH.sig; CH.sig = sig;
  if (!had) return;
  document.querySelectorAll("#tx p[data-j]").forEach((el) => { const j = +el.dataset.j; el.innerHTML = pinMark(j) + paraHTML(RD.book.ch[RD.ch].p[j], j, (S.marks || {})[RD.rid] || [], SP.on && SP.j === j ? SP.sents[SP.k] : null); });
  if (CH.open) CH.open.redraw(); else { CH.dot = true; const d = $("#cbub .cdot"); if (d) d.hidden = false; }
}
function mineChanged() { changed(); CH.sig = liveSig(); }
function hereJ() {  // the paragraph at the top of the screen: where you are
  const top = ($(".rd .top")?.getBoundingClientRect().bottom || 60) + 8;
  for (const el of document.querySelectorAll("#tx p[data-j]")) if (el.getBoundingClientRect().bottom > top) return +el.dataset.j;
  return 0;
}
function addPin(k, n, j, note = "", extra = {}) {
  const p = RD.book.ch[n].p[j] || "";
  const x = { id: newId(), k, ch: n, p: j, note: note.slice(0, 8000), text: p.slice(0, 200), t: now(), src: "phone", ...extra };
  pinsOf().push(x); mineChanged(); return x;
}
function toggleBookmark(n, j) {
  const had = pinsAt(n, j, "bm");
  if (had.length) { S.pins[RD.rid] = pinsOf().filter((x) => !had.includes(x)); mineChanged(); toast("Bookmark removed"); }
  else { addPin("bm", n, j); toast(`Bookmarked · ¶ ${j + 1}`); }
  if (n === RD.ch) { const el = document.querySelector(`#tx p[data-j="${j}"]`); if (el) el.innerHTML = pinMark(j) + paraHTML(RD.book.ch[n].p[j], j, (S.marks || {})[RD.rid] || [], SP.on && SP.j === j ? SP.sents[SP.k] : null); }
  CH.open && CH.open.redraw();
}
function listen(ta, btn) {  // talk instead of typing (the phone's speech recognition), or the keyboard's own mic
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) { ta.focus(); toast("Tap the mic on your keyboard to talk"); return; }
  const resume = SP.on && !SP.paused; if (resume) pauseSpeech();
  const r = new R(); r.lang = navigator.language || "en-US"; r.interimResults = true; r.continuous = false;
  const base = ta.value ? ta.value.replace(/\s*$/, " ") : ""; btn.classList.add("on"); btn.textContent = "● listening";
  r.onresult = (e) => { ta.value = base + Array.from(e.results).map((x) => x[0].transcript).join(""); };
  r.onend = () => { btn.classList.remove("on"); btn.textContent = "🎙"; ta.dataset.voice = "1"; };
  r.onerror = () => { toast("Couldn't hear that: try the keyboard's mic"); };
  try { r.start(); } catch (e) { r.onend(); }
}
function pinNoteSheet(n, j) {
  const resume = SP.on && !SP.paused; if (resume) pauseSpeech();
  const p = RD.book.ch[n].p[j] || "";
  sheet(`<h3>Note here</h3><div class="small muted">¶ ${j + 1} · ${esc(p.slice(0, 160))}${p.length > 160 ? "…" : ""}</div><textarea id="pnt" rows="5" placeholder="write as much as you want"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="pmic" aria-label="Talk instead of typing">🎙</button><span style="flex:1"></span><button class="btn" id="px">Cancel</button><button class="btn go" id="ps">Pin it</button></div>`, (bg, close) => {
    const ta = $("#pnt", bg); setTimeout(() => ta.focus(), 50);
    const done = () => { close(); if (resume) resumeSpeech(); };
    $("#pmic", bg).onclick = () => listen(ta, $("#pmic", bg));
    $("#px", bg).onclick = done;
    $("#ps", bg).onclick = () => { const v = ta.value.trim(); if (!v) return ta.focus(); addPin("note", n, j, v, ta.dataset.voice ? { voice: 1 } : {}); done(); drawBook(); toast("Note pinned here · on your laptops too"); };
  });
}
function quickRecap(paras) {  // with no model on the phone: the lines that matter most so far, in order
  const STOP = new Set("the a an and or but of to in on at for with from by as is are was were be been this that these those it its into than then which who whom what when where why how not no can could should would will just also about there their they them very more most some such only other".split(" "));
  const text = paras.join(" "), freq = {};
  for (const w of text.match(/[A-Za-z][A-Za-z-]{3,}/g) || []) { const lw = w.toLowerCase(); if (!STOP.has(lw)) freq[lw] = (freq[lw] || 0) + (w[0] === w[0].toUpperCase() ? 2 : 1); }
  const terms = new Set(Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map((x) => x[0]));
  const ss = paras.flatMap((p) => p.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length >= 40 && x.length <= 260));
  const score = (x) => (x.toLowerCase().match(/[a-z][a-z-]{3,}/g) || []).filter((w) => terms.has(w)).length;
  const keep = new Set(ss.map((_, i) => i).sort((a, b) => score(ss[b]) - score(ss[a])).slice(0, 4));
  return ss.filter((_, i) => keep.has(i)).join(" ") || (paras[0] || "").slice(0, 400) || "Nothing read in this chapter yet.";
}
function ago(t) { const s = Math.max(0, now() - (t || 0)); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function chapterSheet(n, opt = {}) {
  const resume = SP.on && !SP.paused;
  let c = n, hot = opt.p;
  if (opt.f) CH.f = opt.f;
  if (opt.f) CH.tab = "marks";
  CH.dot = false; const d = $("#cbub .cdot"); if (d) d.hidden = true;
  const here0 = hereJ();
  const bg = sheet(`<div id="chs"></div>`, (bg, close) => {
    const root = $("#chs", bg); bg.querySelector(".sheet").classList.add("chsheet");
    const cut = (t, k) => (t.length > k ? t.slice(0, k).trimEnd() + "…" : t);
    const draw = () => {
      const b = RD.book, nch = b.ch.length, C = b.ch[c], unit = b.kind === "pdf" ? "p." : "ch.", here = c === RD.ch, at = here ? here0 : 0;
      const marks = ((S.marks || {})[RD.rid] || []).filter((x) => x.ch === c), ps = pinsOf().filter((x) => x.ch === c);
      const bk = bookRec(false), cm = (bk && bk.chapters && bk.chapters[C.t]) || {};
      let items = [...marks.map((x) => ({ k: "hl", x, t: x.t || 0, p: x.a })), ...ps.map((x) => ({ k: x.k === "bm" ? "bm" : "note", x, t: x.t || 0, p: x.p }))];
      if ((cm.notes || "").trim()) items.push({ k: "page", x: { note: cm.notes }, t: -1, p: 0 });
      const isNote = (i) => i.k === "note" || i.k === "page" || (i.k === "hl" && i.x.note);
      const cnt = { all: items.length, hl: items.filter((i) => i.k === "hl").length, note: items.filter(isNote).length, bm: items.filter((i) => i.k === "bm").length };
      const shown = items.filter((i) => CH.f === "all" || (CH.f === "note" ? isNote(i) : i.k === CH.f)).sort((x, y) => y.t - x.t || x.p - y.p);
      const rc = ((S.recaps || {})[RD.rid] || {})[String(c)], tags = cm.tags || [], people = cm.people || [];
      const readTo = c < RD.ch ? C.p.length - 1 : c === RD.ch ? here0 : -1;
      const fr = (t) => (t && now() - t < 90 ? " fresh" : "");
      const item = (i) => {
        const x = i.x, h = hot !== undefined && i.p === hot && i.k !== "hl" ? " hot" : "";
        if (i.k === "hl") return `<div class="cpi${fr(i.t)}" data-k="hl" data-id="${x.id}"><span class="cpbar"></span><div class="cpb"><div class="cpt q">${esc(cut(x.text || "", 220))}</div>${x.note ? `<div class="cpt cpnote">✎ ${esc(x.note)}</div>` : ""}<div class="cpm">highlight · ${ago(x.t)} · ¶ ${x.a + 1}</div></div><button class="cpf" data-find>find ↗</button></div>`;
        if (i.k === "page") return `<div class="cpi" data-k="page"><span class="cpico">✎</span><div class="cpb"><div class="cpt">${esc(cut(x.note, 500))}</div><div class="cpm">chapter notes from the book page</div></div><button class="cpf" data-find>find ↗</button></div>`;
        if (i.k === "bm") return `<div class="cpi${fr(i.t)}${h}" data-k="bm" data-id="${x.id}"><span class="cpico bm" aria-hidden="true"></span><div class="cpb"><div class="cpt">${x.note ? esc(x.note) : `<span class="q">“${esc(cut(x.text || "", 60))}”</span>`}</div><div class="cpm">bookmark · ¶ ${x.p + 1} · ${ago(x.t)} · <button data-edit>${x.note ? "rename" : "name it"}</button> · <button data-del>delete</button></div></div><button class="cpf" data-find>find ↗</button></div>`;
        return `<div class="cpi${fr(i.t)}${h}" data-k="note" data-id="${x.id}"><span class="cpico">${x.voice ? "🎙" : "✎"}</span><div class="cpb"><div class="cpt">${esc(x.note)}</div><div class="cpm">${x.voice ? "voice note" : "note"} · ¶ ${x.p + 1} · ${ago(x.t)}${x.src && x.src !== "phone" ? " · from your " + esc(x.src) : ""} · <button data-edit>edit</button> · <button data-del>delete</button></div></div><button class="cpf" data-find>find ↗</button></div>`;
      };
      root.innerHTML = `<div class="chh"><button class="icon" data-nav="-1" aria-label="Previous chapter" ${c ? "" : "disabled"}>‹</button>
          <div class="cht"><div class="serif">${esc(cut(C.t || unit + " " + (c + 1), 40))}</div><div class="small muted">${unit} ${c + 1} of ${nch} · <span class="lv"><i></i>live</span>${!here ? ` · <button class="lnk" data-back>back to ${unit} ${RD.ch + 1}</button>` : ""}</div></div>
          <button class="icon" data-nav="1" aria-label="Next chapter" ${c < nch - 1 ? "" : "disabled"}>›</button></div>
        <div class="chtabs" role="tablist">${[["recap", "Recap"], ["marks", "Marks " + cnt.all], ["people", "People " + people.length]].map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${CH.tab === k}" class="${CH.tab === k ? "on" : ""}">${l}</button>`).join("")}</div>
        ${CH.tab === "recap" ? `<div class="chbody"><div class="k">Recap so far · no spoilers</div>
            ${rc ? `<div class="serif" style="font-weight:400;font-size:16px;line-height:1.6;color:var(--hi)">${esc(rc.text)}</div><div class="small muted">made ${ago(rc.t)} · up to ¶ ${rc.p + 1}${rc.how === "picked" ? " · key lines" : ""}</div>` : `<div class="small muted">${readTo < 0 ? "You haven't started this one yet." : "No recap yet."}</div>`}
            ${readTo >= 0 ? `<button class="btn" data-recap>${rc ? "Refresh it" : "Make one"} from what you've read</button><div class="small muted">Here it picks the key lines. Make one on your laptop for a written recap; it shows up here.</div>` : ""}
            <div class="k" style="margin-top:6px">How it felt</div><div class="tg">${[...TAGS4, ...tags.filter((t) => !TAGS4.includes(t))].map((t) => `<button class="chip ${tags.includes(t) ? "on" : ""}" data-tag="${esc(t)}" aria-pressed="${tags.includes(t)}">${esc(t)}</button>`).join("")}<button class="chip add" data-addtag>+ tag</button></div></div>`
        : CH.tab === "people" ? `<div class="chbody"><div class="k">People in this chapter</div><div class="tg">${people.map((x) => `<span class="chip on">${esc(x)}<button data-unp="${esc(x)}" aria-label="Remove ${esc(x)}">✕</button></span>`).join("") || `<span class="small muted">Nobody added yet.</span>`}</div>
            <form id="pf2" style="display:flex;gap:8px"><input type="text" id="ppn" list="ppl" placeholder="add a person" autocomplete="off"><datalist id="ppl">${((bk && bk.people) || []).filter((x) => !people.includes(x)).map((x) => `<option value="${esc(x)}">`).join("")}</datalist><button class="btn go">add</button></form></div>`
        : `<div class="tg flt">${[["all", "All"], ["hl", "Highlights"], ["note", "Notes"], ["bm", "🔖"]].map(([k, l]) => `<button class="chip ${CH.f === k ? "sel" : ""}" data-f="${k}" aria-pressed="${CH.f === k}" aria-label="${k === "bm" ? "Bookmarks" : l}">${l}${k !== "all" ? " " + cnt[k] : ""}</button>`).join("")}</div>
            <div class="chlist">${shown.map(item).join("") || `<div class="small muted" style="padding:8px 2px">${CH.f === "bm" ? "No bookmarks here yet." : "Nothing here yet. Add a note below: it's pinned to where you are."}</div>`}</div>
            <div class="chadd"><textarea id="cnt" rows="1" placeholder="${here ? `add a note at ¶ ${at + 1}…` : "add a note at the start…"}"></textarea><button class="icon" id="cmic" aria-label="Voice note">🎙</button><button class="btn go" id="cadd">add</button></div>`}
        <div class="chfoot"><button class="btn" id="cbm">🔖 ${here && pinsAt(c, at, "bm").length ? "Bookmarked" : "Bookmark here"}</button><button class="btn" id="cback">Back to reading</button></div>`;
      const Q = (s) => root.querySelector(s), QA = (s) => root.querySelectorAll(s);
      QA("[data-nav]").forEach((x) => (x.onclick = () => { c = Math.max(0, Math.min(nch - 1, c + +x.dataset.nav)); hot = undefined; draw(); }));
      Q("[data-back]") && (Q("[data-back]").onclick = () => { c = RD.ch; draw(); });
      QA("[data-tab]").forEach((x) => (x.onclick = () => { CH.tab = x.dataset.tab; draw(); }));
      QA("[data-f]").forEach((x) => (x.onclick = () => { CH.f = x.dataset.f; hot = undefined; draw(); }));
      const setMeta = (patch) => { const bk2 = bookRec(true), ce = (bk2.chapters = bk2.chapters || {})[C.t] = bk2.chapters[C.t] || { notes: "", tags: [], t: now() };
        Object.assign(ce, patch, { t: now() }); if (patch.people) { bk2.people = bk2.people || []; for (const x of patch.people) if (!bk2.people.includes(x)) bk2.people.push(x); } bk2.t = now(); mineChanged(); draw(); };
      QA("[data-tag]").forEach((x) => (x.onclick = () => { const t = x.dataset.tag; setMeta({ tags: tags.includes(t) ? tags.filter((y) => y !== t) : [...tags, t] }); }));
      Q("[data-addtag]") && (Q("[data-addtag]").onclick = (e) => { const inp = document.createElement("input"); inp.type = "text"; inp.placeholder = "new tag"; inp.className = "chip"; inp.style.width = "130px"; e.currentTarget.replaceWith(inp); inp.focus();
        inp.onkeydown = (k) => { if (k.key === "Enter" && inp.value.trim()) setMeta({ tags: [...tags, inp.value.trim().toLowerCase()] }); }; inp.onblur = () => { if (inp.value.trim()) setMeta({ tags: [...tags, inp.value.trim().toLowerCase()] }); }; });
      Q("[data-recap]") && (Q("[data-recap]").onclick = () => { const upto = Math.max(0, readTo); ((S.recaps = S.recaps || {})[RD.rid] = S.recaps[RD.rid] || {})[String(c)] = { text: quickRecap(C.p.slice(0, upto + 1)), p: upto, t: now(), how: "picked" }; mineChanged(); draw(); });
      QA("[data-unp]").forEach((x) => (x.onclick = () => setMeta({ people: people.filter((y) => y !== x.dataset.unp) })));
      Q("#pf2") && (Q("#pf2").onsubmit = (e) => { e.preventDefault(); const v = Q("#ppn").value.trim(); if (v && !people.includes(v)) setMeta({ people: [...people, v.slice(0, 60)] }); });
      QA(".cpi").forEach((row) => {
        const k = row.dataset.k, x = k === "hl" ? marks.find((m) => m.id === row.dataset.id) : pinsOf().find((m) => m.id === row.dataset.id);
        row.querySelector("[data-find]").onclick = () => { close(); findAt(k === "hl" ? x.ch : k === "page" ? c : x.ch, k === "hl" ? x.a : k === "page" ? 0 : x.p); };
        const ed = row.querySelector("[data-edit]"), del = row.querySelector("[data-del]");
        ed && (ed.onclick = () => { const box = row.querySelector(".cpt"), ta = document.createElement("textarea"); ta.value = x.note || ""; ta.rows = 3; box.replaceWith(ta); ta.focus();
          ed.textContent = "save"; ed.onclick = () => { x.note = ta.value.trim().slice(0, 8000); x.e = now(); mineChanged(); draw(); }; });
        del && (del.onclick = () => { if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = "sure?"; setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "delete"; } }, 3000); return; }
          S.pins[RD.rid] = pinsOf().filter((y) => y !== x); mineChanged(); draw(); if (c === RD.ch) drawBookKeep(); });
      });
      if (Q("#cadd")) {
        const ta = Q("#cnt"); ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; };
        Q("#cmic").onclick = () => listen(ta, Q("#cmic"));
        Q("#cadd").onclick = () => { const v = ta.value.trim(); if (!v) return ta.focus(); addPin("note", c, at, v, ta.dataset.voice ? { voice: 1 } : {}); if (CH.f === "bm" || CH.f === "hl") CH.f = "all"; draw(); if (c === RD.ch) drawBookKeep(); toast("Note pinned here"); };
      }
      Q("#cbm").onclick = () => { toggleBookmark(c, at); draw(); };
      Q("#cback").onclick = close;
      root.querySelector(".cpi.hot")?.scrollIntoView({ block: "nearest" });
    };
    draw();
    CH.open = { redraw: draw };
    if (resume) pauseSpeech();
    clearInterval(CH.t); CH.t = setInterval(() => { if (!document.hidden) kick(0); }, 15000);
    CH.close = close;
  });
  new MutationObserver((_, o) => { if (!bg.isConnected) { o.disconnect(); CH.open = null; clearInterval(CH.t); CH.sig = liveSig(); } }).observe(document.body, { childList: true });
}
function drawBookKeep() { const y = scrollY; drawBook(); window.scrollTo(0, y); }
function findAt(n, j) {
  const go = () => { const el = document.querySelector(`#tx p[data-j="${j}"]`); if (!el) return; el.scrollIntoView({ block: "center" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1800); };
  if (n !== RD.ch) { goCh(n); setTimeout(go, 60); } else go();
}
// the voice that reads to you: any voice on the phone, with a preview, pitch, speed and a breath between paragraphs
function voiceSheet() {
  const resume = SP.on && !SP.paused; if (resume) pauseSpeech();
  let all = false;
  sheet(`<div id="vs"></div>`, (bg, close) => {
    const root = $("#vs", bg);
    const sample = () => { const p = RD.book && RD.book.ch[RD.ch].p[SP.on ? SP.j : 0]; const s = p ? sentences(p)[0] : null; return s ? p.slice(s[0], s[1]).slice(0, 200) : "In the morning, when you rise unwillingly, let this thought be present."; };
    const say = (v) => { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(sample()); if (v) try { u.voice = v; u.lang = String(v.lang || "").replace("_", "-"); } catch (e) {} u.pitch = M.pitch || 1; u.rate = M.rate || 1; speechSynthesis.speak(u); };
    const draw = () => {
      const vs = speechSynthesis.getVoices().filter((v) => !/maisie/i.test(v.name)), lang = (navigator.language || "en").slice(0, 2).toLowerCase();
      const list = (all ? vs : vs.filter((v) => v.lang.toLowerCase().startsWith(lang) || /^en/i.test(v.lang))).slice().sort((a, b) => (b.localService - a.localService) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
      const cur = pickVoice();
      root.innerHTML = `<h3>Reading voice</h3><div class="small muted">Voices already on this phone · tap ▶ to hear one</div>
        ${/Android/i.test(navigator.userAgent) ? `<div class="card small" style="line-height:1.55;color:var(--text)">On Android, each language here (US, UK, India, Australia…) is one voice, and <b>which</b> voice it is gets picked in your phone's settings: <b>Settings → search “Text-to-speech” → Preferred engine: Speech Services by Google → ⚙ → Install voice data → English (United States)</b>. There you can hear and choose between several voices (some are much softer). Feather uses whichever you pick. Pitch and speed below still work on top of it.</div>` : ""}
        <div class="vlist">${list.map((v, i) => `<div class="vrow ${cur && v.voiceURI === cur.voiceURI ? "on" : ""}" data-i="${i}" role="button" tabindex="0" aria-pressed="${!!(cur && v.voiceURI === cur.voiceURI)}"><span class="rad"></span><span class="vn"><b>${esc(v.name.replace(/^(Google|Microsoft|Samsung)\s+/, ""))}</b><span class="small muted">${esc(v.lang)} · ${v.localService ? "works offline" : "needs internet"}</span></span><button class="icon vp" data-p="${i}" aria-label="Hear ${esc(v.name)}">▶</button></div>`).join("") || `<div class="small muted">This phone hasn't listed its voices yet. Close this and open it again in a moment.</div>`}
          <div class="vrow off"><span class="rad"></span><span class="vn"><b>PC voice · natural</b><span class="small muted">coming later · made on your PC, kept for offline</span></span></div></div>
        ${all ? "" : `<button class="lnk" id="vall">show voices in every language</button>`}
        <label class="k" for="vpi">Pitch · <span id="vpl">${(M.pitch || 1).toFixed(2)}</span></label><input type="range" id="vpi" min="0.6" max="1.4" step="0.05" value="${M.pitch || 1}">
        <label class="k" for="vra">Speed · <span id="vrl">${(M.rate || 1).toFixed(2)}×</span></label><input type="range" id="vra" min="0.6" max="2" step="0.05" value="${M.rate || 1}">
        <label class="tgl"><input type="checkbox" id="vgap" ${M.gap ? "checked" : ""}> a short pause between paragraphs</label>
        <button class="btn go" id="vok">Done</button>`;
      root.querySelectorAll(".vrow[data-i]").forEach((r) => (r.onclick = (e) => { if (e.target.closest(".vp")) return; const v = list[+r.dataset.i]; M.voice = v.voiceURI; saveMeta(); draw(); say(v); }));
      root.querySelectorAll(".vp").forEach((b) => (b.onclick = () => say(list[+b.dataset.p])));
      $("#vall", root) && ($("#vall", root).onclick = () => { all = true; draw(); });
      $("#vpi", root).oninput = (e) => { M.pitch = +e.target.value; $("#vpl", root).textContent = M.pitch.toFixed(2); };
      $("#vpi", root).onchange = () => { saveMeta(); say(pickVoice()); };
      $("#vra", root).oninput = (e) => { M.rate = +e.target.value; SP.rate = M.rate; $("#vrl", root).textContent = M.rate.toFixed(2) + "×"; };
      $("#vra", root).onchange = () => { saveMeta(); say(pickVoice()); };
      $("#vgap", root).onchange = (e) => { M.gap = e.target.checked; saveMeta(); };
      $("#vok", root).onclick = () => { speechSynthesis.cancel(); close(); bindPlayer(); if (resume) resumeSpeech(); };
    };
    draw();
    if (!speechSynthesis.getVoices().length) speechSynthesis.onvoiceschanged = () => root.isConnected && draw();
  });
}

// ---- Sonia: chapters your PC reads with Sonia, kept on the phone, played offline (screen off too) ----
const SOVOICES = [["en-GB-SoniaNeural", "Sonia · British woman"], ["en-GB-LibbyNeural", "Libby · British woman"], ["en-GB-RyanNeural", "Ryan · British man"], ["en-GB-ThomasNeural", "Thomas · British man"], ["en-IE-EmilyNeural", "Emily · Irish woman"], ["en-IE-ConnorNeural", "Connor · Irish man"], ["en-AU-NatashaNeural", "Natasha · Australian woman"], ["en-AU-WilliamNeural", "William · Australian man"]];
const SOSET = () => { const s = ((S && S.sonia) || {}).set || {}; return { speed: +s.speed || M.rate || 1.0, vol: s.vol == null ? 1 : +s.vol, ahead: s.ahead !== false, voice: s.voice || "en-GB-SoniaNeural" }; };
function soSet(patch, save) { S.sonia = S.sonia || {}; S.sonia.set = { ...(S.sonia.set || {}), ...patch }; if (save) changed(); }
function soniaWant() {
  const w = new Set(), R = S.readings || {};
  for (const q of Object.values(((S.sonia || {}).reqs) || {})) {
    if (!q || !(q.for || []).includes("phone") || !R[q.rid]) continue;
    const n = R[q.rid].pages || 0, cur = ((S.readpos || {})[q.rid] || {}).ch || 0;
    for (let c = Math.max(+q.from || 0, cur - 1); c <= Math.min(n - 1, q.to == null ? n - 1 : +q.to); c++) w.add(q.rid + "/" + c);
  }
  return w;
}
let soBusy = false;
async function soPull(k, part) {
  const bufs = []; let off = 0, total = null;
  while (total === null || off < total) {
    const r = await call({ act: "audio", k, part, off }); if (r.why || !r.data) return null;
    const b = FC.unb64(r.data); bufs.push(b); off += b.length; total = r.total; if (!b.length) break;
  }
  const all = new Uint8Array(off); let p = 0; for (const b of bufs) { all.set(b, p); p += b.length; } return all;
}
async function fetchSonia() {
  if (soBusy || !S || !S.sonia) return;
  soBusy = true;
  try {
    const want = soniaWant(), keys = (await DB.keys()).filter((k) => k.startsWith("sonia/"));
    if (want.size) {
      const items = (await call({ act: "audio", op: "list" })).items || {};
      for (const k of want) {
        if (!(k in items)) continue;
        const cur = keys.includes("sonia/" + k) ? await DB.get("sonia/" + k, "files") : null;
        if (cur && cur.v === items[k]) continue;
        const a = await soPull(k, "a"), t = a && await soPull(k, "t");
        if (!a || !t) continue;
        await DB.put("sonia/" + k, { v: items[k], a, t, got: now(), played: 0 }, "files");
        if (V.view === "book") bindPlayer();
      }
    }
    for (const key of keys) {   // listened to (or no longer wanted) for two weeks: cleared
      if (want.has(key.slice(6))) continue;
      const x = await DB.get(key, "files");
      if (x && now() - (x.played || x.got || 0) > 14 * 86400) await DB.del(key, "files");
    }
  } catch (e) { /* next sync */ } finally { soBusy = false; }
}
const SO = { el: null, T: null, url: null, key: "", seek: false, ready: {} };
async function soHas(rid, ch) { const k = rid + "/" + ch; if (SO.ready[k] === undefined) SO.ready[k] = !!(await DB.get("sonia/" + k, "files")); return SO.ready[k]; }
async function soLoad(rid, ch) {
  const k = rid + "/" + ch, x = await DB.get("sonia/" + k, "files"); SO.ready[k] = !!x;
  if (!x) return false;
  try {
    const a = await FC.open(K, x.a, "feather-audio"), T = JSON.parse(FC.td.decode(await FC.open(K, x.t, "feather-audiot")));
    if (!SO.el) {
      SO.el = new Audio(); SO.el.preload = "auto";
      SO.el.ontimeupdate = soTick;
      SO.el.onended = () => { if (SO.key !== RD.rid + "/" + RD.ch || !SP.on || SP.paused) return; SP.j = RD.book.ch[RD.ch].p.length; speakCur(); };
    }
    if (SO.url) URL.revokeObjectURL(SO.url);
    SO.url = URL.createObjectURL(new Blob([a], { type: "audio/mpeg" })); SO.el.src = SO.url; SO.T = T; SO.key = k;
    x.played = now(); DB.put("sonia/" + k, x, "files");
    return true;
  } catch (e) { return false; }
}
function soTime(j, a) {
  const P = SO.T && SO.T.paras[j]; if (!P) return null;
  let ms = a ? P.dur : 0; if (a) for (const [c, t] of P.w) if (c >= a) { ms = t; break; }
  return (P.t0 + ms) / 1000;
}
function soTick() {
  if (!SP.on || SP.mode !== "sonia" || !SO.T || SO.seek) return;
  if (SP.sleepAt && Date.now() >= SP.sleepAt) { SP.sleepAt = 0; pauseSpeech(); return; }
  const t = SO.el.currentTime * 1000, ps = SO.T.paras;
  let j = 0; for (let i = 0; i < ps.length; i++) if (ps[i].dur && ps[i].t0 <= t) j = i;
  const sents = j === SP.j ? SP.sents : sentences(RD.book.ch[RD.ch].p[j] || "");
  let k = 0; for (let i = 0; i < sents.length; i++) { const st = soTime(j, sents[i][0]); if (st !== null && st * 1000 <= t + 60) k = i; }
  if (j !== SP.j || k !== SP.k) { const nj = j !== SP.j; SP.j = j; SP.sents = sents; SP.k = k; paintNow(); if (nj || k === 0) savePosQuiet(SP.j); }
}
function soApply() { const z = SOSET(); if (SO.el) { SO.el.playbackRate = z.speed; SO.el.volume = Math.max(0, Math.min(1, z.vol)); } }
function soPlay() {
  if (SO.seek || SO.el.paused && SO.el.currentTime === 0) { const st = soTime(SP.j, (SP.sents[SP.k] || [0])[0]); if (st !== null) SO.el.currentTime = st; }
  SO.seek = false; soApply(); SO.el.play().catch(() => { SP.mode = "tts"; speakCur(); });
}
function soAhead() {   // keep the next chapters coming while you listen
  const z = SOSET(); if (!z.ahead || !RD.book) return;
  const n = RD.book.ch.length, rq = ((S.sonia || {}).reqs) || {};
  const has = Object.values(rq).some((q) => q.rid === RD.rid && (q.for || []).includes("phone") && +q.from <= RD.ch + 1 && (q.to == null || +q.to >= Math.min(n - 1, RD.ch + 2)));
  if (has || RD.ch + 1 >= n) return;
  S.sonia = S.sonia || {}; S.sonia.reqs = rq; rq[newId()] = { rid: RD.rid, from: RD.ch + 1, to: Math.min(n - 1, RD.ch + 2), for: ["phone"], t: now(), ahead: true }; changed();
}
function soniaSheet() {
  if (!RD.book) return;
  const n = RD.book.ch.length, here = RD.ch, chars = (c) => (RD.book.ch[c].p || []).join(" ").length;
  const est = (a, b) => { let c = 0; for (let i = a; i <= b; i++) c += chars(i); const min = c / 900; return `~${min < 60 ? Math.max(1, Math.round(min)) + " min" : (min / 60).toFixed(1) + " h"} · ${Math.max(1, Math.round(min * 0.36))} MB`; };
  const so = S.sonia || {}, made = (so.made || {})[RD.rid] || [], z = SOSET(), opt = (v) => `<option value="${v}"${v === Math.min(n - 1, here + 5) ? " selected" : ""}>${v + 1}</option>`;
  sheet(`<h3>Sonia audio</h3><p class="small muted">Your PC makes it with Sonia (it needs the internet for that), then it plays here offline, even with the screen off. ${so.err ? `<br><b>${esc(so.err)}</b>` : so.left ? `<br>Your PC is making ${so.left} chapter${so.left > 1 ? "s" : ""} now.` : ""}</p>
    <label class="setrow"><input type="radio" name="sow" value="one" checked> <span style="flex:1">This chapter</span><span class="small muted">${est(here, here)}</span></label>
    <label class="setrow"><input type="radio" name="sow" value="to"> <span style="flex:1">From here to chapter</span><select id="soto">${Array.from({ length: n - here }, (_, i) => opt(here + i)).join("")}</select></label>
    <label class="setrow"><input type="radio" name="sow" value="all"> <span style="flex:1">Whole book</span><span class="small muted">${est(0, n - 1)}</span></label>
    <label class="setrow"><span style="flex:1">Voice</span><select id="sovo">${SOVOICES.concat((so.accents || []).map((a) => [a.v, a.name])).map(([v, n]) => `<option value="${v}"${v === z.voice ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
    <label class="setrow"><input type="checkbox" id="sonight"${((so.set || {}).night) !== false ? " checked" : ""}> <span style="flex:1">overnight: record my next 3 chapters each night</span></label>
    <label class="setrow"><input type="checkbox" id="soah"${z.ahead ? " checked" : ""}> <span style="flex:1">keep the next 2 chapters ready as I listen</span></label>
    <label class="setrow"><input type="checkbox" id="solp"> <span style="flex:1">also put it on my laptops</span></label>
    <p class="small muted">Made already: ${made.length ? made.map((c) => c + 1).join(", ") : "none yet"}. Chapters already made keep their voice; accent voices: chapters you ask for are made now (Archie on your PC is slower while it does), the automatic ones overnight.${so.accent_now ? " <b>Making one in an accent voice right now.</b>" : ""}${so.night_left ? ` ${so.night_left} waiting for tonight.` : ""} Finished chapters clear themselves after 2 weeks.</p>
    <button class="btn go" id="sogo">Make it with Sonia</button>`, (bg, close) => {
    $("#sogo", bg).onclick = () => {
      const w = bg.querySelector('input[name="sow"]:checked').value, to = w === "one" ? here : w === "all" ? n - 1 : +$("#soto", bg).value, from = w === "all" ? 0 : here;
      S.sonia = S.sonia || {}; S.sonia.reqs = S.sonia.reqs || {};
      S.sonia.reqs[newId()] = { rid: RD.rid, from, to, for: $("#solp", bg).checked ? ["phone", "laptops"] : ["phone"], t: now() };
      soSet({ ahead: $("#soah", bg).checked, voice: $("#sovo", bg).value, night: $("#sonight", bg).checked }, false); changed(); close(); toast("Asked your PC · it arrives after the next syncs");
    };
  });
}

// ---- Read to me: the phone's own voice, sentence by sentence, with your place kept as it goes ----
const SP = { on: false, paused: false, j: 0, k: 0, sents: [], rate: 1.0, sleepAt: 0, utt: null, mode: "tts" };
const speaking = () => SP.on && !SP.paused;
function playerHTML() {
  const pdf = RD.book && RD.book.kind === "pdf", n = RD.book ? RD.book.ch.length : 1, pct = Math.round(100 * (RD.ch + 1) / n);
  const left = SP.sleepAt ? Math.max(0, Math.round((SP.sleepAt - Date.now()) / 60000)) + " min" : "sleep";
  if (M.tuck) return `<div class="pmini"><div class="pmbar"><i style="width:${pct}%"></i></div>
      <button class="pbig sm" id="spl" aria-label="${speaking() ? "Pause" : "Play"}">${speaking() ? "II" : "▶"}</button>
      <span class="pml"><span class="k">${SP.on ? (SP.paused ? "Paused" : `${SP.mode === "sonia" ? "Sonia" : "Reading to you"} · ${SOSET().speed.toFixed(2)}×`) : "Read to me"}</span><span class="pms" id="pms">${esc(nowText())}</span></span>
      ${SP.on ? `<button class="icon" id="shl" aria-label="Highlight this sentence">✦</button>` : ""}<button class="icon" id="stk" aria-label="Open the player">⌃</button></div>`;
  return `<div class="prow"><span class="k" style="white-space:nowrap">${SP.on ? (SP.paused ? "Paused" : SP.mode === "sonia" ? "Sonia reading" : "Reading to you") : "Read to me"} · ${pdf ? "p." : "ch."} ${RD.ch + 1}/${n}</span><button class="btn tk" id="stk" aria-label="Tuck the player away" style="white-space:nowrap">⌄ tuck away</button></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="prow"><button class="btn" id="sb" aria-label="Back one sentence">−1</button>
      <button class="pbig" id="spl" aria-label="${speaking() ? "Pause" : "Play"}">${speaking() ? "II" : "▶"}</button>
      <button class="btn" id="sf" aria-label="Forward one sentence">+1</button><button class="btn" id="sso" aria-label="Sonia audio">${SP.mode === "sonia" ? "Sonia ✓" : "Sonia"}</button><button class="btn" id="ssl" aria-label="Sleep timer">${left}</button><button class="btn" id="svo" aria-label="Reading voice">voice</button></div>
    <div class="prow sov"><label>speed <b id="sspv">${SOSET().speed.toFixed(2)}×</b><input type="range" id="ssp" min="0.6" max="2" step="0.05" value="${SOSET().speed}"></label><label>volume <b id="svlv">${Math.round(SOSET().vol * 100)}%</b><input type="range" id="svl" min="0" max="1" step="0.05" value="${SOSET().vol}"></label></div>
    ${SP.on ? `<div class="acts"><button class="btn" id="shl">highlight this</button><button class="btn" id="snt">add a note</button><button class="btn" id="sbm">🔖 here</button></div>` : ""}`;
}
function nowText() {
  if (!RD.book) return "";
  if (!SP.on) return RD.book.ch[RD.ch].t || "";
  const p = RD.book.ch[RD.ch].p[SP.j] || "", [a, b] = SP.sents[SP.k] || [0, 0];
  return p.slice(a, b);
}
function bindPlayer() {
  const pl = $("#pl"); if (!pl) return;
  pl.innerHTML = playerHTML(); pl.classList.toggle("tuck", !!M.tuck);
  const bub = $("#cbub"); if (bub) bub.style.bottom = Math.round(innerHeight - pl.getBoundingClientRect().top + 12) + "px";
  const on = (id, f) => { const e = $(id); if (e) e.onclick = f; };
  on("#stk", () => { M.tuck = !M.tuck; saveMeta(); bindPlayer(); });  // tucking never stops the reading
  on("#svo", voiceSheet);
  on("#spl", () => (!SP.on ? startSpeech() : SP.paused ? resumeSpeech() : pauseSpeech()));
  on("#sb", () => SP.on && jump(-1));
  on("#sf", () => SP.on && jump(1));
  on("#sso", soniaSheet);
  const sp = $("#ssp"), vl = $("#svl");
  if (sp) { sp.oninput = () => { soSet({ speed: +sp.value }); SP.rate = +sp.value; $("#sspv").textContent = (+sp.value).toFixed(2) + "×"; soApply(); };
    sp.onchange = () => { changed(); if (speaking() && SP.mode !== "sonia") { speechSynthesis.cancel(); speakCur(); } }; }
  if (vl) { vl.oninput = () => { soSet({ vol: +vl.value }); $("#svlv").textContent = Math.round(+vl.value * 100) + "%"; soApply(); }; vl.onchange = () => changed(); }
  on("#ssl", () => { const O = [0, 10, 20, 30, 60], cur = SP.sleepAt ? Math.round((SP.sleepAt - Date.now()) / 60000) : 0, nx = O.find((m) => m > cur + 1) || 0; SP.sleepAt = nx ? Date.now() + nx * 60000 : 0; bindPlayer(); });
  if (SP.on) {
    const cur = () => { const p = RD.book.ch[RD.ch].p[SP.j], [a, b] = SP.sents[SP.k]; return [SP.j, a, b, p.slice(a, b)]; };
    on("#shl", () => { const [j, a, b, t] = cur(); addMark(j, a, b, t); drawBook(); toast("Highlighted"); });
    on("#snt", () => { const [j, a, b, t] = cur(); noteForMark(j, a, b, t); });
    on("#sbm", () => { const pins = pinsAt(RD.ch, SP.j, "bm"); if (pins.length) return toast("Already bookmarked here"); toggleBookmark(RD.ch, SP.j); });
  }
}
function startSpeech(fromJ) {
  SP.rate = SOSET().speed;
  SP.on = true; SP.paused = false;
  // where to start: the sentence you stopped on if it's still on screen, otherwise the paragraph you're looking at
  if (fromJ === undefined) {
    const last = ((S.readpos || {})[RD.rid] || {}), el = document.querySelector(`#tx p[data-j="${last.p}"]`), r = el && el.getBoundingClientRect();
    const onScreen = last.ch === RD.ch && r && r.bottom > 80 && r.top < innerHeight - 160;
    fromJ = onScreen ? last.p : hereJ();
    SP.k0 = onScreen && SP.lastJ === last.p ? SP.lastK || 0 : 0;
  } else SP.k0 = 0;
  SP.j = fromJ || 0; if (SP.j >= RD.book.ch[RD.ch].p.length) SP.j = 0;
  SP.sents = sentences(RD.book.ch[RD.ch].p[SP.j] || ""); SP.k = Math.min(SP.k0 || 0, SP.sents.length - 1);
  if ("mediaSession" in navigator) { navigator.mediaSession.metadata = new MediaMetadata({ title: RD.book.ch[RD.ch].t || "", artist: S.readings[RD.rid].name, album: "Feather" });
    navigator.mediaSession.setActionHandler("pause", pauseSpeech); navigator.mediaSession.setActionHandler("play", resumeSpeech);
    try { navigator.mediaSession.setActionHandler("previoustrack", () => SP.on && jump(-1)); navigator.mediaSession.setActionHandler("nexttrack", () => SP.on && jump(1));
      navigator.mediaSession.setActionHandler("seekbackward", () => SP.on && jump(-2)); navigator.mediaSession.setActionHandler("seekforward", () => SP.on && jump(2)); } catch (e) {} }
  drawBook();
  soLoad(RD.rid, RD.ch).then((ok) => { SP.mode = ok && M.sonia !== false ? "sonia" : "tts"; SO.seek = true; if (SP.mode === "sonia") soAhead();
    if (SP.mode === "tts" && !("speechSynthesis" in window)) { SP.on = false; return toast("This phone has no read-aloud voice for the browser"); }
    bindPlayer(); speakCur(); });
}
function pickVoice() { const vs = speechSynthesis.getVoices(); const mine = M.voice && vs.find((v) => v.voiceURI === M.voice); if (mine) return mine; return vs.find((v) => v.localService && /^en/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null; }
function speakCur() {
  const ps = RD.book.ch[RD.ch].p, p = ps[SP.j];
  if (p === undefined) { if (RD.ch < RD.book.ch.length - 1) { goCh(RD.ch + 1, true); SP.j = 0; SP.sents = sentences(RD.book.ch[RD.ch].p[0] || ""); SP.k = 0; drawBook();
      if (SO.el) SO.el.pause();
      return void soLoad(RD.rid, RD.ch).then((ok) => { SP.mode = ok && M.sonia !== false ? "sonia" : "tts"; SO.seek = true; if (ok) soAhead(); bindPlayer(); if (SP.on && !SP.paused) speakCur(); }); }
    return stopSpeech(); }
  if (SP.mode === "sonia" && SO.el && SO.key === RD.rid + "/" + RD.ch) return soPlay();
  const [a, b] = SP.sents[SP.k] || [0, 0];
  const u = new SpeechSynthesisUtterance(p.slice(a, b)); u.rate = SOSET().speed; u.volume = Math.max(0, Math.min(1, SOSET().vol)); u.pitch = M.pitch || 1; const v = pickVoice(); if (v) try { u.voice = v; u.lang = String(v.lang || "").replace("_", "-"); } catch (e) {}
  SP.utt = u;
  u.onend = () => {
    if (SP.utt !== u || !SP.on || SP.paused) return;
    if (SP.sleepAt && Date.now() >= SP.sleepAt) { SP.sleepAt = 0; pauseSpeech(); return; }
    const j0 = SP.j; advance(1); paintNow();
    if (M.gap && SP.j !== j0) { clearTimeout(SP.gapT); SP.gapT = setTimeout(() => { if (SP.utt === u && SP.on && !SP.paused) speakCur(); }, 550); } else speakCur();
  };
  speechSynthesis.speak(u);
}
function advance(d) {
  SP.k += d;
  const ps = RD.book.ch[RD.ch].p;
  while (SP.k >= SP.sents.length) { SP.j++; if (SP.j >= ps.length) { SP.k = 0; return; } SP.sents = sentences(ps[SP.j]); SP.k = 0; }
  while (SP.k < 0) { SP.j--; if (SP.j < 0) { SP.j = 0; SP.k = 0; SP.sents = sentences(ps[0]); return; } SP.sents = sentences(ps[SP.j]); SP.k = SP.sents.length - 1; }
  if (SP.k === 0) savePosQuiet(SP.j);
}
function savePosQuiet(j) { (S.readpos = S.readpos || {})[RD.rid] = { ch: RD.ch, p: j, t: now() }; M.dirty = true; editSeq++; clearTimeout(savePosQuiet.t); savePosQuiet.t = setTimeout(() => { saveMeta(); saveStore(); kick(4000); }, 3000); }
function paintNow() {
  document.querySelectorAll("#tx p[data-j]").forEach((el) => {
    const j = +el.dataset.j, has = el.querySelector(".now");
    if (j === SP.j || has) el.innerHTML = pinMark(j) + paraHTML(RD.book.ch[RD.ch].p[j], j, (S.marks || {})[RD.rid] || [], j === SP.j && SP.on ? SP.sents[SP.k] : null);
  });
  const cur = document.querySelector("#tx .now"); if (cur) cur.scrollIntoView({ block: "center", behavior: "smooth" });
  const pm = $("#pms"); if (pm) pm.textContent = nowText();
}
function jump(d) { speechSynthesis.cancel(); advance(d); paintNow(); SO.seek = true; if (!SP.paused) speakCur(); else if (SP.mode === "sonia" && SO.el) { const st = soTime(SP.j, (SP.sents[SP.k] || [0])[0]); if (st !== null) SO.el.currentTime = st; SO.seek = false; } }
function pauseSpeech() { SP.paused = true; SP.utt = null; speechSynthesis.cancel(); if (SO.el) SO.el.pause(); savePos(SP.j); bindPlayer(); }
function resumeSpeech() { SP.paused = false; speakCur(); bindPlayer(); }
function stopSpeech() { if (!SP.on) return; SP.lastJ = SP.j; SP.lastK = SP.k; savePosQuiet(SP.j); SP.on = false; SP.paused = false; SP.utt = null; try { speechSynthesis.cancel(); } catch (e) {} if (SO.el) SO.el.pause(); }

// ---- flashcards (the same spaced repetition as the laptops) ----
function grade(c, q) {
  let ease = c.ease || 2.5, reps = c.reps || 0, interval;
  if (q === 0) { reps = 0; interval = 0; }
  else { reps += 1; interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round((c.interval || 1) * ease * (q === 3 ? 1.2 : q === 2 ? 1.0 : 0.8)); ease = Math.max(1.3, ease + (q === 3 ? 0.1 : q === 2 ? 0 : -0.15)); }
  Object.assign(c, { reps, interval, ease: Math.round(ease * 100) / 100, due: now() + Math.max(interval, 0) * 86400 + (q === 0 ? 600 : 0), t: now() });
  const rv = ((S.stats = S.stats || {}).reviews = S.stats.reviews || {}), day = new Date().toLocaleDateString("en-CA");
  rv[day] = (rv[day] || 0) + 1;
  for (const k of Object.keys(rv).sort().slice(0, -60)) delete rv[k];
  changed();
}
const CS = { flip: false, done: 0, deck: null };
// ---- flashcard sets between Archie and Feather: only when you press send / get / request ----
const deckOf = (c) => c.deck || "General";
const dkey = (n) => String(n).trim().replace(/\s+/g, " ").toLowerCase();
function shelfQueue(op, deck, extra = {}) {
  (S.cardq = S.cardq || {})[newId()] = { op, deck, t: now(), ...extra };
  changed(); kick(500);
  toast(op === "restore" ? `Putting back “${deck}” · at the next sync` : op === "f2a" ? `Sending “${deck}” to Archie · at the next sync` : `Asking Archie for “${deck}” · it arrives at the next sync`);
  if (V.view === "exam") { location.hash = "#shelf"; return; }
  if (V.view === "shelf") render();
}
function moveSheet(op, deck, replaces, ex = null) {  // send (f2a) or get (a2f): with progress, or a clean copy. ex = {eid} for an exam
  const to = op === "f2a" ? "Archie" : "Feather";
  sheet(`<div class="k">${ex ? "Mock exam" : "Flashcards"}</div><h3>${op === "f2a" ? `Send “${esc(deck)}” to Archie` : `Get Archie's “${esc(deck)}”`}</h3>
    <button class="setrow mopt on" data-c="0"><span class="setpick"><span style="color:var(--hi)">${ex ? "With my attempts" : "With my progress"}</span><span class="small muted">${ex ? "your scores come along" : `what you know, what's due · ${to} picks up where you are`}</span></span></button>
    <button class="setrow mopt" data-c="1"><span class="setpick"><span style="color:var(--hi)">${ex ? "Blank exam" : "Clean copy"}</span><span class="small muted">${ex ? "just the questions, never taken" : "just the cards, all new again"}</span></span></button>
    <div class="small muted" style="line-height:1.6">${replaces ? `This replaces ${to}'s copy. The old one goes to History, where you can put it back.` : `${to} doesn't have this set yet, so nothing gets replaced.`}</div>
    <div style="display:flex;gap:8px"><button class="btn" id="mc" style="flex:1">Cancel</button><button class="btn go" id="mg" style="flex:1">${op === "f2a" ? "Send" : "Get it"}</button></div>`, (bg, close) => {
    let clean = false;
    bg.querySelectorAll(".mopt").forEach((b) => (b.onclick = () => { clean = b.dataset.c === "1"; bg.querySelectorAll(".mopt").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("#mc", bg).onclick = close;
    $("#mg", bg).onclick = () => { close(); shelfQueue(op, deck, { ...(clean ? { clean: true } : {}), ...(ex ? { kind: "exam", eid: ex.eid } : {}) }); };
  });
}
function historySheet() {
  const H = S.shelfhist || [];
  const when = (x) => new Date(x * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  sheet(`<h3>History</h3><div class="small muted" style="line-height:1.6">Every version a send or get replaced. Putting one back makes it the current copy on that side; what it replaces lands here too.</div>
    ${H.length ? H.map((h) => `<div class="setrow"><div class="setpick"><span class="serif">${esc(h.name)} · ${h.side === "archie" ? "Archie's" : "Feather's"} copy</span><span class="small muted">${when(h.t)} · ${h.kind === "exam" ? "mock exam · " + h.n + " questions" : h.n + " cards"}</span></div><button class="setb go" data-h="${esc(h.id)}" data-n="${esc(h.name)}">put it back</button></div>`).join("") : `<div class="small muted">Nothing replaced yet.</div>`}`, (bg, close) => {
    bg.querySelectorAll("[data-h]").forEach((b) => (b.onclick = () => { if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "sure?"; b.classList.add("armed"); return; } close(); shelfQueue("restore", b.dataset.n, { hid: b.dataset.h }); }));
  });
}
function vShelf() {
  const sets = {}; Object.values(S.cards || {}).forEach((c) => (sets[deckOf(c)] ||= []).push(c));
  const names = Object.keys(sets).sort((a, b) => a.localeCompare(b));
  const arch = {}; Object.entries(S.archiedecks || {}).forEach(([n, x]) => (arch[dkey(n)] = { ...x, name: n }));
  const pend = {}; Object.values(S.cardq || {}).forEach((r) => (pend[dkey(r.deck)] = r.op));
  const newer = names.filter((d) => arch[dkey(d)] && arch[dkey(d)].linked && arch[dkey(d)].anewer && !pend[dkey(d)]);
  const here = names.filter((d) => !newer.includes(d));
  const onlyA = Object.values(arch).filter((a) => !names.some((d) => dkey(d) === dkey(a.name))).sort((a, b) => a.name.localeCompare(b.name));
  const when = (x) => (x ? new Date(x * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
  const st = (d) => { const a = arch[dkey(d)];
    if (pend[dkey(d)]) return `<span class="muted"><i>waiting for your PC…</i></span>`;
    if (!a) return `<span class="muted">only here</span>`;
    if (!a.linked) return `<span class="muted">Archie has one with this name</span>`;
    if (a.anewer) return `<span style="color:var(--lime)">Archie has a newer version</span>`;
    return `<span style="color:var(--limetext)">in Archie · sent ${when(a.t)}${a.fnewer ? " · changed here since" : ""}</span>`; };
  const row = (d) => { const a = arch[dkey(d)], p = pend[dkey(d)];
    return `<div class="setrow"><div class="setpick"><span class="k" style="letter-spacing:.12em">Flashcards</span><span class="serif">${esc(d)}</span><span class="small">${sets[d].length} card${sets[d].length === 1 ? "" : "s"} · ${st(d)}</span></div>
      ${p ? "" : `${a ? `<button class="setb${a.anewer ? " go" : ""}" data-get="${esc(a.name)}">get</button>` : ""}<button class="setb${a ? "" : " go"}" data-send="${esc(d)}">${a ? "send" : "send to Archie"}</button>`}</div>`; };
  $("#app").innerHTML = `<div class="app"><div class="top"><div class="ttl"><b>Shelf</b><span class="small muted">Feather and Archie, side by side</span></div><button class="setsbtn" id="hist" style="border-color:var(--line2);color:var(--text)">history</button>${syncPill()}</div>
    <main class="main">
      ${newer.length ? `<div class="k">Newer in Archie</div>${newer.map(row).join("")}` : ""}
      <div class="k">On this phone</div>${here.map(row).join("") || `<div class="small muted">Nothing here yet.</div>`}
      ${onlyA.length ? `<div class="k">Only in Archie</div>${onlyA.map((a) => `<div class="setrow dash"><div class="setpick"><span class="k" style="letter-spacing:.12em">Flashcards</span><span class="serif">${esc(a.name)}</span><span class="small muted">${a.n} cards · on your PC</span></div>
        ${pend[dkey(a.name)] ? `<span class="small muted"><i>waiting…</i></span>` : `<button class="setb go" data-req="${esc(a.name)}">request</button>`}</div>`).join("")}` : ""}
      ${examsShelf(pend)}
      ${notesShelf()}
      ${filesShelf()}
      <div class="small muted" style="line-height:1.6">Share a file from any app (Share › Feather) to send it to Archie or Reading. Books from your PC's notes folder arrive in Read by themselves. Moves happen at the next sync with your PC.</div>
    </main>${tabs("shelf")}</div>`;
  bindExamsShelf();
  bindNotesShelf();
  $("#hist").onclick = historySheet;
  document.querySelectorAll("[data-send]").forEach((b) => (b.onclick = () => moveSheet("f2a", b.dataset.send, !!arch[dkey(b.dataset.send)])));
  document.querySelectorAll("[data-get]").forEach((b) => (b.onclick = () => moveSheet("a2f", b.dataset.get, true)));
  document.querySelectorAll("[data-req]").forEach((b) => (b.onclick = () => shelfQueue("a2f", b.dataset.req)));
}
// ---- mock exams from Archie: kept in the store's "xexams" in Archie's own format, taken here offline ----
function examsShelf() {
  const X = S.xexams || {}, AX = S.archieexams || {};
  const xp = {}; Object.values(S.cardq || {}).forEach((r) => { if (r.kind === "exam") xp[r.eid] = r.op; });
  const best = (ex) => { const b = Math.max(-1, ...(ex.attempts || []).map((a) => a.score || 0)); return b < 0 ? "not taken yet" : "best " + b + "%"; };
  const mine = Object.entries(X).sort((a, b) => (a[1].title || "").localeCompare(b[1].title || ""));
  const only = Object.entries(AX).filter(([id]) => !X[id]);
  const st = (id) => { const a = AX[id];
    if (xp[id]) return `<span class="muted"><i>waiting for your PC…</i></span>`;
    if (!a || !a.linked) return `<span class="muted">only here</span>`;
    if (a.anewer) return `<span style="color:var(--lime)">Archie has a newer version</span>`;
    return `<span style="color:var(--limetext)">in Archie${a.fnewer ? " · new attempts here" : ""}</span>`; };
  if (!mine.length && !only.length) return "";
  return `<div class="k">Mock exams</div>${mine.map(([id, ex]) => `<div class="setrow"><div class="setpick"><span class="k" style="letter-spacing:.12em">Mock exam</span><span class="serif">${esc(ex.title || id)}</span><span class="small">${(ex.questions || []).length} questions · ${best(ex)} · ${st(id)}</span></div>
      <a class="setb go" href="#exam/${encodeURIComponent(id)}" style="display:flex;align-items:center">take</a>${xp[id] ? "" : `${AX[id] ? `<button class="setb${AX[id].anewer ? " go" : ""}" data-xget="${esc(id)}">get</button>` : ""}<button class="setb" data-xsend="${esc(id)}">send</button>`}</div>`).join("")}
    ${only.map(([id, a]) => `<div class="setrow dash"><div class="setpick"><span class="k" style="letter-spacing:.12em">Mock exam · only in Archie</span><span class="serif">${esc(a.title)}</span><span class="small muted">${a.n} questions${a.best != null ? " · best " + a.best + "%" : ""}</span></div>
      ${xp[id] ? `<span class="small muted"><i>waiting…</i></span>` : `<button class="setb go" data-xreq="${esc(id)}">request</button>`}</div>`).join("")}`;
}
function bindExamsShelf() {
  const X = S.xexams || {}, AX = S.archieexams || {}, title = (id) => (X[id] || AX[id] || {}).title || id;
  document.querySelectorAll("[data-xsend]").forEach((b) => (b.onclick = () => moveSheet("f2a", title(b.dataset.xsend), !!AX[b.dataset.xsend], { eid: b.dataset.xsend })));
  document.querySelectorAll("[data-xget]").forEach((b) => (b.onclick = () => moveSheet("a2f", title(b.dataset.xget), true, { eid: b.dataset.xget })));
  document.querySelectorAll("[data-xreq]").forEach((b) => (b.onclick = () => shelfQueue("a2f", title(b.dataset.xreq), { kind: "exam", eid: b.dataset.xreq })));
}
const EXS = {};  // answers in progress, per exam, kept while you move around the app
function vExamX(id) {
  id = decodeURIComponent(id || "");
  const ex = (S.xexams || {})[id];
  if (!ex) { location.hash = "#shelf"; return; }
  const qs = ex.questions || [];
  const E = EXS[id] = EXS[id] || { ans: {}, marks: {}, done: false, start: Date.now() };
  const pts = (q) => +q.points || 1;
  const auto = (q, i) => (q.type === "mc" || q.type === "tf") ? (E.ans[i] !== undefined && E.ans[i] === q.answer ? pts(q) : 0) : null;
  const got = () => qs.reduce((t, q, i) => t + (auto(q, i) ?? (E.marks[i] ?? 0) * pts(q)), 0), of = qs.reduce((t, q) => t + pts(q), 0);
  const unmarked = () => qs.filter((q, i) => auto(q, i) === null && E.marks[i] === undefined).length;
  const qhtml = (q, i) => {
    const a = E.ans[i];
    let body = "";
    if (q.type === "mc") body = (q.options || []).map((o, k) => { const on = a === k, right = E.done && k === q.answer, wrong = E.done && on && k !== q.answer;
      return `<button class="xo${on ? " on" : ""}${right ? " right" : ""}${wrong ? " wrong" : ""}" data-q="${i}" data-v="${k}" ${E.done ? "disabled" : ""}>${esc(o)}</button>`; }).join("");
    else if (q.type === "tf") body = [true, false].map((v) => { const on = a === v, right = E.done && v === q.answer, wrong = E.done && on && v !== q.answer;
      return `<button class="xo half${on ? " on" : ""}${right ? " right" : ""}${wrong ? " wrong" : ""}" data-q="${i}" data-tf="${v}" ${E.done ? "disabled" : ""}>${v ? "True" : "False"}</button>`; }).join("");
    else body = `<textarea class="xa" data-q="${i}" rows="${q.type === "long" ? 6 : 3}" ${E.done ? "readonly" : ""} placeholder="your answer">${esc(a || "")}</textarea>`;
    let after = "";
    if (E.done) {
      if (q.type === "mc" || q.type === "tf") after = q.explain ? `<div class="small muted">${esc(q.explain)}</div>` : "";
      else after = `<div class="xmodel"><div class="k" style="color:var(--lime)">Model answer</div><div>${esc(String(q.answer || ""))}</div>${(q.rubric || []).length ? `<div class="small muted" style="margin-top:6px">Should cover: ${q.rubric.map(esc).join(" · ")}</div>` : ""}${q.explain ? `<div class="small muted">${esc(q.explain)}</div>` : ""}</div>
        <div class="xmark">${[["got it", 1], ["partly", 0.5], ["missed it", 0]].map(([l, v]) => `<button class="setb${E.marks[i] === v ? " armed" : ""}" data-mark="${i}" data-mv="${v}">${l}</button>`).join("")}</div>`;
    }
    return `<section class="card xq"><div class="k">Question ${i + 1} · ${pts(q)} pt${pts(q) === 1 ? "" : "s"}</div><div class="serif" style="font-size:18px;color:var(--hi);line-height:1.35">${esc(q.q)}</div>${body}${after}</section>`;
  };
  const pct = of ? Math.round(100 * got() / of) : 0;
  $("#app").innerHTML = `<div class="app"><div class="top"><a class="icon" href="#shelf" aria-label="Back">←</a><div class="ttl"><b>${esc(ex.title || "Mock exam")}</b><span class="small muted">${qs.length} questions${ex.minutes ? " · " + ex.minutes + " min" : ""}${E.done ? ` · ${pct}%${unmarked() ? " so far" : ""}` : ""}</span></div></div>
    <main class="main">${E.done ? `<div class="card lime"><div class="big">${pct}%</div><div class="small" style="color:var(--limetext)">${Math.round(got() * 10) / 10} of ${of} points${unmarked() ? ` · mark your ${unmarked()} written answer${unmarked() === 1 ? "" : "s"} below against the model answer` : ""}</div></div>` : ""}
      ${qs.map(qhtml).join("")}
      ${E.done ? `<button class="btn go" id="xsave" ${unmarked() ? "disabled" : ""}>Save this attempt</button><button class="btn" id="xagain">Start over</button>` : `<button class="btn go" id="xdone">Hand it in</button>`}
      <div class="small muted" style="line-height:1.6">Multiple choice and true/false mark themselves. Written answers: compare with the model answer and mark them yourself (works with no signal). Send the exam to Archie from the Shelf to keep your scores there too.</div>
    </main></div>`;
  const keep = () => vExamX(encodeURIComponent(id));
  document.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => { E.ans[+b.dataset.q] = +b.dataset.v; keep(); }));
  document.querySelectorAll("[data-tf]").forEach((b) => (b.onclick = () => { E.ans[+b.dataset.q] = b.dataset.tf === "true"; keep(); }));
  document.querySelectorAll(".xa").forEach((t) => (t.oninput = () => (E.ans[+t.dataset.q] = t.value)));
  document.querySelectorAll("[data-mark]").forEach((b) => (b.onclick = () => { E.marks[+b.dataset.mark] = +b.dataset.mv; const y = scrollY; keep(); scrollTo(0, y); }));
  if ($("#xdone")) $("#xdone").onclick = () => { const left = qs.filter((q, i) => E.ans[i] === undefined || E.ans[i] === "").length;
    if (left && !E.sure) { E.sure = true; $("#xdone").textContent = `${left} unanswered · hand it in anyway`; return; }
    E.done = true; E.mins = Math.round((Date.now() - E.start) / 6000) / 10; scrollTo(0, 0); keep(); };
  if ($("#xagain")) $("#xagain").onclick = () => { delete EXS[id]; keep(); };
  if ($("#xsave")) $("#xsave").onclick = () => {
    const d = new Date(), date = d.toISOString().slice(0, 10) + "T" + d.toTimeString().slice(0, 5);
    (ex.attempts = ex.attempts || []).push({ date, score: pct, points: Math.round(got() * 10) / 10, of, minutes: E.mins, device: "phone" });
    changed(); delete EXS[id]; toast(`Saved · ${pct}%`); location.hash = "#shelf";
  };
}
// ---- files shared into Feather (Android share menu): to Archie (an inbox card on your PC) or to Reading on every device ----
const READABLE = /\.(pdf|epub|txt)$/i;
const fsize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
async function vShare() {
  const list = (await DB.get("shared")) || [];
  const it = list[0];
  if (!it) { location.hash = "#shelf"; return; }
  const files = it.files || [], words = [it.title, it.text, it.url].filter(Boolean).join("\n").trim();
  const canRead = files.length && files.every((f) => READABLE.test(f.name));
  let dest = files.length ? (canRead ? "reading" : "archie") : "note";
  const opt = (k, label, sub, ok = true) => `<button class="setrow mopt${dest === k ? " on" : ""}" data-d="${k}" ${ok ? "" : "disabled style=\"opacity:.45\""}><span class="setpick"><span style="color:var(--hi)">${label}</span><span class="small muted">${sub}</span></span></button>`;
  const draw = () => {
    $("#app").innerHTML = `<div class="app"><div class="top"><div class="ttl"><b>Save to Feather</b><span class="small muted">shared from another app${list.length > 1 ? ` · ${list.length - 1} more after this` : ""}</span></div></div>
      <main class="main">
        ${files.map((f) => `<div class="card" style="display:flex;gap:12px;align-items:center"><span class="cover" style="display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--lime)">${esc((f.name.split(".").pop() || "file").toUpperCase().slice(0, 4))}</span><span style="min-width:0"><span class="serif" style="display:block;font-size:17px;color:var(--hi);overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</span><span class="small muted">${fsize(f.size)}</span></span></div>`).join("")}
        ${words ? `<div class="card small" style="line-height:1.6;color:var(--text);white-space:pre-wrap;overflow-wrap:anywhere">${esc(words.slice(0, 600))}</div>` : ""}
        <div class="k">Put it</div>
        ${files.length ? opt("reading", "In Reading, on every device", canRead ? "your PC adds it with your books (PDF, EPUB, text)" : "only PDFs, EPUBs and text books can go in Reading", canRead) + opt("archie", "To Archie on your PC", "it shows up as an inbox card there: file it under a class, or ask Archie about it") : ""}
        ${words ? opt("note", "As a quick note", "saved to Feather on every device") : ""}
        <button class="btn go" id="sv">Save</button><button class="btn" id="sk">${list.length > 1 ? "Skip this one" : "Cancel"}</button>
        <div class="small muted" style="line-height:1.6">Files stay encrypted on this phone until your PC has them, then they're removed from here. They go at the next sync.</div>
      </main></div>`;
    document.querySelectorAll(".mopt").forEach((b) => (b.onclick = () => { if (!b.disabled) { dest = b.dataset.d; draw(); } }));
    const next = async () => { const l = (await DB.get("shared")) || []; l.shift(); await DB.put("shared", l); l.length ? vShare() : (location.hash = "#shelf"); };
    $("#sk").onclick = next;
    $("#sv").onclick = async () => {
      $("#sv").disabled = true; $("#sv").innerHTML = `<span class="spin"></span>`;
      if (dest === "note" || (!files.length && words)) {
        const id = newId(); (S.jots = S.jots || {})[id] = { id, t: now(), text: words, link: it.url || "", edited: now() }; changed();
        toast("Saved as a quick note");
      }
      if (files.length && dest !== "note") {
        M.drops = M.drops || [];
        for (const f of files) {
          const id = newId(), bytes = new Uint8Array(await f.blob.arrayBuffer());
          await DB.put("drop:" + id, await FC.seal(K, bytes, "feather-drop"), "files");
          M.drops.unshift({ id, name: f.name, size: f.size, dest, t: now(), state: "waiting" });
        }
        M.drops = M.drops.slice(0, 40); await saveMeta();
        toast(dest === "reading" ? "Going to Reading · at the next sync" : "Going to Archie · at the next sync");
        sendDrops();
      }
      await next();
    };
  };
  draw();
}
let dropping = false;
async function sendDrops() {  // pieces of 1.5 MB, resumable; a file leaves this phone once your PC has it whole
  if (dropping || !S || !K) return;
  dropping = true;
  try {
    for (const d of (M.drops || []).filter((x) => x.state === "waiting" || x.state === "sending" || x.state === "failed")) {
      const sealed = await DB.get("drop:" + d.id, "files");
      if (!sealed) { d.state = "gone"; continue; }
      const bytes = await FC.open(K, sealed, "feather-drop"), fh = await FC.sha(bytes), CH = 1536 * 1024;
      d.state = "sending"; let off = 0, tries = 0;
      while (off < bytes.length || bytes.length === 0) {
        const r = await call({ act: "drop", id: d.id, fname: d.name, dest: d.dest, off, total: bytes.length, fh, data: FC.b64(bytes.subarray(off, off + CH)) });
        if (r.why === "start again" && tries++ < 3) { off = r.have || 0; continue; }
        if (r.why) throw new Error(r.why);
        if (r.done) { d.state = "sent"; d.to = r.to; d.saved = r.saved; await DB.del("drop:" + d.id, "files"); break; }
        off = r.have || off + CH;
      }
      await saveMeta();
      toast(d.to === "reading" ? `“${d.name}” is on your PC · it shows in Reading after the next sync` : `“${d.name}” is on your PC · Archie has an inbox card for it`);
    }
  } catch (e) {
    (M.drops || []).forEach((d) => { if (d.state === "sending") { d.state = "failed"; d.err = e.message || String(e); } });
    await saveMeta();
  } finally { dropping = false; if (V.view === "shelf") render(); }
}
// ---- phase 4: your reading notes and quick notes, sent to Archie as a note (an inbox card there: file it, or ask about it) ----
async function dropText(name, text) {
  const id = newId(), bytes = FC.te.encode(text);
  await DB.put("drop:" + id, await FC.seal(K, bytes, "feather-drop"), "files");
  (M.drops = M.drops || []).unshift({ id, name, size: bytes.length, dest: "archie", t: now(), state: "waiting" });
  M.drops = M.drops.slice(0, 40); await saveMeta();
  toast(`“${name}” going to Archie · at the next sync`); sendDrops(); if (V.view === "shelf") render();
}
function bookMd(rid) {
  const r = (S.readings || {})[rid] || {}, bk = Object.values(S.books || {}).find((x) => x.digital === rid) || {};
  const pos = (S.readpos || {})[rid], L = [`# ${bk.title || r.name || "Book"} · my notes`, ""];
  if (bk.author || r.author) L.push(`by ${bk.author || r.author}`);
  if (pos) L.push(`Reading place: ${r.kind === "pdf" ? "page" : "chapter"} ${pos.ch + 1}`);
  const pins = ((S.pins || {})[rid] || []).filter((x) => x.k !== "bm" && (x.text || x.note));
  if (pins.length) { L.push("", "## Notes and highlights"); pins.sort((a, b) => a.ch - b.ch || a.p - b.p).forEach((x) => L.push(`- ch. ${x.ch + 1}: ${String(x.text || x.note).replace(/\n/g, " ")}`)); }
  const q = (bk.quotes || []).filter((x) => x && x.text);
  if (q.length) { L.push("", "## Quotes"); q.forEach((x) => L.push(`> ${x.text}${x.page ? ` (p. ${x.page})` : ""}`, "")); }
  for (const [t, c] of Object.entries(bk.chapters || {})) {
    const bits = [typeof c.notes === "string" && c.notes.trim() ? c.notes.trim() : "", (c.people || []).length ? "People: " + c.people.map((p) => (typeof p === "string" ? p : p.name)).filter(Boolean).join(", ") : ""].filter(Boolean);
    if (bits.length) L.push("", `## ${t}`, ...bits);
  }
  const marks = ((S.pins || {})[rid] || []).filter((x) => x.k === "bm").length;
  if (marks) L.push("", `${marks} bookmark${marks === 1 ? "" : "s"}`);
  return { md: L.join("\n"), n: pins.length + q.length, title: bk.title || r.name || "Book" };
}
function notesShelf() {
  const books = Object.keys(S.readings || {}).map((rid) => ({ rid, ...bookMd(rid) })).filter((b) => b.n);
  const jots = Object.values(S.jots || {}).sort((a, b) => b.t - a.t).slice(0, 6);
  if (!books.length && !jots.length) return "";
  return `<div class="k">Notes</div>
    ${books.map((b) => `<div class="setrow"><div class="setpick"><span class="k" style="letter-spacing:.12em">Book notes</span><span class="serif">${esc(b.title)}</span><span class="small muted">${b.n} note${b.n === 1 ? "" : "s"} and highlights · Archie gets them as one note</span></div><button class="setb go" data-bn="${esc(b.rid)}">send to Archie</button></div>`).join("")}
    ${jots.map((j) => `<div class="setrow"><div class="setpick"><span class="k" style="letter-spacing:.12em">Quick note</span><span style="color:var(--hi);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((j.text || "").split("\n")[0])}</span><span class="small muted">${ago(j.t)}</span></div><button class="setb" data-jn="${esc(j.id)}">send to Archie</button></div>`).join("")}`;
}
function bindNotesShelf() {
  document.querySelectorAll("[data-bn]").forEach((b) => (b.onclick = () => { const x = bookMd(b.dataset.bn); dropText(x.title.replace(/[\\/:*?"<>|]/g, "") + " - my notes.md", x.md); }));
  document.querySelectorAll("[data-jn]").forEach((b) => (b.onclick = () => { const j = S.jots[b.dataset.jn]; const first = (j.text || "note").split("\n")[0].replace(/[\\/:*?"<>|]/g, "").slice(0, 60) || "note";
    dropText(first + ".md", (j.text || "") + (j.link ? "\n\n" + j.link : "")); }));
}
function filesShelf() {
  const D = (M.drops || []).slice(0, 12);
  if (!D.length) return "";
  const st = (d) => d.state === "sent" ? `<span style="color:var(--limetext)">on your PC · ${d.to === "reading" ? "in Reading" : "Archie's inbox"}</span>`
    : d.state === "failed" ? `<span style="color:var(--bad)">didn't go: ${esc(d.err || "")} · tries again at the next sync</span>`
    : d.state === "gone" ? `<span class="muted">gone</span>` : `<span class="muted"><i>waiting for your PC…</i></span>`;
  return `<div class="k">Files you shared</div>${D.map((d) => `<div class="setrow"><div class="setpick"><span class="k" style="letter-spacing:.12em">File · to ${d.dest === "reading" ? "Reading" : "Archie"}</span><span class="serif">${esc(d.name)}</span><span class="small">${fsize(d.size || 0)} · ${st(d)}</span></div></div>`).join("")}`;
}
// ---- Ask Archie: the bubble on every screen; your PC answers. Questions wait here when it isn't reachable ----
const askList = () => Object.values(S.ask || {}).sort((a, b) => a.t - b.t);
const askUnseen = () => askList().filter((m) => m.a && !m.seen).length;
function askBubble() {
  const n = S ? askUnseen() : 0;
  return `<button class="askb" id="askb" aria-label="Ask Archie${n ? `, ${n} new answer${n === 1 ? "" : "s"}` : ""}"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"></path><path d="M8 10h8"></path><path d="M8 13h5"></path></svg>${n ? `<i>${n}</i>` : ""}</button>`;
}
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("#askb"); if (b && S) { e.preventDefault(); askSheet(); } });
function askCtx() {  // what you're reading, so "why is he teasing her?" makes sense
  const lr = lastReading(); if (!lr) return "";
  const ch = lr.pos.ch + 1;
  return `I'm reading ${lr.r.name}${lr.r.author ? " by " + lr.r.author : ""}, ${lr.r.kind === "pdf" ? "page" : "chapter"} ${ch}`;
}
let askBusy = false;
async function askPending() {  // send waiting questions, one at a time (Archie thinks on your PC)
  if (askBusy || !S || !K) return;
  const wait = askList().filter((m) => !m.a && !m.err);
  if (!wait.length) return;
  askBusy = true;
  try {
    for (const m of wait) {
      const hist = askList().filter((x) => x.a && x.t < m.t).slice(-3).flatMap((x) => [{ role: "user", text: x.q }, { role: "archie", text: x.a }]);
      m.state = "thinking"; paintAsk();
      let r;
      try { r = await callLong({ act: "ask", q: m.q, ctx: m.ctx || "", history: hist }); }
      catch (e) { m.state = "waiting"; paintAsk(); break; }  // no PC right now: it waits
      if (r.why) { m.err = r.why; m.state = "error"; } else { m.a = r.answer || "(no answer)"; m.state = "done"; m.at = now(); m.seen = !!document.querySelector(".asks"); }
      changed(); paintAsk();
    }
  } finally { askBusy = false; }
}
async function callLong(inner) {  // like call(), but Archie may think for a while
  const out = await post({ op: "feather", sid: M.sid, box: await FC.box(K, { ...inner, host: M.host, name: M.name, kind: "phone" }) }, 200000);
  if (!out.ok) throw new Error(out.why || "no PC");
  return FC.unbox(K, out.box);
}
function paintAsk() {
  const b = $("#askb"); if (b) b.outerHTML = askBubble();
  const box = document.querySelector(".asks .askmsgs"); if (box) { box.innerHTML = askMsgs(); bindAskMsgs(); box.scrollTop = box.scrollHeight; }
  const st = document.querySelector(".asks .askst"); if (st) st.innerHTML = askState();
}
const askState = () => V.sync.state === "ok" ? `<span style="color:var(--lime)">●</span> your PC is answering` : `● your PC isn't reachable · questions wait here`;
function askMsgs() {
  const L = askList().slice(-30);
  if (!L.length) return `<div class="small muted" style="line-height:1.6">Ask Archie anything. ${askCtx() ? "It knows what you're reading." : ""} Your PC answers, so it works when Feather can reach your PC; otherwise your question waits here.</div>`;
  return L.map((m) => `<div class="askq">${esc(m.q)}</div>${m.a ? `<div class="aska">${esc(m.a)}</div>
      <div class="askacts"><button class="setb" data-an="${m.id}">save as a quick note</button><button class="setb" data-ac="${m.id}">make a flashcard</button></div>`
    : `<div class="small muted" style="align-self:flex-end;font-style:italic">${m.err ? "couldn't answer: " + esc(m.err) : m.state === "thinking" ? "Archie is thinking…" : "waiting · goes to your PC when it's back"}</div>`}`).join("");
}
function bindAskMsgs() {
  document.querySelectorAll("[data-an]").forEach((b) => (b.onclick = () => { const m = S.ask[b.dataset.an]; const id = newId();
    (S.jots = S.jots || {})[id] = { id, t: now(), text: m.q + "\n\n" + m.a, link: "", edited: now() }; changed(); b.textContent = "saved ✓"; b.disabled = true; }));
  document.querySelectorAll("[data-ac]").forEach((b) => (b.onclick = () => { const m = S.ask[b.dataset.ac]; const id = newId();
    (S.cards = S.cards || {})[id] = { id, front: m.q.slice(0, 2000), back: m.a.slice(0, 4000), deck: "Asked Archie", due: now(), interval: 0, ease: 2.5, reps: 0, t: now() };
    changed(); b.textContent = "flashcard made ✓"; b.disabled = true; }));
}
function askSheet() {
  askList().forEach((m) => { if (m.a && !m.seen) { m.seen = true; } });
  if (askUnseen() === 0) changed();
  const ctx = askCtx();
  const bg = sheet(`<div class="asks"><div style="display:flex;align-items:center;gap:10px"><b style="letter-spacing:.2em;color:var(--hi)">ARCHIE</b><span class="small askst">${askState()}</span>
      <button class="icon" id="askx" aria-label="Close" style="margin-left:auto;border:0">✕</button></div>
    ${ctx ? `<div class="small muted">reading: <span style="color:var(--hi)">${esc(ctx.replace(/^I'm reading /, ""))}</span> · Archie knows where you are</div>` : ""}
    <div class="askmsgs">${askMsgs()}</div>
    <form id="askf" style="display:flex;gap:8px"><label for="askq" class="sr">Ask Archie</label><input id="askq" type="text" autocomplete="off" placeholder="${V.sync.state === "ok" ? "ask Archie…" : "ask anyway, it'll wait…"}">
      ${("webkitSpeechRecognition" in window || "SpeechRecognition" in window) ? `<button type="button" class="icon" id="askmic" aria-label="Talk"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v3"></path></svg></button>` : ""}
      <button class="btn go" style="min-height:46px">ask</button></form></div>`, (bg, close) => {
    $("#askx", bg).onclick = () => { close(); paintAsk(); };
    bindAskMsgs();
    const box = $(".askmsgs", bg); box.scrollTop = box.scrollHeight;
    $("#askf", bg).onsubmit = (e) => { e.preventDefault(); const q = $("#askq", bg).value.trim(); if (!q) return;
      const id = newId(); (S.ask = S.ask || {})[id] = { id, q: q.slice(0, 3000), ctx, t: now(), state: "waiting" };
      const ks = Object.keys(S.ask).sort((a, b) => S.ask[a].t - S.ask[b].t); for (const k of ks.slice(0, Math.max(0, ks.length - 60))) delete S.ask[k];
      changed(); $("#askq", bg).value = ""; paintAsk(); askPending(); };
    const mic = $("#askmic", bg);
    if (mic) mic.onclick = () => { const R = window.SpeechRecognition || window.webkitSpeechRecognition, r = new R(); r.lang = navigator.language || "en-US";
      mic.classList.add("on"); r.onresult = (e) => { $("#askq", bg).value = e.results[0][0].transcript; }; r.onend = () => mic.classList.remove("on"); r.start(); };
  });
  bg.classList.add("askbg");
  paintAsk();
}
function setsSheet() {
  const sets = {}; Object.values(S.cards || {}).forEach((c) => (sets[deckOf(c)] ||= []).push(c));
  const names = Object.keys(sets).sort((a, b) => a.localeCompare(b));
  const arch = {}; Object.entries(S.archiedecks || {}).forEach(([n, x]) => (arch[dkey(n)] = { ...x, name: n }));
  const pend = {}; Object.values(S.cardq || {}).forEach((r) => (pend[dkey(r.deck)] = r.op));
  const t = now(), dueIn = (cs) => cs.filter((c) => (c.due || 0) <= t).length;
  const when = (x) => (x ? new Date(x * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
  const st = (d) => { const a = arch[dkey(d)];
    if (pend[dkey(d)]) return `<span class="muted"><i>waiting for your PC…</i></span>`;
    if (!a) return `<span class="muted">only in Feather</span>`;
    if (!a.linked) return `<span class="muted">Archie has one with this name</span>`;
    if (a.anewer) return `<span style="color:var(--lime)">Archie has a newer version</span>`;
    return `<span style="color:var(--limetext)">in Archie · sent ${when(a.t)}</span>`; };
  const onlyA = Object.values(arch).filter((a) => !names.some((d) => dkey(d) === dkey(a.name))).sort((a, b) => a.name.localeCompare(b.name));
  const row = (d) => { const a = arch[dkey(d)], n = dueIn(sets[d]);
    return `<div class="setrow${CS.deck === d ? " on" : ""}"><button class="setpick" data-pick="${esc(d)}"><span class="serif">${esc(d)}</span><span class="small">${n ? n + " due · " : ""}${st(d)}</span></button>
      ${a && !pend[dkey(d)] ? `<button class="setb go" data-get="${esc(a.name)}">get</button>` : ""}${pend[dkey(d)] ? "" : `<button class="setb${a ? "" : " go"}" data-send="${esc(d)}">${a ? "send" : "send to Archie"}</button>`}</div>`; };
  sheet(`<h3>Your sets</h3>
    <button class="setrow all${CS.deck ? "" : " on"}" data-pick=""><span class="small">All sets · ${dueCards().length} due</span></button>
    ${names.map(row).join("") || `<div class="small muted">No flashcards here yet.</div>`}
    ${onlyA.length ? `<div class="k" style="margin-top:4px">Only in Archie</div>${onlyA.map((a) => `<div class="setrow dash"><div class="setpick"><span class="serif">${esc(a.name)}</span><span class="small muted">${a.n} cards · on your PC</span></div>
      ${pend[dkey(a.name)] ? `<span class="small muted"><i>waiting…</i></span>` : `<button class="setb go" data-get="${esc(a.name)}">request</button>`}</div>`).join("")}` : ""}
    <div class="small muted" style="line-height:1.6">Send and get replace the other side's copy (the old one is kept as a backup). They happen at the next sync with your PC. Tap a set to study only that one.</div>`, (bg, close) => {
    bg.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => { CS.deck = b.dataset.pick || null; CS.flip = false; close(); vCards(); }));
    const ask = (b, txt, go) => (b.onclick = () => { if (b.dataset.armed) { go(); return; } b.dataset.armed = "1"; const was = b.textContent; b.textContent = txt; b.classList.add("armed"); setTimeout(() => { if (document.body.contains(b)) { delete b.dataset.armed; b.textContent = was; b.classList.remove("armed"); } }, 3500); });
    bg.querySelectorAll("[data-send]").forEach((b) => (b.onclick = () => { close(); moveSheet("f2a", b.dataset.send, !!arch[dkey(b.dataset.send)]); }));
    bg.querySelectorAll("[data-get]").forEach((b) => (b.onclick = () => { close(); if (b.textContent === "request") shelfQueue("a2f", b.dataset.get); else moveSheet("a2f", b.dataset.get, true); }));
  });
}
function vCards() {
  if (CS.deck && !Object.values(S.cards || {}).some((x) => deckOf(x) === CS.deck)) CS.deck = null;
  const due = dueCards().filter((x) => !CS.deck || deckOf(x) === CS.deck), c = due[0];
  const iv = (q) => { if (!c) return ""; if (q === 0) return "10 min"; const reps = (c.reps || 0) + 1, e = c.ease || 2.5; const d = reps === 1 ? 1 : reps === 2 ? 3 : Math.round((c.interval || 1) * e * (q === 3 ? 1.2 : q === 2 ? 1 : 0.8)); return d + (d === 1 ? " day" : " days"); };
  $("#app").innerHTML = `<div class="app"><div class="top"><div class="ttl"><b>Flashcards</b><span class="small muted">${CS.deck ? esc(CS.deck) + " · " : c ? `${esc(c.deck || "")} · ` : ""}${c ? `${due.length} due` : "all caught up"}${CS.done ? ` · ${CS.done} done` : ""}</span></div><button class="setsbtn" id="sets">sets ▾</button>${syncPill()}</div>
    <main class="main">${c ? `<section class="card fc fade" id="fc"><div class="k">Question</div><div class="q">${esc(c.front || "(picture card: open it on a laptop)")}</div>
        ${CS.flip ? `<div style="height:1px;background:var(--line2)"></div><div class="k" style="color:var(--lime)">Answer</div><div class="a">${esc(c.back || "")}</div>` : `<div class="small muted" style="margin-top:auto">tap to show the answer</div>`}</section>
      ${CS.flip ? `<div class="grades">${[["again", 0], ["hard", 1], ["good", 2], ["easy", 3]].map(([l, q]) => `<button class="g${q}" data-q="${q}">${l}<br>${iv(q)}</button>`).join("")}</div>` : ""}`
      : `<div class="card" style="text-align:center;padding:40px 16px"><div class="big">Done for now</div><div class="small muted" style="margin-top:8px">${CS.done ? `${CS.done} reviewed · they count on your laptops too` : "Nothing due. New cards from your laptops show up here."}</div></div>`}</main>${tabs("cards")}</div>`;
  $("#sets").onclick = () => setsSheet();
  if (c) {
    $("#fc").onclick = () => { if (!CS.flip) { CS.flip = true; vCards(); } };
    document.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { grade(S.cards[c.id], +b.dataset.q); if (navigator.vibrate) navigator.vibrate(12); CS.flip = false; CS.done++; vCards(); }));
  }
}

// ---- more: notes, devices, fingerprint, lock ----
function vMore() {
  const jots = Object.values(S.jots || {}).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 8);
  const ago = (t) => { if (!t) return "never"; const s = Date.now() / 1000 - t; return s < 90 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; };
  const devs = (M.devices || []).filter((d) => d.host !== M.host);
  const syncLine = V.sync.state === "ok" ? `caught up ${ago((M.lastOk || 0) / 1000)}` : V.sync.state === "off" ? "offline · changes wait here" : V.sync.state === "bad" ? esc(V.sync.err || "") : "syncing…";
  $("#app").innerHTML = `<div class="app"><div class="top"><div class="ttl"><b>More</b></div>${syncPill()}</div><main class="main">
    <button class="btn go" id="qn">+ Quick note</button>
    ${jots.length ? `<div class="card list">${jots.map((j) => `<button class="li" data-j="${j.id}"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(j.text.split("\n")[0])}</span><span class="small muted" style="flex:none">${ago(j.t)}</span></button>`).join("")}</div>` : ""}
    <section class="card lime"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="k" style="color:var(--lime)">Devices &amp; sync</span><span class="small" style="color:var(--limetext)">${syncLine}</span></div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px 12px;margin-top:10px;font-size:13px"><span style="color:var(--hi)">This phone</span><span style="color:var(--lime)">${V.sync.state === "ok" ? "● in sync" : "●"}</span>
        ${devs.map((d) => `<span>${esc(d.kind === "stick" ? "Feather stick" : d.name)}</span><span class="muted">${ago(d.seen)}</span>`).join("")}
        <span>Your PC (hub)</span><span class="muted">${V.sync.state === "ok" ? "reachable" : "not right now"}</span></div>
      <div class="small" style="color:var(--limetext);margin-top:10px;line-height:1.6">Through your PC, at home or on Tailscale. Offline changes wait here.</div>
      <button class="btn" id="sn" style="margin-top:10px">Sync now</button></section>
    <div class="card list"><button class="li" id="fpt"><span>Fingerprint unlock</span><span class="muted">${M.fp ? "on" : "turn on →"}</span></button>
      <button class="li" id="nm"><span>This phone's name</span><span class="muted">${esc(M.name)}</span></button></div>
    <button class="btn danger" id="lk">Lock Feather now</button>
    <div class="small muted" style="text-align:center">locks itself after 5 minutes away</div></main>${tabs("more")}</div>`;
  $("#qn").onclick = () => noteSheet();
  document.querySelectorAll("[data-j]").forEach((b) => (b.onclick = () => { const j = S.jots[b.dataset.j]; sheet(`<h3>Quick note</h3><textarea id="je" rows="6">${esc(j.text)}</textarea><div style="display:flex;gap:8px;justify-content:space-between"><button class="btn danger" id="jd">Delete</button><button class="btn go" id="js">Save</button></div>`,
    (bg, close) => { $("#jd", bg).onclick = () => { delete S.jots[j.id]; changed(); close(); render(); }; $("#js", bg).onclick = () => { j.text = $("#je", bg).value.trim() || j.text; j.edited = now(); changed(); close(); render(); }; }); }));
  $("#sn").onclick = async () => { await syncNow(); toast(V.sync.state === "ok" ? "In sync" : V.sync.err || "Couldn't reach your PC"); render(); };
  $("#lk").onclick = lock;
  $("#nm").onclick = () => sheet(`<h3>This phone's name</h3><input type="text" id="pn" maxlength="30" value="${esc(M.name)}"><button class="btn go" id="pns">Save</button>`, (bg, close) => { $("#pns", bg).onclick = () => { M.name = $("#pn", bg).value.trim() || M.name; saveMeta(); close(); kick(0); render(); }; });
  $("#fpt").onclick = async () => {
    if (M.fp) { delete M.fp; await saveMeta(); toast("Fingerprint unlock off"); return render(); }
    try { await fingerprintOn(); toast("Fingerprint unlock on"); } catch (e) { toast(e.message || "Fingerprint unlock didn't turn on", 5000); }
    render();
  };
}

// ---------- routing ----------
function route() { render(); }
async function render() {
  if (!S) { if (!M.sid) { vLock(); return; } return vLock(); }
  const h = (location.hash || "#home").slice(1), [v, a, b] = h.split("/");
  if (v !== "book") stopSpeech();
  if (v === "continue") { const lr = lastReading(); location.hash = lr ? "#book/" + lr.rid : "#read"; return; }
  if (v === "note") { location.hash = "#home"; setTimeout(() => noteSheet(), 100); return; }
  V.view = v || "home";
  if (V.view !== "home") V.syncOpen = false;
  if (v === "read") return vRead();
  if (v === "book") return vBook(a, b === "listen");
  if (v === "cards") return vCards();
  if (v === "shelf") return vShelf();
  if (v === "exam") return vExamX(a);
  if (v === "share") return vShare();
  if (v === "more") return vMore();
  return vHome();
}
window.addEventListener("hashchange", render);

(async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/feather/sw.js", { scope: "/feather/" }).catch(() => {});
  M = (await DB.get("meta")) || {};
  if (!M.host) { M.host = "phone-" + newId(); M.name = "Phone"; await saveMeta(); }
  render();
  if (speechSynthesis && speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = () => {};
})();
