// Feather: the app window.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const root = $("#root");
let S = { model: "off" };

async function api(path, body) {
  let r;
  try { r = await fetch("/api/" + path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch (e) { throw new Error("Feather stopped running. Close this window and start it again from the stick."); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { location.hash = "#/unlock"; throw new Error("locked"); }
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j;
}
function toast(t) { const el = $("#toast"); el.textContent = t; el.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => (el.style.display = "none"), 2600); }
const ping = () => fetch("/api/ping", { method: "POST" }).catch(() => {});
ping();
window.addEventListener("pagehide", () => navigator.sendBeacon("/api/bye"));
document.addEventListener("visibilitychange", () => { if (!document.hidden) ping(); });
setInterval(() => fetch("/api/ping", { method: "POST" }).then((r) => r.json()).then((j) => { if (j.locked && !document.querySelector("#lockroot")) location.hash = "#/unlock"; if (j.model && j.model !== S.model) { S.model = j.model; const m = $("#mdl"); if (m) m.textContent = j.model; const d = $("#mdot"); if (d) d.classList.toggle("on", j.model === "ready"); } }).catch(() => {}), 15000);

const FEATHER = (s, c = "#c6f432") => `<img src="icon.svg" width="${s}" height="${s}" alt="">`;
// engraved empty-state drawings: grey linework, hatched shading, one accent detail
const ENG = {
  book: { s: ["M8 18 C18 14 26 15 32 20 V52 C26 47 18 46 8 50 Z", "M56 18 C46 14 38 15 32 20 V52 C38 47 46 46 56 50 Z"], d: ["M13 26 C19 24 24 25 28 27", "M13 33 C19 31 24 32 28 34", "M36 27 C40 25 45 24 51 26", "M36 34 C40 32 45 31 51 33"], h: "M10 46 L16 40 M10 50 L20 40 M14 50 L24 40", a: "M44 12 V28 L47 25 L50 28 V12" },
  cal: { s: ["M10 16 H54 V54 H10 Z"], d: ["M10 26 H54", "M20 10 V20", "M44 10 V20", "M18 34 H22", "M28 34 H32", "M38 34 H42", "M18 44 H22", "M28 44 H32"], h: "M12 52 L20 44 M12 48 L16 44 M20 52 L28 44", a: "M33 44 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0" },
  globe: { s: ["M12 34 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0"], d: ["M12 34 H52", "M32 14 C23 22 23 46 32 54", "M32 14 C41 22 41 46 32 54", "M15 24 H49", "M15 44 H49"], h: "M18 46 L24 52 M14 40 L24 50 M14 34 L26 46", a: "M50 6 L52 11 L57 12 L53 15 L54 20 L50 17 L46 20 L47 15 L43 12 L48 11 Z", f: 1 },
  doc: { s: ["M16 8 H38 L50 20 V56 H16 Z"], d: ["M38 8 V20 H50", "M22 30 H44", "M22 37 H44", "M22 44 H36"], h: "M18 54 L24 48 M18 50 L22 46 M24 54 L30 48", a: "M40 46 L44 50 L52 40" },
  cards: { s: ["M12 18 H40 V52 H12 Z", "M22 12 H52 V48 H22 Z"], r: [-8, 6], d: [], h: "M14 48 L20 42 M14 44 L18 40", a: "M29 30 L35 36 L45 24" },
};
const ENGRAVE = (k, size = 72) => { const e = ENG[k];
  return `<svg class="eng" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${e.s.map((d, i) => `<path d="${d}" class="es"${e.r ? ` transform="rotate(${e.r[i]} 32 32)"` : ""}/>`).join("")}${e.d.map((d) => `<path d="${d}" class="ed"/>`).join("")}<path d="${e.h}" class="eh"/><path d="${e.a}" class="ea${e.f ? " ef" : ""}"/></svg>`; };
const EMPTY = (k, title, line, act = "") => `<div class="empty">${ENGRAVE(k)}<div class="col" style="gap:5px;min-width:0"><div class="serif" style="font-size:22px;line-height:1.2">${title}</div><div class="muted small" style="line-height:1.5">${line}</div>${act}</div></div>`;
const IC = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  ask: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z"/>',
  vault: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-1 3 15.5-3.5 1z"/>',
  world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  reading: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>',
  docs: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  study: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  exam: '<path d="M9 4h6v3H9zM6 5H5v16h14V5h-1"/><path d="M8 12l2.5 2.5L16 9"/>',
  cards: '<rect x="3" y="7" width="14" height="12" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v10"/>',
  teach: '<path d="M3 20l4-1 11-11-3-3L4 16z"/><path d="M13 7l3 3"/>',
  math: '<path d="M5 5h14M5 12h6M5 19h6M14 14l5 5M19 14l-5 5"/>',
  paper: '<path d="M3 21l3.5-1 12-12-2.5-2.5-12 12z"/><path d="M14.5 5.5l2.5 2.5"/>',
  mastery: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5" opacity=".5"/><rect x="3" y="14" width="7" height="7" rx="1.5" opacity=".5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  eject: '<path d="M12 4l8 9H4zM4 18h16"/>',
};
const icon = (k, s = 17) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ""}</svg>`;
const NAV = [["home", "Home"], ["ask", "Ask Archie"], ["-", "Library"], ["vault", "Vault"], ["world", "World"], ["reading", "Reading"], ["docs", "Documents"], ["paper", "Paper"],
  ["-", "Study"], ["study", "Study session"], ["exam", "Mock exams"], ["cards", "Flashcards"], ["teach", "Teach it back"], ["math", "Math"], ["mastery", "Mastery"]];
const WORDMARK = (s = 40) => `<span class="wordmark" style="font-size:${s}px">Feather</span>`;
// lock -> home: the quill and wordmark fly from the lock screen into the menu's corner (FLIP)
function glideStart() {
  const q = $("#lockroot .nib"), w = $("#lockroot .word");
  if (calm() || !q || !w) return (location.hash = "#/home");
  const qr = q.getBoundingClientRect(), wr = w.getBoundingClientRect();
  const fly = document.createElement("div"); fly.className = "fly";
  fly.innerHTML = `<img src="icon.svg" alt=""><span class="wordmark" style="font-size:150px">Feather</span>`;
  document.body.appendChild(fly);
  const [fi, fw] = fly.children;
  Object.assign(fi.style, { left: qr.left + "px", top: qr.top + "px", width: qr.width + "px", height: qr.height + "px" });
  const sr = fw.getBoundingClientRect();  // line the clone up with the drawn word
  Object.assign(fw.style, { left: (wr.left + wr.width / 2 - sr.width / 2) + "px", top: (wr.top + wr.height / 2 - sr.height / 2) + "px" });
  $("#lockroot").classList.add("leaving");
  S.glide = fly;
  setTimeout(() => (location.hash = "#/home"), 260);
}
function glideLand() {
  const fly = S.glide; S.glide = null;
  const ti = $(".frame .brand img"), tw = $(".frame .brand .wordmark"), [fi, fw] = fly.children;
  const to = (el, t) => { const a = el.getBoundingClientRect(), b = t.getBoundingClientRect(), s = b.height / a.height;
    el.style.transform = `translate(${b.left - a.left}px,${b.top - a.top}px) scale(${s})`; };
  requestAnimationFrame(() => { fly.classList.add("go"); to(fi, ti); to(fw, tw);
    setTimeout(() => { $(".frame")?.classList.remove("enter"); }, 650);
    setTimeout(() => { $(".frame")?.classList.remove("landing"); fly.remove(); }, 1150); });
}
function shell(active, html) {
  const landing = !!S.glide;
  root.innerHTML = `<div class="frame${landing ? " enter landing" : ""}"><div class="app"><nav><div class="brand">${FEATHER(30)}<span class="nl">${WORDMARK(40)}</span></div>
    ${NAV.map(([k, l]) => k === "-" ? `<div class="ng">${l}</div>` : `<a href="#/${k}" class="${k === active ? "on" : ""}" title="${l}">${icon(k)}<span class="nl">${l}</span></a>`).join("")}
    <div class="foot"><a href="#/settings" class="${active === "settings" ? "on" : ""}" title="Settings">${icon("settings")}<span class="nl">Settings</span></a>
      <button class="navc" id="navc" title="${navMini() ? "show the menu names" : "make the menu narrow"} ( [ )" aria-label="${navMini() ? "widen the menu" : "narrow the menu"}">${navMini() ? "»" : "«"}<span class="nl">narrow menu</span></button>
      <button class="eject" id="ej" title="Save, lock and eject the stick">${icon("eject", 14)}<span class="nl">Eject</span></button></div></nav>
    <main id="main">${html}</main></div>
    <footer class="status"><span class="sd"><i class="dot ${S.model === "ready" ? "on" : ""}" id="mdot"></i>model <span id="mdl">${esc(S.model)}</span></span>
      <span>${S.synced ? "synced with your PC " + ago(S.synced) : ""}</span><span>${S.libs ? S.libs + (S.libs === 1 ? " library" : " libraries") + " offline" : ""}</span>${S.demo ? '<span class="demochip">demo · sample data</span>' : ""}<span class="sr">locks after 15 min idle</span></footer></div>`;
  $("#ej").onclick = ejectNow;
  $("#navc").onclick = () => navToggle();
  requestAnimationFrame(() => setTimeout(animateIn, landing ? 700 : 30));
  if (landing) glideLand();
  return $("#main");
}
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// the menu on the left can shrink to icons, so Paper and the reader get the screen ( [ toggles it )
const navMini = () => { try { return localStorage.getItem("feather-nav") === "mini"; } catch (e) { return false; } };
function navToggle(on = !navMini()) {
  try { localStorage.setItem("feather-nav", on ? "mini" : "full"); } catch (e) {}
  document.body.classList.toggle("navmini", on);
  const b = $("#navc"); if (b) { b.firstChild.textContent = on ? "»" : "«"; b.title = (on ? "show the menu names" : "make the menu narrow") + " ( [ )"; }
  window.dispatchEvent(new Event("resize"));
}
document.body.classList.toggle("navmini", navMini());
document.addEventListener("keydown", (e) => { if (e.key === "[" && !e.ctrlKey && !e.metaKey && !e.target.matches("input,textarea,select,[contenteditable]")) navToggle(); });
function animateIn() {
  document.querySelectorAll(".ringfill").forEach((c) => { c.style.transition = calm() ? "none" : "stroke-dasharray 1.2s cubic-bezier(.2,.7,.2,1)"; c.setAttribute("stroke-dasharray", c.dataset.dash); });
  document.querySelectorAll("[data-count]").forEach((el) => {
    const n = +el.dataset.count; if (calm() || !n) { el.textContent = n; return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(n * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
async function ejectNow() {
  await fetch("/api/eject", { method: "POST" }).catch(() => {});
  root.innerHTML = `<div class="center">${FEATHER(72)}<h2>Saved and locked</h2>
    <div class="muted" style="text-align:center;line-height:1.7">Ejecting the stick. Unplug it when Windows says it's safe.<br>You can close this window.</div></div>`;
  setTimeout(() => window.close(), 2500);
}
const when = (t) => t ? new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

// ---------- accent color follows the time of day (blends over 20 min at each change) ----------
const ACC = [[5, "#f2c65f"], [10, "#c6f432"], [17, "#ff9a4d"], [20, "#b8c7e6"]];
function hex2rgb(h) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function accentNow(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes();
  const pts = ACC.map(([h, c]) => [h * 60, c]);
  let cur = pts[pts.length - 1][1], prev = pts[pts.length - 2][1], start = pts[pts.length - 1][0];
  for (let i = 0; i < pts.length; i++) if (m >= pts[i][0]) { cur = pts[i][1]; prev = pts[(i + pts.length - 1) % pts.length][1]; start = pts[i][0]; }
  if (m < pts[0][0]) { cur = pts[pts.length - 1][1]; prev = pts[pts.length - 2][1]; start = pts[pts.length - 1][0] - 1440; }
  const k = Math.min(1, (m - start) / 20);  // 20-minute blend from the previous color
  const a = hex2rgb(prev), b = hex2rgb(cur);
  return "#" + a.map((x, i) => Math.round(x + (b[i] - x) * k).toString(16).padStart(2, "0")).join("");
}
const LATE = { "--bg": ["#0c0d0b", "#090908"], "--card": ["#121410", "#0f100d"], "--cardline": ["#1f231b", "#1d201a"], "--line": ["#262a22", "#1d201a"],
  "--text": ["#e8ecdf", "#d9cfbd"], "--soft": ["#c9d0bf", "#b9b0a0"], "--muted": ["#8e9686", "#6f6a60"] };
const mixHex = (a, b, k) => { const x = hex2rgb(a), y = hex2rgb(b); return "#" + x.map((n, i) => Math.round(n + (y[i] - n) * k).toString(16).padStart(2, "0")).join(""); };
function lateNow(d = new Date()) { const h = d.getHours(); return h >= 23 ? Math.min(1, d.getMinutes() / 20) : h < 5 ? 1 : 0; }
function applyAccent() {
  const r = document.documentElement.style, k = lateNow();
  r.setProperty("--lime", k ? mixHex(accentNow(), "#97a3bd", k) : accentNow());
  r.setProperty("--late", k);
  for (const [p, [a, b]] of Object.entries(LATE)) k ? r.setProperty(p, mixHex(a, b, k)) : r.removeProperty(p);
}
applyAccent(); setInterval(applyAccent, 60000);

// ---------- the banner (Archie's pictures, tinted by the time of day, clock like Archie's) ----------
const BN = { list: null, focus: {}, i: -1, timer: null, clock: null };
function tod() { const h = new Date().getHours(); return h >= 5 && h < 10 ? "morning" : h >= 10 && h < 17 ? "day" : h >= 17 && h < 20 ? "evening" : "night"; }
function stars() {
  let s = "", seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 34; k++) s += `<circle cx="${(r() * 100).toFixed(1)}%" cy="${(r() * 55).toFixed(1)}%" r="${r() < 0.7 ? 1 : 1.5}" fill="#fff"/>`;
  return `<svg class="stars" width="100%" height="100%">${s}</svg><div class="moon"></div>`;
}
async function banner(el, greet) {
  if (!el) return;
  if (!BN.list) { try { const b = await (await fetch("/banners")).json(); BN.list = b.pictures; BN.focus = b.focus || {}; } catch (e) { BN.list = []; } }
  const clockTxt = () => { const d = new Date(); return d.toTimeString().slice(0, 5) + "  ·  " + d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "").toLowerCase(); };
  const t = tod();
  el.className = "bwrap";
  el.innerHTML = `<div class="banner ${BN.list.length ? "" : "empty"}" title="click for the next picture"><img alt=""><img alt="">
      <div class="tint t-${t}"><i></i><b></b>${t === "night" ? stars() : ""}</div></div>
    <div class="bover"><div class="bleft"><div class="greet">${esc(greet)}</div><div class="clock" id="clk">${clockTxt()}</div></div>
      <div class="bquote" id="bq"></div></div>`;
  const imgs = el.querySelectorAll("img");
  const show = (step) => {
    if (!BN.list.length) return;
    BN.i = BN.i < 0 ? Math.floor(Math.random() * BN.list.length) : (BN.i + step + BN.list.length) % BN.list.length;
    const name = BN.list[BN.i], f = BN.focus[name.toLowerCase()] || [50, 55];
    const next = imgs[0].classList.contains("on") ? imgs[1] : imgs[0], cur = next === imgs[0] ? imgs[1] : imgs[0];
    next.onload = () => { next.classList.add("on"); cur.classList.remove("on"); };
    next.style.objectPosition = `${f[0]}% ${f[1]}%`;
    next.src = "/banners/" + encodeURIComponent(name);
  };
  if (BN.i < 0) show(1); else { BN.i -= 1; show(1); }
  el.querySelector(".banner").onclick = () => show(1);
  // the quote wheel, bottom right: a new one every 45 s, each can be saved
  const STAR = (fill) => `<svg width="12" height="12" viewBox="0 0 24 24" style="vertical-align:-1px"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const bq = el.querySelector("#bq");
  const quote = () => {
    const [q, who] = nextQuote();
    bq.classList.remove("on");
    setTimeout(() => {
      bq.innerHTML = `<div class="bq-t">“${esc(q)}”</div><div class="bq-w">${esc(who)} <button class="bq-s" title="save this quote">${STAR(false)}</button><button class="bq-x" title="don't show this again" aria-label="hide this quote">×</button></div>`;
      const sb = bq.querySelector(".bq-s"), xb = bq.querySelector(".bq-x");
      xb.onclick = (e) => { e.stopPropagation(); hideQuote(xb, q, who, quote); };
      sb.onclick = async (e) => { e.stopPropagation(); await api("quotes/add", { text: `"${q}" (${who})` }); sb.innerHTML = STAR(true); sb.classList.add("on"); toast("Saved to your quotes (Settings)"); };
      bq.classList.add("on");
    }, 600);
  };
  quote();
  clearInterval(BN.qt); BN.qt = setInterval(() => { if (document.body.contains(el)) quote(); }, 45000);
  clearInterval(BN.timer); clearInterval(BN.clock);
  BN.timer = setInterval(() => { if (document.body.contains(el)) show(1); }, 15 * 60 * 1000);
  BN.clock = setInterval(() => { const c = document.getElementById("clk"); if (c) c.textContent = clockTxt(); }, 15000);
}

const QUOTES = [
  ["Learning never exhausts the mind.", "Leonardo da Vinci"],
  ["As long as you live, keep learning how to live.", "Seneca"],
  ["It is not that we have a short time to live, but that we waste a lot of it.", "Seneca"],
  ["Well begun is half done.", "Aristotle"],
  ["We are what we repeatedly do.", "Will Durant, after Aristotle"],
  ["The impediment to action advances action. What stands in the way becomes the way.", "Marcus Aurelius"],
  ["Waste no more time arguing what a good man should be. Be one.", "Marcus Aurelius"],
  ["It does not matter how slowly you go as long as you do not stop.", "Confucius"],
  ["Real knowledge is to know the extent of one's ignorance.", "Confucius"],
  ["An investment in knowledge pays the best interest.", "Benjamin Franklin"],
  ["Lost time is never found again.", "Benjamin Franklin"],
  ["Tell me and I forget. Teach me and I remember. Involve me and I learn.", "attributed to Benjamin Franklin"],
  ["Go confidently in the direction of your dreams.", "Henry David Thoreau"],
  ["It is not enough to be busy. The question is: what are we busy about?", "Henry David Thoreau"],
  ["The mind, once stretched by a new idea, never returns to its original dimensions.", "after Oliver Wendell Holmes"],
  ["Genius is one percent inspiration and ninety-nine percent perspiration.", "Thomas Edison"],
  ["Do the thing and you will have the power.", "Ralph Waldo Emerson"],
  ["The years teach much which the days never know.", "Ralph Waldo Emerson"],
  ["Energy and persistence conquer all things.", "Benjamin Franklin"],
  ["Little by little, one travels far.", "Spanish proverb"],
  ["The best time to plant a tree was twenty years ago. The second best time is now.", "proverb"],
  ["Simplicity is the ultimate sophistication.", "attributed to Leonardo da Vinci"],
  ["I have been impressed with the urgency of doing. Knowing is not enough; we must apply.", "Leonardo da Vinci"],
  ["Nothing will come of nothing.", "William Shakespeare"],
  ["Our doubts are traitors, and make us lose the good we oft might win by fearing to attempt.", "William Shakespeare"],
  ["Knowledge is power.", "Francis Bacon"],
  ["Reading maketh a full man; conference a ready man; and writing an exact man.", "Francis Bacon"],
  ["The unexamined life is not worth living.", "Socrates"],
  ["Patience is bitter, but its fruit is sweet.", "attributed to Aristotle"],
  ["Make the best use of what is in your power, and take the rest as it happens.", "Epictetus"],
  ["First say to yourself what you would be; and then do what you have to do.", "Epictetus"],
  ["A journey of a thousand miles begins with a single step.", "Laozi"],
  ["He who learns but does not think is lost; he who thinks but does not learn is in danger.", "Confucius"],
  ["Study the past if you would define the future.", "Confucius"],
  ["There is no royal road to geometry.", "Euclid"],
  ["Give me six hours to chop down a tree and I will spend the first four sharpening the axe.", "attributed to Abraham Lincoln"],
];
// ~2,000 quotes from quotes.json; a shuffled deck kept on this laptop so nothing repeats until you've seen them all
let QALL = QUOTES;
let QHID = { q: [], who: [] };
const QLOAD = Promise.all([
  fetch("quotes.json").then((r) => r.json()).then((x) => { if (Array.isArray(x) && x.length > QUOTES.length) QALL = x; }).catch(() => {}),
  fetch("/api/quotes/hidden", { method: "POST" }).then((r) => r.json()).then((x) => { if (x && x.q) QHID = x; }).catch(() => {}),
]);
const qHidden = ([q, who]) => QHID.q.includes(q) || QHID.who.includes(who.replace(/^attributed to /, ""));
function nextQuote() {
  for (let t = 0; t < 60; t++) { const x = drawQuote(); if (!qHidden(x)) return x; }
  return QUOTES[0];
}
// hide a quote, or everyone by that person; the × sits next to the save star
async function hideQuote(btn, q, who, after) {
  const name = who.replace(/^attributed to /, "");
  const box = document.createElement("span"); box.className = "qhide";
  box.innerHTML = `hide <button type="button" data-k="q">this one</button><button type="button" data-k="who">everything by ${esc(name)}</button><button type="button" data-k="x" aria-label="cancel">cancel</button>`;
  btn.replaceWith(box);
  box.querySelectorAll("button").forEach((b) => (b.onclick = async (e) => {
    e.stopPropagation(); e.preventDefault();
    if (b.dataset.k === "x") return box.replaceWith(btn);
    QHID = await (await fetch("/api/quotes/hide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b.dataset.k === "q" ? { q } : { who: name }) })).json();
    toast(b.dataset.k === "q" ? "You won't see that one again" : `No more quotes by ${name}`); after();
  }));
}
function drawQuote() {
  const n = QALL.length; let st;
  try { st = JSON.parse(localStorage.getItem("feather-qdeck")); } catch (e) {}
  if (!st || st.n !== n || st.i >= n) { const o = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [o[i], o[k]] = [o[k], o[i]]; } st = { n, i: 0, o }; }
  const q = QALL[st.o[st.i++]];
  try { localStorage.setItem("feather-qdeck", JSON.stringify(st)); } catch (e) {}
  return q;
}
// ---------- unlock ----------
async function vUnlock() {
  const st = await (await fetch("/api/state")).json(); await QLOAD;
  S.model = st.model;
  if (st.unlocked) return (location.hash = "#/home");
  const play = !S.introDone && !matchMedia("(prefers-reduced-motion: reduce)").matches; S.introDone = true;
  root.innerHTML = `<div class="center lock ${play ? "intro" : ""}" id="lockroot"><div class="glow"></div>
    <div class="stage"><svg class="ink" viewBox="0 0 200 200" aria-hidden="true"><path d="M86 193 C64 190 48 200 32 195" pathLength="100"/></svg><svg class="wsvg" viewBox="0 0 760 230" role="img" aria-label="Feather"><text class="word" x="380" y="165" text-anchor="middle">Feather</text></svg><img class="nib" src="quill-only.svg" alt=""></div>
    <div class="after col" style="align-items:center;gap:20px"><div class="lsub">${st.demo ? "demo · made-up sample data" : st.exists ? "notes · books · study" : "first time · make a password"}</div>
    ${(() => { const [q, who] = nextQuote(); S.lockq = [q, who]; S.saveQ = false; return `<div class="lockq"><div class="serif">“${esc(q)}”</div><div class="who">${esc(who)}</div>
      <button type="button" class="qsave" id="qs" title="save this quote (it's kept in Settings)"><svg width="13" height="13" viewBox="0 0 24 24" style="vertical-align:-2px"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg> save</button><button type="button" class="qsave" id="qx" title="don't show this quote again">× hide</button></div>`; })()}
    <form id="f" class="col" style="width:380px">
      ${st.demo ? '<button class="go" style="align-self:center;padding:0 28px">open the demo</button><div class="dim" style="font-size:12px;text-align:center">Nothing here is real, and your own Feather stays locked.</div><input id="pw" type="hidden" value="demo">' : `<label for="pw">Password</label><div class="row" style="flex-wrap:nowrap;gap:8px"><input id="pw" type="password" autofocus autocomplete="off" data-lpignore="true" name="feather-key" style="flex:1">${st.exists ? '<button class="go">unlock</button>' : ""}</div>`}
      ${st.exists ? "" : `<label for="pw2">Again</label><input id="pw2" type="password"><div class="dim" style="font-size:12px;line-height:1.6">There's no way to recover it if you forget it. Your notes stay encrypted on the stick.</div>`}
      ${st.exists ? "" : '<button class="go">create and unlock</button>'}<div class="err" id="err"></div></form>
    </div><div class="lockfoot"><span>${st.demo ? "demo mode" : "locked · encrypted on this stick"}</span><span>Feather ${esc(st.version || "")} · build ${esc(st.build || "?")}</span></div></div>`;
  if (play) $("#lockroot").addEventListener("pointerdown", () => $("#lockroot").classList.remove("intro"), { once: true });
  S.demo = !!st.demo;
  $("#qx") && ($("#qx").onclick = () => hideQuote($("#qx"), S.lockq[0], S.lockq[1], () => {
    const [q, who] = nextQuote(); S.lockq = [q, who]; S.saveQ = false;
    const L = $(".lockq"); L.querySelector(".serif").textContent = `“${q}”`; L.querySelector(".who").textContent = who; $("#pw") && $("#pw").focus(); }));
  $("#qs") && ($("#qs").onclick = () => { S.saveQ = !S.saveQ; $("#qs").innerHTML = S.saveQ ? `<svg width="13" height="13" viewBox="0 0 24 24" style="vertical-align:-2px"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg> saves when you unlock` : `<svg width="13" height="13" viewBox="0 0 24 24" style="vertical-align:-2px"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg> save`; $("#qs").classList.toggle("on", S.saveQ); $("#pw").focus(); });
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const pw = $("#pw").value;
    if (!st.exists && pw !== $("#pw2").value) return ($("#err").textContent = "The two passwords don't match.");
    $("#err").innerHTML = '<span class="spin"></span>';
    try {
      await api("unlock", { password: pw });
      if (S.saveQ && S.lockq) await api("quotes/add", { text: `"${S.lockq[0]}" (${S.lockq[1]})` }).catch(() => {});
      glideStart();
    } catch (er) { $("#err").textContent = er.message; }
  };
}

// ---------- home ----------
// late at night (9pm to 5am)
const lateGreet = (name) => (name ? `The Quiet Hours, ${name}…` : "The Quiet Hours…");
async function vHome() {
  const h = await api("home"); S.model = h.model; S.synced = h.synced; S.libs = h.libs;
  const b = h.reading, hr = new Date().getHours();
  const greet = hr >= 21 || hr < 5 ? lateGreet(h.name) : (hr >= 5 && hr < 12 ? "Morning" : hr >= 12 && hr < 17 ? "Afternoon" : "Evening") + (h.name ? ", " + h.name : "");
  const last = Object.values(b?.chapters || {}).sort((x, y) => y.t - x.t)[0];
  const ex = h.exams[h.exams.length - 1];
  const days = (d) => Math.round((new Date(d + "T00:00") - new Date(new Date().toDateString())) / 864e5);
  const rv = h.reviews || { days: [0, 0, 0, 0, 0, 0, 0], streak: 0 }, mxr = Math.max(1, ...rv.days);
  const mt = h.math, C = 2 * Math.PI * 26;
  const dl = h.deadlines || [], tday = h.today || {};
  setTimeout(() => { banner($("#bnr"), greet); if (window.curiosity) curiosity($("#curio")); if (!h.toured && !S.touredAsked) { S.touredAsked = true; setTimeout(() => tour(false), 900); } }, 0);
  shell("home", `<div class="col" style="gap:14px">
    <div id="bnr"></div>
    <div class="today" role="list" aria-label="Today"><span class="tlab">Today</span>
      <a role="listitem" href="#/cards">${icon("cards")}<span>${h.due ? `<b class="num" data-count="${h.due}">${h.due}</b> card${h.due === 1 ? "" : "s"} due` : "no cards due"}</span></a>
      ${tday.study ? `<i></i><span role="listitem"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c2 4 6 5 6 10a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 2 4 4"/></svg><span><b>${tday.study}</b>-day study streak</span></span>` : ""}
      ${tday.math ? `<i></i><a role="listitem" href="#/math">${icon("math")}<span>math streak <b>${tday.math}</b></span></a>` : ""}
      ${dl.length ? `<i></i><span role="listitem">${icon("cal")}<span>${esc(dl[0].what)} · ${days(dl[0].date) <= 0 ? "<b>today</b>" : `<b>${days(dl[0].date)}</b> day${days(dl[0].date) === 1 ? "" : "s"}`}</span></span>` : ""}
      ${h.due ? `<a class="tgo" href="#/cards">Review ${h.due === 1 ? "it" : "them"} →</a>` : `<a class="tgo" href="#/math">Practice math →</a>`}</div>
    <div class="grid home">
      <section class="card span2 readcard">${b ? `<div class="cover"><span>${esc(b.title)}</span></div>
        <div class="col" style="gap:8px;flex:1;min-width:0"><h2 class="hd">Reading</h2><div class="serif" style="font-size:28px;line-height:1.1">${esc(b.title)}</div>
          <div class="muted small">${esc(b.author)}${b.progress?.chapter ? " · " + esc(b.progress.chapter) : ""} · ${b.digital ? "ch." : "p."} ${esc(b.progress?.page || 0)}${b.pages ? " of " + esc(b.pages) : ""}</div>
          ${b.pages ? `<div class="bar thin"><div style="width:${Math.min(100, Math.round(100 * (b.progress?.page || 0) / b.pages))}%"></div></div>` : ""}
          ${last ? `<div class="serif" style="font-style:italic;font-size:16px;color:var(--soft)">“${esc(last.notes.slice(0, 140))}”</div>` : ""}
          <a class="act" href="${b.digital ? "#/read/" + b.digital : "#/book/" + b.id}">Continue reading →</a></div>`
        : `<div class="col" style="gap:12px;flex:1"><h2 class="hd">Reading</h2>${EMPTY("book", "No book yet", "Add the paper book you're on and Feather keeps your place.", '<a class="act" href="#/reading">Add a book →</a>')}</div>`}</section>
      <section class="card calcard" id="calc" data-go="cal"><div class="row" style="justify-content:space-between;align-items:baseline"><h2 class="hd">Coming up</h2><button class="small calbtn" id="cale" title="change, add or remove dates">${h.calq ? `<span class="calq">${h.calq}</span>` : ""}edit</button></div>
        ${dl.length ? `<div class="row" style="gap:14px;flex-wrap:nowrap"><div class="daybox"><b class="num">${Math.max(0, days(dl[0].date))}</b><span>${days(dl[0].date) === 1 ? "DAY" : "DAYS"}</span></div><span class="small" style="line-height:1.5">${esc(dl[0].what)}</span></div>
          ${dl.slice(1, 4).map((x) => `<div class="row small" style="justify-content:space-between;flex-wrap:nowrap;gap:10px"><span>${esc(x.what)}</span><span class="${days(x.date) <= 7 ? "lime" : "dim"}" style="white-space:nowrap">${days(x.date) === 0 ? "today" : days(x.date) + " d"}</span></div>`).join("")}`
          : EMPTY("cal", "A clear runway", "Nothing coming up. Click here to add a date, or add one in Archie on your PC.")}</section>
      <section class="card span2"><div class="row" style="justify-content:space-between;align-items:baseline"><h2 class="hd">World</h2><span class="dim small">${h.synced ? "synced " + ago(h.synced) : ""}</span></div>
        ${(h.world || []).length ? `<div class="wlist">${h.world.slice(0, 3).map((s) => `<a href="#/world" class="wrow"><span class="serif">${esc(s.title)}</span><span class="dim small">${s.n} sources</span></a>`).join("")}</div>`
          : EMPTY("globe", "No snapshot yet", "Plug into your PC once and today's headlines come along.")}</section>
      <section class="card" style="flex-direction:row;align-items:center;gap:16px">${mt ? `<svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${mt.mastered} of ${mt.total} math topics mastered" style="flex-shrink:0"><circle cx="32" cy="32" r="26" fill="none" stroke="#262a22" stroke-width="6"/>
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--lime)" stroke-width="6" stroke-linecap="round" class="ringfill" data-dash="${(C * mt.mastered / mt.total).toFixed(1)} ${C.toFixed(1)}" stroke-dasharray="0 ${C.toFixed(1)}" transform="rotate(-90 32 32)"/></svg>` : ""}
        <div class="col" style="gap:4px"><h2 class="hd">Math</h2><span class="muted small">${mt ? `${mt.mastered} of ${mt.total} mastered` : "Lessons and practice"}</span>
          <a class="act" href="#/math${mt && mt.next_id ? "/" + mt.next_id : ""}">${mt && mt.next ? "Next: " + esc(mt.next) : "Open"} →</a></div></section>
      <section class="card"><h2 class="hd">Mock exam</h2><span class="muted small">${ex ? `Last: ${ex.score}%${ex.weak.length ? " · weak spot " + esc(ex.weak[0]) : ""}` : `From ${h.notes} notes and ${h.docs || 0} documents`}</span><a class="act" href="#/exam">Start one →</a></section>
      <section class="card"><h2 class="hd">Study session</h2><span class="muted small">Timer, then a quick quiz. Misses become flashcards.</span><a class="act" href="#/study">Start →</a></section>
      <section class="card"><h2 class="hd">Teach it back</h2><span class="muted small">Explain it in your own words; Archie checks it.</span><a class="act" href="#/teach">Try one →</a></section>
      <section class="card span3" id="curio"><h2 class="hd">Today's curiosity</h2><div class="muted small"><span class="spin"></span></div></section>
    </div></div>`);
  homeCards();
  $("#calc").onclick = (e) => { if (!e.target.closest("a")) calEdit(); };
}
// a card on the home screen opens wherever its link goes, wherever you click on it
function homeCards() {
  document.querySelectorAll(".grid.home > .card").forEach((c) => {
    const a = c.querySelector("a.act"); if (!a || c.dataset.go) return;
    c.classList.add("clickable"); c.tabIndex = -1;
    c.addEventListener("click", (e) => { if (e.target.closest("a,button,input,select,textarea") || String(getSelection()).trim()) return; location.hash = a.getAttribute("href"); });
  });
}

// ---------- calendar: Archie's dates, changed here, sent back to Archie at the next PC sync ----------
const CALK = [["deadline", "countdown"], ["exam", "exam"], ["test", "test"], ["quiz", "quiz"], ["due", "due"], ["lab", "lab"], ["class", "class"], ["event", "event"]];
async function calEdit(focus) {
  let R = await api("cal/list");
  document.querySelectorAll(".calwrap").forEach((x) => x.remove());
  const w = document.createElement("div"); w.className = "calwrap"; w.setAttribute("role", "dialog"); w.setAttribute("aria-label", "Calendar");
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener("keydown", key); if (location.hash.startsWith("#/home") || !location.hash) vHome(); };
  const key = (e) => { if (e.key === "Escape" && !e.target.matches("input,select")) close(); };
  document.addEventListener("keydown", key);
  w.addEventListener("click", (e) => { if (e.target === w) close(); });
  const fmt = (x) => { const d = new Date(x.date + "T" + (x.time || "00:00")); const dd = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
    return dd + (x.time ? " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""); };
  const left = (d) => { const n = Math.round((new Date(d + "T00:00") - new Date(new Date().toDateString())) / 864e5); return n < 0 ? "past" : n === 0 ? "today" : n === 1 ? "tomorrow" : n + " days"; };
  const form = (x) => `<form class="calf" data-id="${x ? esc(x.id) : ""}"><input name="what" value="${x ? esc(x.what) : ""}" placeholder="what is it? (e.g. First day of classes)" required maxlength="200">
      <div class="row" style="gap:8px"><input type="date" name="date" value="${x ? esc(x.date) : new Date().toISOString().slice(0, 10)}" required><input type="time" name="time" value="${x && x.time ? esc(x.time) : ""}" aria-label="time (optional)">
      <select name="kind" aria-label="kind">${CALK.map(([k, l]) => `<option value="${k}" ${(x ? x.kind : "event") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="row" style="justify-content:flex-end;gap:8px">${x ? '<button type="button" class="small" data-x>cancel</button>' : ""}<button class="small go">${x ? "save" : "add"}</button></div></form>`;
  function draw(editId) {
    w.innerHTML = `<div class="calbox"><div class="row" style="justify-content:space-between;align-items:baseline"><h2 class="serif" style="margin:0;font-weight:400">Coming up</h2><button class="small" data-close aria-label="close">close</button></div>
      <div class="dim small">From Archie's calendar and countdowns. What you change here goes to Archie the next time Feather syncs with your PC${R.pending ? ` · <b class="lime">${R.pending} change${R.pending === 1 ? "" : "s"} waiting</b>` : ""}.</div>
      <div class="callist">${R.items.length ? R.items.map((x) => x.id === editId ? form(x) : `<div class="calrow" data-id="${esc(x.id)}"><span class="calk k-${esc(x.kind)}">${esc((CALK.find(([k]) => k === x.kind) || [, x.kind])[1])}</span>
          <span class="col" style="gap:2px;min-width:0;flex:1"><span class="calw">${esc(x.what)}${x.repeat === "weekly" ? ' <span class="dim small">· weekly</span>' : ""}${x.src === "new" ? ' <span class="dim small">· new</span>' : ""}</span><span class="dim small">${fmt(x)}</span></span>
          <span class="calleft ${left(x.date) === "today" || left(x.date) === "tomorrow" ? "lime" : "dim"}">${left(x.date)}</span>
          <button class="small" data-e title="change it">edit</button><button class="small del" data-d title="remove it">✕</button></div>`).join("") : '<div class="dim small" style="padding:10px 0">Nothing coming up yet.</div>'}</div>
      <div class="k" style="margin-top:6px">Add a date</div>${form(null)}</div>`;
    w.querySelector("[data-close]").onclick = close;
    w.querySelectorAll(".calrow").forEach((row) => {
      row.querySelector("[data-e]").onclick = () => draw(row.dataset.id);
      row.querySelector(".calw").parentElement.onclick = () => draw(row.dataset.id);
      sure(row.querySelector("[data-d]"), async () => { R = await api("cal/del", { item: { id: row.dataset.id } }); draw(); toast("Removed"); }, "remove?");
    });
    w.querySelectorAll(".calf").forEach((f) => {
      f.onsubmit = async (e) => { e.preventDefault();
        try { R = await api("cal/save", { item: { id: f.dataset.id || undefined, what: f.what.value, date: f.date.value, time: f.time.value, kind: f.kind.value } }); draw(); toast(f.dataset.id ? "Saved" : "Added"); }
        catch (er) { toast(er.message); } };
      const x = f.querySelector("[data-x]"); if (x) x.onclick = () => draw();
    });
    const fe = w.querySelector(`.calf[data-id="${editId || ""}"] input[name=what]`); if (editId && fe) { fe.focus(); fe.select(); }
  }
  draw(focus);
}

// ---------- reading ----------
async function vReading() {
  const books = await api("books");
  const m = shell("reading", `<div class="col" style="gap:20px"><h1>Reading</h1>
    <div class="list">${books.map((b) => `<a class="item" href="#/book/${b.id}"><span><span class="serif" style="font-size:19px">${esc(b.title)}</span> <span class="muted">· ${esc(b.author)}</span></span>
      <span class="muted">${b.finished ? "finished " + when(b.finished) : (b.digital ? "chapter " + esc(b.progress?.page || 1) + " of " + esc(b.pages) : "page " + esc(b.progress?.page || 0))}</span></a>`).join("") || '<div class="muted">No books yet.</div>'}</div>
    <form id="nb" class="card" style="max-width:640px"><div class="k">Add a book (paper copy)</div>
      <div class="row"><input id="t" placeholder="title" required style="flex:2"><input id="a" placeholder="author" style="flex:1"></div>
      <div class="row"><input id="pg" placeholder="pages" type="number" style="width:110px"><input id="pub" placeholder="publisher (for citations)" style="flex:1"><input id="yr" placeholder="year" style="width:90px"><input id="tr" placeholder="translator" style="width:160px"></div>
      <div><button class="go">add</button></div></form></div>`);
  $("#nb", m).onsubmit = async (e) => {
    e.preventDefault();
    const b = await api("book/save", { title: $("#t").value, author: $("#a").value, pages: +$("#pg").value || null, publisher: $("#pub").value, year: $("#yr").value, translator: $("#tr").value });
    location.hash = "#/book/" + b.id;
  };
}

async function vBook(id) {
  const books = await api("books"), b = books.find((x) => x.id === id);
  if (!b) return (location.hash = "#/reading");
  const chs = Object.entries(b.chapters).sort((x, y) => x[1].t - y[1].t);
  const curCh = b.progress?.chapter || chs[chs.length - 1]?.[0] || "";
  const cur = b.chapters[curCh] || { notes: "", tags: [] };
  const TAGS = ["loved this", "confusing", "slow", "big moment"];
  const m = shell("reading", `<div class="col" style="gap:18px">
    <div class="row" style="justify-content:space-between"><div><div class="row" style="gap:14px"><a href="#/reading" class="muted">← reading</a><button class="small del" id="bdel">delete book</button></div><h1 style="margin-top:6px">${esc(b.title)}</h1><div class="muted">${esc(b.author)} · ${b.digital ? "on Feather" : "paper copy"} · started ${when(b.started)}</div></div>
      ${b.digital ? `<a class="btn go" href="#/read/${esc(b.digital)}">open in the reader →</a><form id="pf" hidden>` : `<form id="pf" class="row">`}<label for="pp">I'm on page</label><input id="pp" type="number" value="${esc(b.progress?.page || "")}" style="width:90px">
      <input id="pc" placeholder="chapter (e.g. Part 3, Ch. 5)" value="${esc(curCh)}" style="width:230px"><button class="go">log</button></form></div>
    ${b.pages ? `<div class="bar"><div style="width:${Math.min(100, Math.round(100 * (b.progress?.page || 0) / b.pages))}%"></div></div>` : ""}
    <div style="display:grid;grid-template-columns:220px minmax(0,1fr) 320px;gap:20px">
      <div class="col"><div class="k">Your log</div><div class="list">${chs.map(([k, v]) => `<button class="ch ${k === curCh ? "go" : ""}" data-ch="${esc(k)}" style="justify-content:flex-start">${esc(k)}</button>`).join("") || '<span class="dim">nothing yet</span>'}</div>
        <div class="k" style="margin-top:14px">People</div><div class="row" style="gap:6px">${b.people.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>
        <form id="ppl" class="row"><input id="pn" placeholder="add a name" style="width:150px"><button>+</button></form>
        <div class="k" style="margin-top:14px">Cite</div><button id="cite">MLA / APA</button><div id="cites" class="dim" style="font-size:12px;line-height:1.6"></div></div>
      <div class="col"><label for="nt">Your notes · <span id="chl">${esc(curCh || "this part")}</span></label>
        <textarea id="nt" class="serif" style="min-height:340px;font-size:18px" placeholder="what's happening, what you think, what you want to remember">${esc(cur.notes)}</textarea>
        <div class="row">${TAGS.map((t) => `<button type="button" class="tag ${cur.tags.includes(t) ? "go" : ""}" data-t="${t}" style="height:34px;font-size:12px">${t}</button>`).join("")}<span style="flex:1"></span><button class="go" id="sv">save notes</button></div></div>
      <div class="col"><div class="k">Quotes</div>
        <div class="row"><label class="btn" style="flex:1;justify-content:center;text-transform:none;letter-spacing:0;font-size:13px;color:var(--lime);border-color:var(--lime)">photo of page<input id="ph" type="file" accept="image/*" style="display:none"></label></div>
        <textarea id="qt" placeholder="type a quote, or pick a photo and fix up the text it reads" style="min-height:80px"></textarea>
        <div class="row"><input id="qp" placeholder="page" style="width:80px"><button id="qa">save quote</button></div>
        ${b.quotes.slice().reverse().map((q) => `<div class="quote">${esc(q.text)} <span class="dim" style="font-style:normal;font-size:11px">${q.page ? "p. " + esc(q.page) : ""}</span> <a href="#" data-rm="${q.id}" class="dim" style="font-style:normal;font-size:11px">remove</a></div>`).join("")}
        <div class="k" style="margin-top:8px">Ask · no spoilers past where you are</div>
        <textarea id="ask" placeholder="who is this again? what just happened?" style="min-height:70px"></textarea><button id="askb">ask</button>
        <div id="ans" class="muted" style="line-height:1.6"></div>
        <div class="dim" style="font-size:11px;line-height:1.6">Answers come from Archie's general knowledge of the book plus your notes, so details can be off.</div>
        <a class="btn" href="#/review/${b.id}" style="justify-content:center;margin-top:10px">${b.review ? "your review" : "finished it? build your review"}</a></div></div></div>`);
  let tags = cur.tags.slice(), chap = curCh;
  const saveNotes = async () => { await api("book/chapter", { id, chapter: $("#pc").value || chap || "Notes", notes: $("#nt").value, tags }); toast("Notes saved"); };
  sure($("#bdel"), async () => { await api("book/delete", { id }); toast("Book deleted"); location.hash = "#/reading"; }, "delete it and its notes?");
  $("#pf").onsubmit = async (e) => { e.preventDefault(); await api("book/progress", { id, page: +$("#pp").value || 0, chapter: $("#pc").value }); toast("Progress logged"); vBook(id); };
  $("#sv").onclick = saveNotes;
  m.querySelectorAll(".tag").forEach((el) => (el.onclick = () => { const t = el.dataset.t; tags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]; el.classList.toggle("go"); }));
  m.querySelectorAll(".ch").forEach((el) => (el.onclick = () => { chap = el.dataset.ch; const c = b.chapters[chap]; $("#nt").value = c.notes; tags = c.tags.slice(); $("#pc").value = chap; $("#chl").textContent = chap; m.querySelectorAll(".tag").forEach((t) => t.classList.toggle("go", tags.includes(t.dataset.t))); }));
  $("#ppl").onsubmit = async (e) => { e.preventDefault(); if ($("#pn").value.trim()) { await api("book/people", { id, people: [...b.people, $("#pn").value] }); vBook(id); } };
  $("#cite").onclick = async () => { const c = await api("book/cite", { id }); $("#cites").innerHTML = `MLA: ${esc(c.mla)}<br><br>APA: ${esc(c.apa)}`; };
  $("#ph").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $("#qt").value = "reading the photo…";
    const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    const res = await api("book/ocr", { id, image: data });
    $("#qt").value = res.text || ""; if (!res.text) toast("Couldn't read text from that photo");
  };
  $("#qa").onclick = async () => { if ($("#qt").value.trim()) { await api("book/quote", { id, text: $("#qt").value, page: $("#qp").value }); vBook(id); } };
  m.querySelectorAll("[data-rm]").forEach((el) => (el.onclick = async (e) => { e.preventDefault(); await api("book/quote", { id, remove: el.dataset.rm }); vBook(id); }));
  $("#askb").onclick = async () => { $("#ans").innerHTML = '<span class="spin"></span> thinking (the first answer takes longer while the model loads)'; const r = await api("book/ask", { id, question: $("#ask").value }); $("#ans").textContent = r.answer; };
}

async function vReview(id) {
  const books = await api("books"), b = books.find((x) => x.id === id), qs = await api("review/questions");
  const ans = b.review?.answers || qs.map(() => "");
  const m = shell("reading", `<div class="col" style="gap:18px;max-width:820px"><a href="#/book/${id}" class="muted">← ${esc(b.title)}</a><h1>Your review</h1>
    <div class="muted">Answer in your own words. Archie only shapes what you say, with your notes and quotes; it doesn't add opinions.</div>
    ${qs.map((q, i) => `<label for="r${i}" style="text-transform:none;letter-spacing:0;font-size:14px;color:var(--soft)">${esc(q)}</label><textarea id="r${i}" style="min-height:60px">${esc(ans[i] || "")}</textarea>`).join("")}
    <div><button class="go" id="mk">shape my review</button></div>
    <label for="out">Review (edit freely)</label><textarea id="out" class="serif" style="min-height:260px;font-size:18px">${esc(b.review?.text || "")}</textarea>
    <div class="row"><button id="sv" class="go">save · mark finished</button><button id="cp">copy</button></div></div>`);
  $("#mk").onclick = async () => { $("#out").value = "writing…"; const r = await api("book/review", { id, answers: qs.map((_, i) => $("#r" + i).value) }); $("#out").value = r.text; };
  $("#sv").onclick = async () => { await api("book/review/save", { id, text: $("#out").value }); toast("Saved. It goes to Obsidian at the next sync."); };
  $("#cp").onclick = () => { navigator.clipboard.writeText($("#out").value); toast("Copied"); };
}

// ---------- notes picker (exams, study, teach) ----------
async function notePicker(m, multi = true) {
  const notes = await api("notes");
  const folders = [...new Set(notes.map((n) => n.folder))].sort();
  m.querySelector("#np").innerHTML = notes.length ? `<div class="row"><input id="nq" placeholder="search notes" style="flex:1"><select id="nf"><option value="">all folders</option>${folders.map((f) => `<option>${esc(f)}</option>`).join("")}</select></div>
    <div class="list notes-pick" id="nl"></div>` : '<div class="muted">No notes on the stick yet. Plug Feather into your PC once and your Obsidian notes come over automatically.</div>';
  const sel = new Set();
  const draw = () => {
    const q = ($("#nq")?.value || "").toLowerCase(), f = $("#nf")?.value || "";
    $("#nl").innerHTML = notes.filter((n) => (!f || n.folder === f) && (!q || n.path.toLowerCase().includes(q))).slice(0, 200)
      .map((n) => `<label class="item" style="text-transform:none;letter-spacing:0;font-size:14px;color:var(--text);cursor:pointer"><span><input type="${multi ? "checkbox" : "radio"}" name="pick" value="${esc(n.path)}" ${sel.has(n.path) ? "checked" : ""}> ${esc(n.title)}</span><span class="dim">${esc(n.folder)}</span></label>`).join("");
    $("#nl").querySelectorAll("input").forEach((el) => (el.onchange = () => { if (!multi) sel.clear(); el.checked ? sel.add(el.value) : sel.delete(el.value); }));
  };
  if (notes.length) { $("#nq").oninput = draw; $("#nf").onchange = draw; draw(); }
  return { sel, folder: () => $("#nf")?.value || "" };
}

// ---------- exams ----------
async function vExam() {
  const m = shell("exam", `<div class="col" style="gap:18px;max-width:900px"><h1>Mock exam</h1>
    <div class="muted">Pick notes, or a whole folder. Questions come only from what's in your notes.</div>
    <div id="np"></div>
    <div class="row"><label for="n">Questions</label><input id="n" type="number" value="10" min="3" max="30" style="width:80px">
      <label for="mins">Minutes (0 = untimed)</label><input id="mins" type="number" value="15" min="0" style="width:80px">
      <button class="go" id="go">build the exam</button><span id="st" class="muted"></span></div></div>`);
  const pk = await notePicker(m);
  $("#go").onclick = async () => {
    const paths = [...pk.sel], folder = pk.folder();
    if (!paths.length && !folder) return toast("Pick some notes or a folder");
    $("#st").innerHTML = '<span class="spin"></span> writing questions from your notes…';
    const ex = await api("exam/new", { paths: paths.length ? paths : null, folder: paths.length ? null : folder, n: +$("#n").value, minutes: +$("#mins").value });
    if (!ex.questions.length) return ($("#st").textContent = "Couldn't make questions from those notes. Try longer notes.");
    take(ex, +$("#mins").value, false);
  };
}

function take(ex, minutes, quick) {
  const ans = ex.questions.map(() => "");
  let i = 0, left = minutes * 60, timer;
  const m = shell(quick ? "study" : "exam", "");
  const draw = () => {
    const q = ex.questions[i];
    m.innerHTML = `<div style="display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:30px">
      <div class="col" style="gap:20px"><div class="row" style="justify-content:space-between"><div><div style="font-size:17px">${quick ? "Quick quiz" : "Mock exam"} · ${esc(ex.title)}</div><div class="dim" style="font-size:12px">graded against your notes</div></div><div class="lime" id="clk" style="font-size:24px"></div></div>
      <div class="k">Question ${i + 1} of ${ex.questions.length} · ${q.kind === "mc" ? "multiple choice" : q.kind === "explain" ? "explain it" : "short answer"}</div>
      <div class="serif" style="font-size:28px;line-height:1.35">${esc(q.q)}</div>
      ${q.kind === "mc" ? `<div class="col">${q.options.map((o) => `<div class="opt ${ans[i] === o ? "on" : ""}" data-o="${esc(o)}">${esc(o)}</div>`).join("")}</div>`
        : `<textarea id="a" style="min-height:${q.kind === "explain" ? 180 : 90}px" placeholder="your answer">${esc(ans[i])}</textarea>`}
      <div class="dim" style="font-size:12px">from: ${esc(q.source)}</div>
      <div class="row"><button id="pv" ${i ? "" : "disabled"}>← back</button><button class="go" id="nx">${i < ex.questions.length - 1 ? "next →" : "finish and grade"}</button><span style="flex:1"></span><button id="fin">finish and grade</button></div></div>
      <div class="col"><div class="k">This ${quick ? "quiz" : "exam"}</div><div class="qnum">${ex.questions.map((_, k) => `<button class="${k === i ? "cur" : ans[k] ? "done" : ""}" data-k="${k}">${k + 1}</button>`).join("")}</div></div></div>`;
    m.querySelectorAll(".opt").forEach((el) => (el.onclick = () => { ans[i] = el.dataset.o; draw(); }));
    const keep = () => { if ($("#a")) ans[i] = $("#a").value; };
    $("#pv").onclick = () => { keep(); i--; draw(); };
    $("#nx").onclick = () => { keep(); if (i < ex.questions.length - 1) { i++; draw(); } else grade(); };
    $("#fin").onclick = () => { keep(); grade(); };
    m.querySelectorAll("[data-k]").forEach((el) => (el.onclick = () => { keep(); i = +el.dataset.k; draw(); }));
    tick();
  };
  const tick = () => { const c = $("#clk"); if (c && minutes) c.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; };
  if (minutes) timer = setInterval(() => { left--; tick(); if (left <= 0) { clearInterval(timer); toast("Time's up"); grade(); } }, 1000);
  const grade = async () => {
    clearInterval(timer);
    m.innerHTML = '<div class="center"><span class="spin"></span><div class="muted">grading against your notes…</div></div>';
    const r = await api("exam/grade", { id: ex.id, answers: ans, save: !quick });
    m.innerHTML = `<div class="col" style="gap:16px;max-width:900px"><div class="row" style="justify-content:space-between"><h1>${r.score}%</h1><a class="btn go" href="#/${quick ? "study" : "exam"}">another</a></div>
      ${r.weak.length ? `<div class="muted">Weak spots: ${r.weak.map(esc).join(", ")} · missed questions became flashcards</div>` : '<div class="lime">Clean sweep.</div>'}
      ${ex.questions.map((q, k) => `<div class="card"><div class="row" style="justify-content:space-between"><span class="k">${k + 1} · ${esc(q.source)}</span><span class="${r.results[k].score >= 0.6 ? "lime" : ""}" style="${r.results[k].score >= 0.6 ? "" : "color:var(--bad)"}">${Math.round(r.results[k].score * 100)}%</span></div>
        <div class="serif" style="font-size:19px">${esc(q.q)}</div><div class="muted">your answer: ${esc(ans[k] || "—")}</div>
        ${r.results[k].score < 1 ? `<div>${esc(r.results[k].feedback || "Answer: " + r.results[k].answer)}</div>` : ""}</div>`).join("")}</div>`;
  };
  draw();
}

// ---------- study session ----------
async function vStudy() {
  const m = shell("study", `<div class="col" style="gap:18px;max-width:900px"><h1>Study session</h1>
    <div class="muted">Pick what you're studying and set a timer. When it ends you get a quick quiz on it, and misses become flashcards.</div>
    <div id="np"></div><div class="row"><label for="mn">Minutes</label><input id="mn" type="number" value="25" style="width:80px"><button class="go" id="go">start</button></div></div>`);
  const pk = await notePicker(m);
  $("#go").onclick = () => {
    const paths = [...pk.sel], folder = pk.folder();
    if (!paths.length && !folder) return toast("Pick something to study");
    let left = +$("#mn").value * 60;
    m.innerHTML = `<div class="center"><div class="k">Studying</div><div class="big" id="tm" style="font-size:96px"></div><div class="muted">${paths.length ? paths.length + " note(s)" : esc(folder)}</div>
      <div class="row"><button id="done" class="go">I'm done · quiz me</button><button id="add">+5 min</button></div></div>`;
    const show = () => ($("#tm").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
    show();
    const t = setInterval(() => { left--; show(); if (left <= 0) { clearInterval(t); quiz(); } }, 1000);
    $("#add").onclick = () => { left += 300; show(); };
    $("#done").onclick = () => { clearInterval(t); quiz(); };
    const quiz = async () => {
      m.innerHTML = '<div class="center"><span class="spin"></span><div class="muted">making a quick quiz…</div></div>';
      const ex = await api("exam/new", { paths: paths.length ? paths : null, folder: paths.length ? null : folder, n: 5, title: "Study session" });
      ex.questions.length ? take(ex, 0, true) : (m.innerHTML = '<div class="center muted">Couldn\'t make questions from those notes.</div>');
    };
  };
}

// ---------- teach it back ----------
async function vTeach() {
  const m = shell("teach", `<div class="col" style="gap:18px;max-width:900px"><h1>Teach it back</h1>
    <div class="muted">Pick one note, then explain it like you're teaching someone. Archie checks it against the note.</div>
    <div id="np"></div><label for="ex">Your explanation</label><textarea id="ex" class="serif" style="min-height:200px;font-size:18px"></textarea>
    <div><button class="go" id="go">check it</button></div><div id="fb"></div></div>`);
  const pk = await notePicker(m, false);
  if (S.teachPath) {  // came from a document: pick it already
    pk.sel.add(S.teachPath); const q = $("#nq");
    if (q) { q.value = S.teachPath.split("/").pop(); q.dispatchEvent(new Event("input")); const el = [...m.querySelectorAll("#nl input")].find((i) => i.value === S.teachPath); if (el) el.checked = true; }
    S.teachPath = null;
  }
  $("#go").onclick = async () => {
    const path = [...pk.sel][0]; if (!path) return toast("Pick a note");
    $("#fb").innerHTML = '<span class="spin"></span>';
    const r = await api("teach", { path, explanation: $("#ex").value });
    const L = (t, xs, c) => xs.length ? `<div class="card"><div class="k" style="${c}">${t}</div>${xs.map((x) => `<div>· ${esc(x)}</div>`).join("")}</div>` : "";
    $("#fb").innerHTML = `<div class="col">${r.score != null ? `<h2>${esc(r.score)}%</h2>` : ""}${L("You got right", r.right, "color:var(--lime)")}${L("You left out", r.missing, "")}${L("Not quite", r.wrong, "color:var(--bad)")}
      ${r.model ? "" : '<div class="dim">The model isn\'t available, so this is a simple check of key words from the note.</div>'}</div>`;
  };
}

// ---------- ask Archie ----------
const ago = (t) => { if (!t) return ""; const m = Math.round((Date.now() / 1000 - t) / 60); return m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
function srcChips(src) {
  return (src || []).length ? `<div class="row" style="gap:6px">${src.map((s) => s.url ? `<a class="chip" href="${esc(s.url)}" target="_blank">${s.kind === "world" ? "World · " : ""}${esc(s.label.slice(0, 60))}</a>`
    : s.kind === "vault" ? `<a class="chip on" href="#/vault/a/${esc(s.book)}/${encodeURIComponent(s.path)}">${esc(s.label.slice(0, 70))}</a>`
    : s.kind === "gov" ? `<a class="chip" href="#/world/gov-${esc(s.iso)}">${esc(s.label)}</a>` : `<span class="chip">${s.kind === "note" ? "note · " : ""}${esc(s.label)}</span>`).join("")}</div>` : "";
}
function bubble(r) {
  return `<div class="col" style="gap:8px"><div class="ask-q">${esc(r.q)}</div>
    <div class="ask-a">${esc(r.a).replace(/\n/g, "<br>")}</div>${srcChips(r.sources)}</div>`;
}
async function vAsk() {
  const hist = await api("ask/history");
  const m = shell("ask", `<div class="col" style="gap:18px;max-width:880px;height:100%"><div class="row" style="justify-content:space-between"><h1>Ask Archie</h1><button id="clr">clear</button></div>
    ${S.askDoc ? `<div class="row"><span class="chip on">asking about: ${esc(S.askDoc.name)}</span><button id="nd" style="height:30px">✕ everything</button></div>`
      : '<div class="dim">Answers from the offline model, using the Vault, your notes and World when they match. It names what it used.</div>'}
    <div id="log" class="col" style="gap:26px;flex:1">${hist.map(bubble).join("") || '<div class="muted">Ask anything: a concept from class, what\'s going on somewhere, who runs a country, help with code.</div>'}</div>
    <form id="f" class="row" style="position:sticky;bottom:0;background:var(--bg);padding:12px 0"><input id="q" placeholder="ask Archie…" style="flex:1" autocomplete="off"><button class="go">ask</button></form></div>`);
  const log = $("#log"); m.scrollTop = m.scrollHeight; $("#q").focus();
  if (S.askPrefill) { $("#q").value = S.askPrefill; S.askPrefill = null; }
  $("#clr").onclick = async () => { await api("ask/clear", {}); vAsk(); };
  $("#nd") && ($("#nd").onclick = () => { S.askDoc = null; vAsk(); });
  $("#f").onsubmit = async (e) => {
    e.preventDefault(); const q = $("#q").value.trim(); if (!q) return;
    $("#q").value = ""; if (!hist.length) log.innerHTML = ""; hist.push(1);
    const el = document.createElement("div"); el.innerHTML = `<div class="col" style="gap:8px"><div class="ask-q">${esc(q)}</div><div class="ask-a"><span class="spin"></span> thinking…</div></div>`;
    log.appendChild(el); m.scrollTop = m.scrollHeight;
    try { el.innerHTML = bubble(await api("ask", { q, doc: S.askDoc ? S.askDoc.path : undefined })); } catch (er) { el.querySelector(".ask-a").textContent = er.message; }
    m.scrollTop = m.scrollHeight;
  };
}

// ---------- World ----------
const flag = (iso, h = 18) => iso ? `<img src="/flags/${esc(iso)}.svg" height="${h}" style="border-radius:2px;vertical-align:middle" onerror="this.remove()" alt="">` : "";
function story(s, i) {
  const its = s.items || [];
  return `<div class="card" style="gap:6px"><div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap">
      <div class="serif" style="font-size:19px;line-height:1.35">${flag(s.cc, 14)} ${esc(s.title)}</div>
      <span class="chip ${s.n > 2 ? "on" : ""}" style="white-space:nowrap">${s.n} source${s.n === 1 ? "" : "s"}</span></div>
    <div class="dim" style="font-size:12px">${[s.place, s.region, s.topic, ago(s.last || s.t)].filter(Boolean).map(esc).join(" · ")}</div>
    <details><summary class="muted" style="cursor:pointer;font-size:12px">who's reporting it</summary><div class="list" style="margin-top:8px">
      ${its.map((x) => `<a class="item" href="${esc(x.url)}" target="_blank"><span><span class="lime">${esc(x.source)}</span> · ${esc(x.title)}${x.summary ? `<br><span class="dim" style="font-size:12px">${esc(x.summary.slice(0, 220))}</span>` : ""}</span></a>`).join("")}</div></details></div>`;
}
async function vWorld(sub) {
  if (sub && sub.startsWith("gov")) return vGovs(sub.slice(4));
  let region = "";
  const m = shell("world", "");
  const draw = async () => {
    const d = await api("world/news", { region });
    m.innerHTML = `<div class="col" style="gap:18px;max-width:980px">
      <div class="row" style="justify-content:space-between"><h1>World</h1><div class="row"><a class="btn go" href="#/world">news</a><a class="btn" href="#/world/gov">governments</a></div></div>
      <div class="card"><div class="row" style="justify-content:space-between"><div><div class="k">Live</div>
        <div class="muted" style="font-size:13px">${d.state === "pulling" ? '<span class="spin"></span> pulling the feeds…' : d.live_at && !d.ok ? "couldn't reach the news feeds: is this laptop online?" : d.live_at ? `pulled ${ago(d.live_at)} · ${d.ok} feeds${d.failed ? `, ${d.failed} didn't answer` : ""}` : "needs internet on this laptop"}</div></div>
        <button id="rf" ${d.has_sources && d.state !== "pulling" ? "" : "disabled"}>refresh live</button></div></div>
      ${d.live.length ? `<div class="k">Live now · grouped by headline</div><div class="col">${d.live.slice(0, 25).map(story).join("")}</div>` : ""}
      <div class="row" style="justify-content:space-between"><div class="k">From your PC · ${d.pc_at ? "as of " + new Date(d.pc_at * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "no snapshot yet: plug the stick into your PC"}</div>
        <select id="rg"><option value="">all regions</option>${d.regions.map((r) => `<option ${r === region ? "selected" : ""}>${esc(r)}</option>`).join("")}</select></div>
      <div class="col">${d.pc.map(story).join("") || '<div class="muted">Nothing here yet.</div>'}</div></div>`;
    $("#rg").onchange = (e) => { region = e.target.value; draw(); };
    $("#rf").onclick = async () => { await api("world/refresh", {}); draw(); const t = setInterval(async () => { const x = await api("world/news", { region }); if (x.state !== "pulling") { clearInterval(t); if (location.hash.startsWith("#/world")) draw(); } }, 2500); };
  };
  await draw();
}
async function vGovs(iso) {
  const g = await api("world/govs", {});
  const names = (L) => (L || []).map((p) => `${esc(p.name)}${p.since ? ` <span class="dim">since ${esc(p.since.slice(0, 7))}</span>` : ""}`).join("<br>") || '<span class="dim">unknown</span>';
  const m = shell("world", `<div class="row" style="gap:22px;align-items:flex-start;height:100%">
    <div class="col" style="width:300px;flex-shrink:0;position:sticky;top:0"><div class="row"><a class="btn" href="#/world">news</a><a class="btn go" href="#/world/gov">governments</a></div>
      <input id="s" placeholder="search countries or leaders"><div class="list" id="L" style="max-height:calc(100vh - 190px);overflow:auto"></div>
      <div class="dim" style="font-size:11px">${g.at ? "as of your last sync, " + new Date(g.at * 1000).toLocaleDateString() : "no snapshot yet"}</div></div>
    <div id="C" class="col" style="flex:1;gap:16px"></div></div>`);
  const list = (f) => { f = f.toLowerCase(); $("#L").innerHTML = g.list.filter((c) => !f || (c.name + " " + [...(c.hos || []), ...(c.hog || [])].map((p) => p.name).join(" ")).toLowerCase().includes(f))
    .map((c) => `<a class="item ${c.iso2 === iso ? "on" : ""}" href="#/world/gov-${esc(c.iso2)}"><span>${flag(c.iso2, 14)} ${esc(c.name)}</span></a>`).join(""); };
  $("#s").oninput = (e) => list(e.target.value); list("");
  if (!iso) return ($("#C").innerHTML = '<div class="muted" style="padding-top:60px">Pick a country.</div>');
  const c = await api("world/country", { iso });
  if (c.error) return ($("#C").innerHTML = '<div class="muted">Not in the snapshot.</div>');
  $("#C").innerHTML = `<div class="row" style="gap:14px">${flag(c.iso2, 40)}<div><h1>${esc(c.name)}</h1><div class="muted">${esc(c.label || "")}${c.capital ? " · capital " + esc(c.capital) : ""}</div></div></div>
    <div class="grid" style="grid-template-columns:1fr 1fr"><div class="card"><div class="k">${esc(c.hosOffice || "Head of state")}</div><div style="font-size:16px">${names(c.hos)}</div></div>
      <div class="card"><div class="k">${esc(c.hogOffice || "Head of government")}</div><div style="font-size:16px">${names(c.hog)}</div></div></div>
    ${(c.cabinet || []).map((gr) => `<div class="card"><div class="k">${esc(gr.label || "Cabinet")}</div><div class="list">${(gr.people || []).map((p) => `<div class="item" style="padding:8px 12px"><span class="muted">${esc(p.title || "")}</span><span>${esc(p.name || "")}</span></div>`).join("")}</div></div>`).join("")}
    ${c.cabinet_source ? `<div class="dim" style="font-size:11px">Cabinet: ${esc(c.cabinet_source)}${c.cabinet_updated ? ", updated " + esc(c.cabinet_updated) : ""}. Leaders: Wikidata.</div>` : ""}
    ${c.intro ? `<div class="card"><div class="k">Background</div><div style="line-height:1.65;color:var(--soft)">${esc(c.intro).replace(/\n\n/g, "<br><br>")}</div></div>` : ""}`;
}

// ---------- the Vault ----------
const VS = { q: "", book: "", res: null };
async function vVault(sub, rest) {
  if (sub === "a") return vVaultRead(rest);
  const bk = await api("vault/books", {});
  const m = shell("vault", "");
  if (!bk.ok || !bk.books.length) {
    m.innerHTML = `<div class="col" style="gap:14px;max-width:700px"><h1>Vault</h1><div class="card"><div>The Vault isn't on this stick yet.</div>
      <div class="muted">${bk.files ? `${bk.files} libraries are on the stick, but the reader couldn't start on this laptop. Plug into your PC once to fix it.` : "Plug Feather into your PC: the sync copies Wikipedia, the textbooks and references from Archie's Vault (about 20 GB, once)."}</div>
      ${bk.error ? `<pre class="dim" style="white-space:pre-wrap;font-size:11px">${esc(bk.error)}</pre>` : ""}</div></div>`;
    return;
  }
  const shelves = {}; bk.books.forEach((b) => (shelves[b.shelf] = shelves[b.shelf] || []).push(b));
  const draw = () => {
    m.innerHTML = `<div class="col" style="gap:18px;max-width:980px"><h1>Vault</h1>
      <form id="f" class="row"><input id="q" value="${esc(VS.q)}" placeholder="search Wikipedia, textbooks, docs…" style="flex:1" autocomplete="off">
        <select id="bk"><option value="">everything</option>${bk.books.map((b) => `<option value="${esc(b.id)}" ${b.id === VS.book ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select><button class="go">search</button></form>
      <div id="R" class="col"></div>
      ${VS.res ? "" : Object.entries(shelves).map(([s, L]) => `<div class="k">${esc(s)}</div><div class="row" style="gap:8px">${L.map((b) => `<a class="chip" href="#/vault/a/${esc(b.id)}/">${esc(b.name)}</a>`).join("")}</div>`).join("")}
      <div class="dim" style="font-size:11px">${bk.books.length} libraries · ${(bk.books.reduce((a, b) => a + b.size, 0) / 1e9).toFixed(1)} GB · all offline</div></div>`;
    if (VS.res) $("#R").innerHTML = VS.res.length ? VS.res.map((r) => `<a class="item" style="display:block" href="#/vault/a/${esc(r.book)}/${encodeURIComponent(r.path)}">
        <div class="serif" style="font-size:18px">${esc(r.title)}</div><div class="lime" style="font-size:11px;margin:2px 0 4px">${esc(r.name)}</div>
        <div class="muted" style="font-size:13px;line-height:1.5">${esc((r.snippet || "").slice(0, 260))}</div></a>`).join("") : '<div class="muted">Nothing found. Try fewer or different words.</div>';
    $("#f").onsubmit = async (e) => {
      e.preventDefault(); VS.q = $("#q").value.trim(); VS.book = $("#bk").value; if (!VS.q) { VS.res = null; return draw(); }
      $("#R").innerHTML = '<div class="muted"><span class="spin"></span> searching the Vault…</div>';
      VS.res = await api("vault/search", { q: VS.q, book: VS.book }); draw();
    };
    $("#q").focus();
  };
  draw();
}
async function vVaultRead(rest) {
  const [book, ...pp] = (rest || "").split("/"); const path = decodeURIComponent(pp.join("/"));
  const isApp = (await api("vault/isapp", { book }).catch(() => ({}))).app;  // freeCodeCamp, LibreTexts: little web apps that need scripts
  const m = shell("vault", `<div class="col" style="gap:12px;height:100%">
    <div class="row" style="justify-content:space-between"><div class="row"><a class="btn" href="#/vault">← vault</a><span class="serif" id="tt" style="font-size:20px"></span></div>
      <div class="row">${readBar()}<span class="rsep"></span><button id="qaopen" title="make flashcards: Q, select the question, A, select the answer">flashcards</button><button id="ct">cite</button><button id="ex">exam on this</button><button id="ak" class="go">ask about this</button></div></div>
    <div id="cit"></div>
    <div class="rframe"><div class="rprog"><i id="rp"></i></div>
    <iframe id="fr" src="/vault/${esc(book)}/${encodeURIComponent(path).replace(/%2F/g, "/")}" sandbox="allow-same-origin allow-popups${isApp ? " allow-scripts allow-forms" : ""}" style="flex:1;width:100%;border:0;background:${isApp ? "#fff" : RT[RM.get().theme || "dark"][0]};min-height:70vh"></iframe></div></div>`);
  const fr = $("#fr");
  const cur = () => { try { const u = new URL(fr.contentWindow.location.href); const x = u.pathname.split("/").slice(3).join("/"); return decodeURIComponent(x); } catch (e) { return path; } };
  const style = (t, s) => { if (isApp) return; try { const d = fr.contentDocument.documentElement; d.dataset.theme = t; d.style.setProperty("--fs", s + "px"); fr.style.background = RT[t][0]; } catch (e) {} };
  fr.onload = () => { try {
    const d = fr.contentDocument; $("#tt").textContent = d.title || ""; if (!isApp) dropCap(d); wireReadBar(style);
    const w = fr.contentWindow, prog = () => { const h = d.documentElement.scrollHeight - w.innerHeight; $("#rp") && ($("#rp").style.width = (h > 0 ? 100 * w.scrollY / h : 100) + "%"); };
    w.addEventListener("scroll", prog, { passive: true }); prog();
    if (window.dictHook) { dictHook(d, fr); readerHook(d, { source: () => (d.title || "") + " (Vault)", frame: fr }); }
  } catch (e) {} };
  $("#qaopen").onclick = () => (QA.bar ? QA.close() : QA.open($("#cit")));
  $("#ct").onclick = async () => { const c = await api("vault/cite", { book, path: cur() });
    const it = (x) => esc(x).replace(/\*(.+?)\*/g, "<i>$1</i>");
    $("#cit").innerHTML = `<div class="card"><div class="k">MLA</div><div style="user-select:all">${it(c.mla)}</div><div class="k">APA</div><div style="user-select:all">${it(c.apa)}</div></div>`; };
  $("#ex").onclick = async () => { m.innerHTML = '<div class="center"><span class="spin"></span><div class="muted">making an exam from this page…</div></div>';
    const ex = await api("exam/new", { vault: { book, path: cur() }, n: 8 }); ex.questions.length ? take(ex, 0, false) : toast("Couldn't make questions from that page."); };
  $("#ak").onclick = async () => { const c = await api("vault/cite", { book, path: cur() }); location.hash = "#/ask"; setTimeout(() => { const q = $("#q"); if (q) { q.value = `About "${c.title}": `; q.focus(); } }, 300); };
}

// ---------- reading mode (theme + size kept on this laptop) ----------
const RM = { get() { try { return JSON.parse(localStorage.getItem("feather-read")) || {}; } catch (e) { return {}; } },
  set(x) { try { localStorage.setItem("feather-read", JSON.stringify({ ...RM.get(), ...x })); } catch (e) {} } };
const RT = { dark: ["#0c0d0b", "#e8ecdf"], sepia: ["#f1e7d0", "#3b2f22"], paper: ["#fbfaf6", "#1d1d1b"] };
function readBar() {
  const t = RM.get().theme || "dark";
  return `<div class="rbar">${Object.keys(RT).map((k) => `<button type="button" class="rt ${k === t ? "on" : ""}" data-t="${k}" aria-pressed="${k === t}" style="background:${RT[k][0]};color:${RT[k][1]}">${k}</button>`).join("")}
    <span class="rsep"></span><button type="button" class="rs" data-s="-1" aria-label="Smaller text" style="font-size:13px">A</button><button type="button" class="rs" data-s="1" aria-label="Larger text" style="font-size:18px">A</button></div>`;
}
// apply: a function (theme, size) that restyles the reading surface
function wireReadBar(apply) {
  const go = () => { const r = RM.get(); apply(r.theme || "dark", r.size || 19);
    document.querySelectorAll(".rt").forEach((b) => { b.classList.toggle("on", b.dataset.t === (r.theme || "dark")); b.setAttribute("aria-pressed", b.dataset.t === (r.theme || "dark")); }); };
  document.querySelectorAll(".rt").forEach((b) => (b.onclick = () => { RM.set({ theme: b.dataset.t }); go(); }));
  document.querySelectorAll(".rs").forEach((b) => (b.onclick = () => { RM.set({ size: Math.max(14, Math.min(28, (RM.get().size || 19) + 2 * b.dataset.s)) }); go(); }));
  go();
}
function dropCap(doc) {
  if (doc.querySelector("p.dropcap")) return;
  const p = [...doc.querySelectorAll("p")].find((x) => !x.closest("table,aside,.infobox,figure,blockquote") && x.textContent.trim().length > 120 && /^[A-Za-z\u00C0-\u024F]/.test(x.textContent.trim()));
  if (p) p.classList.add("dropcap");
}

// ---------- documents: your PDFs and readings ----------
async function vDocs(id) {
  if (id) return vDoc(id);
  const L = await api("readings");
  const m = shell("docs", "");
  const draw = (hits) => {
    m.innerHTML = `<div class="col" style="gap:18px;max-width:980px"><h1>Documents</h1>
      <div class="muted">PDFs, EPUBs and text files from <b>Feather\\Notes</b> in your Obsidian vault. Books open in the reader, where you can highlight and take notes. They also show up in mock exams, study sessions, teach it back and Ask.</div>
      <form id="f" class="row"><input id="q" placeholder="search inside your documents…" style="flex:1" autocomplete="off"><button class="go">search</button></form>
      <div id="R" class="col">${hits ? (hits.length ? hits.map((h) => `<a class="item" style="display:block" href="${h.book ? `#/read/${esc(h.id)}${h.ch ? "/" + (h.ch - 1) : ""}` : `#/docs/${esc(h.id)}`}">
          <div>${esc(h.name || h.path.replace(/^Readings\//, ""))}${h.page ? ` <span class="lime" style="font-size:12px">p. ${h.page}</span>` : h.ch ? ` <span class="lime" style="font-size:12px">ch. ${h.ch}</span>` : ""} <span class="dim" style="font-size:12px">· ${h.hits} match${h.hits === 1 ? "" : "es"}</span></div>
          <div class="muted" style="font-size:13px;margin-top:4px">…${esc(h.snippet)}…</div></a>`).join("") : '<div class="muted">No matches.</div>') : ""}</div>
      ${hits ? "" : L.length ? `<div class="list">${L.map((r) => `<a class="item" href="${r.kind === "pdf" ? "#/docs/" : "#/read/"}${esc(r.id)}"><span><span class="chip" style="margin-right:10px">${r.kind === "pdf" ? "pdf" : "book"}</span>${esc(r.name)}${r.author ? ` <span class="muted small">· ${esc(r.author)}</span>` : ""}</span>
          <span class="dim" style="font-size:12px">${r.kind === "pdf" ? r.pages + " pages · " : r.pages > 1 ? r.pages + " chapters · " : ""}${r.size < 1e6 ? Math.max(1, Math.round(r.size / 1e3)) + " KB" : (r.size / 1e6).toFixed(1) + " MB"}</span></a>`).join("")}</div>`
        : `<div class="card">${EMPTY("doc", "Nothing to read here yet", "Drop PDFs, EPUBs or .txt files in <b>Feather\\Notes</b> in your Obsidian vault, then plug Feather into your PC.")}</div>`}</div>`;
    $("#f").onsubmit = async (e) => { e.preventDefault(); const q = $("#q").value.trim(); if (!q) return draw(null); $("#R").innerHTML = '<span class="spin"></span>'; draw(await api("readings/search", { q })); $("#q").value = q; };
  };
  draw(null);
}
async function vDoc(id) {
  const r = await api("readings/one", { id });
  const m = shell("docs", `<div class="row" style="gap:20px;align-items:stretch;height:100%">
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px">
      <div class="row"><a class="btn" href="#/docs">← documents</a><span class="serif" style="font-size:20px">${esc(r.name)}</span></div>
      ${r.file && r.kind === "pdf" ? `<iframe src="/reading/${esc(r.id)}" style="flex:1;width:100%;min-height:75vh;border:1px solid var(--line);border-radius:10px;background:#fff"></iframe>`
        : `<div class="row" style="justify-content:flex-end">${readBar()}</div><div class="rframe" style="flex:1"><div class="rprog"><i id="rp"></i></div><div id="rd" class="reader">${(r.text || "(too big to keep the file on the stick: its text is still used for studying)").split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("")}</div></div>`}</div>
    <div class="col" style="width:260px;flex-shrink:0;gap:12px">
      <div class="card"><div class="k">Study this</div>
        <button class="go" id="ex">mock exam on it</button><button id="fc">make 10 flashcards</button><button id="tb">teach it back</button><button id="ak">ask about it</button>
        <div id="msg" class="muted" style="font-size:13px"></div></div>
      <div class="dim" style="font-size:12px;line-height:1.7">${r.kind === "pdf" ? r.pages + " pages · " : ""}${r.size < 1e6 ? Math.max(1, Math.round(r.size / 1e3)) + " KB" : (r.size / 1e6).toFixed(1) + " MB"}<br>stored encrypted on the stick</div></div></div>`);
  const rd = $("#rd");
  if (rd) { dropCap(rd); wireReadBar((t, s) => { rd.dataset.theme = t; rd.style.fontSize = s + "px"; }); if (window.readerHook) readerHook(document, { source: () => r.name });
    const prog = () => { const h = rd.scrollHeight - rd.clientHeight; $("#rp").style.width = (h > 0 ? 100 * rd.scrollTop / h : 100) + "%"; }; rd.addEventListener("scroll", prog, { passive: true }); prog(); }
  $("#ex").onclick = async () => { m.innerHTML = '<div class="center"><span class="spin"></span><div class="muted">making an exam from this document…</div></div>';
    const ex = await api("exam/new", { paths: [r.path], n: 10, title: r.name }); ex.questions.length ? take(ex, 0, false) : vDoc(id); };
  $("#fc").onclick = async () => { $("#msg").innerHTML = '<span class="spin"></span> making cards…'; const x = await api("cards/make", { path: r.path, n: 10 });
    $("#msg").innerHTML = `${x.made} cards added to <a class="lime" href="#/cards">${esc(x.deck)}</a>`; };
  $("#tb").onclick = () => { S.teachPath = r.path; location.hash = "#/teach"; };
  $("#ak").onclick = () => { S.askDoc = { path: r.path, name: r.name }; location.hash = "#/ask"; };
}

// ---------- math tutor ----------
function mx(s) {  // text with $inline$ and $$display$$ math -> HTML
  return String(s ?? "").split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g).map((part) => {
    const disp = part.startsWith("$$"), inl = !disp && part.startsWith("$") && part.length > 1;
    if (!disp && !inl) return esc(part);
    const tex = part.slice(disp ? 2 : 1, disp ? -2 : -1);
    try { return window.katex ? katex.renderToString(tex, { displayMode: disp, throwOnError: false }) : esc(tex); } catch (e) { return esc(tex); }
  }).join("");
}
const tex = (t) => { try { return katex.renderToString(String(t), { throwOnError: false }); } catch (e) { return esc(t); } };
async function vMath(sub) {
  if (sub === "placement") return vPlacement();
  if (sub && sub !== "mixed") return vMathTopic(sub);
  if (sub === "mixed") return vMathTopic("mixed");
  const m = shell("math", '<div class="center"><span class="spin"></span><div class="muted" style="text-align:center;line-height:1.7">Loading the math engine…<br>The very first time on a laptop this can take a minute.</div></div>');
  const st = await api("math/state", {});
  if (!st.ok) { m.innerHTML = `<div class="col" style="max-width:700px;gap:14px"><h1>Math</h1><div class="card">${esc(st.error)}</div></div>`; return; }
  const by = {}; st.topics.forEach((t) => (by[t.track] = by[t.track] || []).push(t));
  const done = st.topics.filter((t) => t.mastered).length;
  m.innerHTML = `<div class="col" style="gap:20px;max-width:1000px">
    <div class="row" style="justify-content:space-between"><h1>Math</h1><div class="row"><span class="muted">${done} of ${st.topics.length} topics mastered</span><a class="btn go" href="#/math/mixed">mixed practice</a></div></div>
    ${st.placement_done ? "" : `<div class="card" style="border-color:var(--lime)"><div class="k">Start here</div><div style="font-size:16px">Take the placement quiz: a few problems that get harder until you miss two in a row. Everything below your level unlocks.</div>
      <div class="row"><a class="btn go" href="#/math/placement">start the placement quiz</a><button id="skp">skip, I'll start from the beginning</button></div></div>`}
    ${st.tracks.map((tr) => `<div class="col" style="gap:8px"><div class="k">${esc(tr)}</div><div class="row" style="gap:8px">${(by[tr] || []).sort((a, b) => a.level - b.level).map((t) =>
      t.open ? `<a class="chip ${t.mastered ? "on" : ""}" href="#/math/${t.id}" title="${t.seen ? t.right + " of " + t.seen + " right" : "not started"}">${t.mastered ? "✓ " : ""}${esc(t.name)}</a>`
             : `<span class="chip" style="opacity:.4" title="unlocks after: ${esc(t.pre.map((p) => st.topics.find((o) => o.id === p)?.name).join(", "))}">${esc(t.name)}</span>`).join("")}</div></div>`).join("")}
    <div class="dim" style="font-size:12px">A topic is mastered after 5 right in a row (or 5 of your last 6). Mastering topics unlocks the next ones. Locked topics show what they need when you hover.</div>
    <div><button id="rst" style="height:32px;font-size:12px">reset math progress</button></div></div>`;
  $("#skp") && ($("#skp").onclick = async () => { await api("math/skip_placement", {}); vMath(); });
  $("#rst").onclick = async () => { if (confirm("Reset all math progress?")) { await api("math/reset", {}); vMath(); } };
}
async function vMathTopic(id) {
  const mixed = id === "mixed";
  shell("math", '<div class="center"><span class="spin"></span><div class="muted">Loading…</div></div>');
  const ls = mixed ? null : await api("math/lesson", { id });
  const m = shell("math", `<div class="col" style="gap:18px;max-width:900px">
    <div class="row"><a class="btn" href="#/math">← math</a><h1 style="font-size:28px">${mixed ? "Mixed practice" : esc(ls.name)}</h1>${mixed ? "" : `<span class="chip">${esc(ls.track)}</span>`}</div>
    ${mixed ? '<div class="muted">Random problems from everything you have unlocked, weighted toward what you haven\'t mastered yet.</div>' : `<details class="card" ${ls && !S.mathSeen?.[id] ? "open" : ""} id="lsn"><summary class="k" style="cursor:pointer">Lesson</summary>
      <div class="serif" style="font-size:18px;line-height:1.65;margin-top:8px">${mx(ls.text)}</div>
      <div class="k" style="margin-top:12px">Worked example</div><div style="font-size:17px">${mx(ls.example.q)}</div>
      <ol style="line-height:1.9;margin:6px 0 0 0;padding-left:22px">${ls.example.steps.map((s) => `<li>${mx(s)}</li>`).join("")}</ol></details>`}
    <div class="card" id="pz"></div></div>`);
  S.mathSeen = { ...(S.mathSeen || {}), [id]: 1 };
  let cur = null;
  const next = async () => {
    cur = await api("math/new", { id });
    $("#pz").innerHTML = `<div class="row" style="justify-content:space-between"><div class="k">${mixed ? esc(cur.topic_name) : "Practice"}</div><span class="dim" id="stk" style="font-size:12px"></span></div>
      <div style="font-size:20px;line-height:1.6">${mx(cur.q)}</div>
      <form id="af" class="row"><input id="ans" placeholder="your answer (e.g. 3/4, 2x+1, sqrt(2), 3pi, x<5)" style="flex:1;font-size:16px" autocomplete="off"><button class="go">check</button></form>
      <div class="row"><button id="hn" style="height:34px;font-size:13px">hint</button><button id="sl" style="height:34px;font-size:13px">show solution</button>
        <button id="ak" style="height:34px;font-size:13px">ask Archie about it</button><span id="prev" class="dim" style="font-size:13px"></span></div>
      <div id="fb"></div>`;
    $("#ans").focus();
    $("#ans").oninput = () => { const t = $("#ans").value.trim(); $("#prev").innerHTML = t ? "reads as: " + tex(t.replace(/sqrt\(([^)]*)\)/g, "\\sqrt{$1}").replace(/\*/g, "\\cdot ").replace(/pi/g, "\\pi ")) : ""; };
    $("#hn").onclick = () => { $("#fb").innerHTML = `<div class="muted" style="margin-top:6px">Hint: ${mx(cur.hint)}</div>`; };
    $("#sl").onclick = async () => show(await api("math/reveal", { pid: cur.pid }), true);
    $("#ak").onclick = () => { S.askPrefill = `Help me understand this ${cur.topic_name} problem: ${cur.q.replace(/\$/g, "")}`; location.hash = "#/ask"; };
    $("#af").onsubmit = async (e) => { e.preventDefault(); if (!$("#ans").value.trim()) return; show(await api("math/check", { pid: cur.pid, answer: $("#ans").value }), false); };
  };
  const show = (r, revealed) => {
    $("#fb").innerHTML = `<div class="col" style="gap:8px;margin-top:8px">
      ${revealed ? "" : r.ok ? '<div class="lime" style="font-size:18px">Right ✓</div>' : `<div style="color:var(--bad);font-size:18px">Not quite.</div>${r.note ? `<div class="muted">${esc(r.note)}</div>` : ""}`}
      ${r.ok && !revealed ? "" : `<div>Answer: ${tex(r.ans)}</div>`}
      <details ${r.ok && !revealed ? "" : "open"}><summary class="muted" style="cursor:pointer;font-size:13px">solution</summary><ol style="line-height:1.9;padding-left:22px;margin:6px 0">${r.steps.map((s) => `<li>${mx(s)}</li>`).join("")}</ol></details>
      <div class="row"><button class="go" id="nx">next problem</button>${r.mastered ? '<span class="lime" style="font-size:13px">✓ topic mastered</span>' : `<span class="dim" style="font-size:13px">streak ${r.streak}/5</span>`}</div></div>`;
    $("#af button").disabled = true;
    $("#nx").onclick = next; $("#nx").focus();
  };
  next();
}
async function vPlacement() {
  const m = shell("math", '<div class="center"><span class="spin"></span><div class="muted">Loading…</div></div>');
  let cur = await api("math/placement", { start: true });
  const draw = () => {
    if (cur.done) {
      m.innerHTML = `<div class="center"><h1>Placement done</h1><div class="muted" style="text-align:center;line-height:1.7">${cur.best ? `You're solid through <b>${esc(cur.best)}</b>.` : "We'll start from the beginning."}<br>${cur.known} topics counted as known; the next ones are unlocked.</div><a class="btn go" href="#/math">see your topics</a></div>`;
      return;
    }
    m.innerHTML = `<div class="col" style="gap:18px;max-width:820px"><div class="row" style="justify-content:space-between"><h1 style="font-size:28px">Placement quiz</h1><span class="muted">${cur.step} of up to ${cur.of}</span></div>
      <div class="bar"><div style="width:${Math.round(100 * (cur.step - 1) / cur.of)}%"></div></div>
      <div class="card"><div class="k">${esc(cur.topic_name)}</div><div style="font-size:20px;line-height:1.6">${mx(cur.q)}</div>
      <form id="af" class="row"><input id="ans" placeholder="your answer" style="flex:1;font-size:16px" autocomplete="off"><button class="go">next</button></form>
      <div><button id="idk" style="height:34px;font-size:13px">I don't know this yet</button></div></div>
      <div class="dim" style="font-size:12px">It stops after two misses in a row. No pressure: this just finds where to start.</div></div>`;
    $("#ans").focus();
    $("#af").onsubmit = async (e) => { e.preventDefault(); cur = await api("math/placement", { pid: cur.pid, answer: $("#ans").value }); draw(); };
    $("#idk").onclick = async () => { cur = await api("math/placement", { pid: cur.pid, skip: true }); draw(); };
  };
  draw();
}

// ---------- flashcards ----------
async function vCards() {
  const due = await api("cards/due");
  let i = 0;
  const m = shell("cards", "");
  const draw = (show) => {
    const c = due[i];
    m.innerHTML = `<div class="col" style="gap:18px;max-width:760px"><div class="row" style="justify-content:space-between"><h1>Flashcards</h1><span class="muted">${due.length - i} due</span></div>
      ${c ? `<button type="button" class="flipwrap" id="fl" aria-label="Flip the card"><div class="flip ${show ? "on" : ""}">
          <div class="face card"><div class="k">${esc(c.deck)}</div><div class="fq">${c.fimg ? `<img class="fimg" src="/paper-asset/${esc(c.fimg)}" alt="question">` : ""}${esc(c.front)}</div>
            ${c.hint ? `<div class="fhint" id="fh"><span class="dim" style="font-size:11px">hint</span> <span class="fht" hidden>${esc(c.hint)}</span></div>` : ""}<div class="dim" style="font-size:11px;margin-top:auto">click to flip</div></div>
          <div class="face back card"><div class="k">${esc(c.deck)}</div><div class="fq lime">${c.bimg ? `<img class="fimg" src="/paper-asset/${esc(c.bimg)}" alt="answer">` : ""}${esc(c.back)}</div>${c.hint ? `<div class="dim small" style="text-align:center">${esc(c.hint)}</div>` : ""}<div class="dim" style="font-size:12px;margin-top:auto">${esc(c.front)}</div></div></div></button>
        ${show ? `<div class="row">${["again", "hard", "good", "easy"].map((l, q) => `<button class="${q === 2 ? "go" : ""}" data-q="${q}">${l}</button>`).join("")}</div>` : '<div><button class="go" id="sh">show answer</button></div>'}`
        : `<div class="card">${EMPTY("cards", "All caught up", "Nothing due. Your memory and you are square for today.")}</div>`}
      <form id="nc" class="card"><div class="k">Add a card</div><input id="f" placeholder="front" required><input id="b" placeholder="back" required><div class="row"><input id="d" placeholder="deck (e.g. Robotics)" style="flex:1"><button class="go">add</button></div></form>
      <details class="card" id="mng"><summary class="k" style="cursor:pointer">Edit or delete cards</summary><div id="mbox" class="col" style="gap:8px;margin-top:10px"><span class="dim small">loading…</span></div></details></div>`;
    $("#mng").ontoggle = () => { if ($("#mng").open) manageCards($("#mbox")); };
    const flip = () => { if (show) return; show = true; $("#fl .flip").classList.add("on"); setTimeout(() => draw(true), calm() ? 0 : 420); };
    $("#sh") && ($("#sh").onclick = flip); $("#fl") && ($("#fl").onclick = (e) => { if (e.target.closest("#fh")) { e.stopPropagation(); $("#fh .fht").hidden = false; return; } flip(); });
    m.querySelectorAll("[data-q]").forEach((el) => (el.onclick = async () => { await api("cards/grade", { id: c.id, q: +el.dataset.q }); i++; draw(false); }));
    $("#nc").onsubmit = async (e) => { e.preventDefault(); await api("cards/add", { front: $("#f").value, back: $("#b").value, deck: $("#d").value }); toast("Card added"); vCards(); };
  };
  draw(false);
}

// ---------- delete with a second tap (no pop-up): the button asks "sure?" for a few seconds ----------
function sure(btn, fn, ask = "tap again to delete") {
  btn.onclick = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!btn.dataset.armed) {
      btn.dataset.armed = "1"; btn.dataset.was = btn.innerHTML; btn.classList.add("armed"); btn.textContent = ask;
      clearTimeout(btn._t); btn._t = setTimeout(() => { delete btn.dataset.armed; btn.classList.remove("armed"); btn.innerHTML = btn.dataset.was; }, 3500);
      return;
    }
    clearTimeout(btn._t); btn.disabled = true;
    try { await fn(); } catch (er) { toast(er.message); btn.disabled = false; }
  };
}

// ---------- manage flashcards: edit, move, delete, rename or delete a deck ----------
async function manageCards(box) {
  const all = await api("cards/all", {});
  const decks = {};
  all.forEach((c) => (decks[c.deck || "General"] ||= []).push(c));
  const names = Object.keys(decks).sort((a, b) => a.localeCompare(b));
  box.innerHTML = names.length ? names.map((d) => `<details class="mdeck" data-deck="${esc(d)}"><summary><span class="serif">${esc(d)}</span> <span class="dim small">${decks[d].length} card${decks[d].length === 1 ? "" : "s"}</span></summary>
      <div class="row mdact"><button class="small" data-act="rename">rename deck</button><button class="small del" data-act="deldeck">delete deck</button></div>
      <div class="mlist">${decks[d].map((c) => `<div class="mcard" data-id="${c.id}"><div class="mtext"><div>${c.fimg ? '<span class="chip">picture</span> ' : ""}${esc(c.front)}</div><div class="dim small">${c.bimg ? '<span class="chip">picture</span> ' : ""}${esc(c.back)}${c.hint ? ` · hint: ${esc(c.hint)}` : ""}</div></div>
        <div class="row mbtn"><button class="small" data-act="edit" aria-label="edit card">edit</button><button class="small del" data-act="del" aria-label="delete card">delete</button></div></div>`).join("")}</div></details>`).join("")
    : `<div class="dim small">No cards yet.</div>`;
  const redraw = (open) => manageCards(box).then(() => open && box.querySelector(`details[data-deck="${CSS.escape(open)}"]`)?.setAttribute("open", ""));
  box.querySelectorAll(".mdeck").forEach((det) => {
    const deck = det.dataset.deck;
    sure(det.querySelector('[data-act="deldeck"]'), async () => { const r = await api("cards/delete", { deck }); toast(`Deleted ${r.deleted} card${r.deleted === 1 ? "" : "s"}`); redraw(); }, `delete all ${decks[deck].length}?`);
    det.querySelector('[data-act="rename"]').onclick = () => {
      const row = det.querySelector(".mdact");
      row.innerHTML = `<input class="rn" value="${esc(deck)}" maxlength="60" style="max-width:240px"><button class="small go">save</button><button class="small">cancel</button>`;
      const inp = row.querySelector("input"); inp.focus(); inp.select();
      const save = async () => { await api("cards/rename", { deck, to: inp.value }); redraw(inp.value.trim()); };
      row.querySelector(".go").onclick = save; inp.onkeydown = (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") redraw(deck); };
      row.querySelectorAll("button")[1].onclick = () => redraw(deck);
    };
    det.querySelectorAll(".mcard").forEach((row) => {
      const c = all.find((x) => x.id === row.dataset.id);
      sure(row.querySelector('[data-act="del"]'), async () => { await api("cards/delete", { ids: [c.id] }); row.remove(); toast("Card deleted"); if (!det.querySelector(".mcard")) redraw(); }, "sure?");
      row.querySelector('[data-act="edit"]').onclick = () => {
        row.innerHTML = `<form class="col medit" style="gap:6px;flex:1"><input name="front" value="${esc(c.front || "")}" placeholder="front"><input name="back" value="${esc(c.back || "")}" placeholder="back">
          <div class="row"><input name="hint" value="${esc(c.hint || "")}" placeholder="hint (optional)" style="flex:1"><input name="deck" value="${esc(c.deck || "")}" placeholder="deck" style="width:160px" list="mdecks"></div>
          <datalist id="mdecks">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
          <div class="row"><button class="small go">save</button><button type="button" class="small">cancel</button></div></form>`;
        const fm = row.querySelector("form"); fm.front.focus();
        fm.onsubmit = async (e) => { e.preventDefault(); await api("cards/edit", { id: c.id, front: fm.front.value, back: fm.back.value, hint: fm.hint.value, deck: fm.deck.value || deck }); toast("Saved"); redraw(fm.deck.value || deck); };
        fm.querySelector('button[type="button"]').onclick = () => redraw(deck);
      };
    });
  });
}

// ---------- settings ----------
async function vSettings() {
  const st = await (await fetch("/api/state")).json();
  const me = await api("settings/get", {});
  const m = shell("settings", `<div class="col" style="gap:18px;max-width:640px"><h1>Settings</h1>
    <div class="card"><div class="k">You</div><label class="muted small" for="nm">Your name, for the greeting</label>
      <div class="row"><input id="nm" maxlength="40" value="${esc(me.name || "")}" placeholder="leave empty for no name" style="max-width:260px"><button id="nms">save</button></div></div>
    <div class="card"><div class="k">Model</div><div>${st.model === "missing" ? "Not on this stick. Exams fall back to fill-the-blank questions from your notes." : "Offline model: " + esc(st.model)}</div>
      ${st.model !== "missing" ? '<div><button id="mr">restart the model</button></div>' : ""}
      ${(st.llm_log || []).length ? `<details ${st.model === "failed" ? "open" : ""}><summary class="muted" style="cursor:pointer;font-size:12px">engine output (screenshot this if the model won't start)</summary><pre style="white-space:pre-wrap;font-size:11px;color:var(--muted);max-height:300px;overflow:auto">${esc(st.llm_log.join("\n"))}</pre></details>` : ""}</div>
    <div class="card"><div class="k">Saved quotes</div><textarea id="sq" spellcheck="false" style="min-height:140px;font-size:13px" placeholder="Hit the star under a quote on the lock screen."></textarea>
      <div class="row" id="qhrow"></div>
      <div class="row"><button id="sqs">save changes</button><span class="dim" style="font-size:11px">plain text · one per line · delete a line to remove it</span></div></div>
    <form id="pw" class="card"><div class="k">Change password</div><input id="o" type="password" placeholder="current password"><input id="n1" type="password" placeholder="new password"><input id="n2" type="password" placeholder="new password again"><div><button class="go">change</button></div><div class="err" id="err"></div></form>
    <div class="card about"><div class="k">About</div>
      <div class="row" style="gap:14px;align-items:center">${FEATHER(34)}<div><div class="serif" style="font-size:22px">Feather ${esc(me.version)}</div>
        <div class="muted small">A study companion that lives on a USB stick. Encrypted, offline, yours.</div></div></div>
      <details><summary>What's in 1.0</summary><ul class="small soft">
        <li>Paper: pen, finger or stylus notebooks, an endless canvas, flipbooks, PDF and picture import, sticky notes, searchable handwriting</li>
        <li>Flashcards with spaced review, Q/A lasso cards from your pages, hints</li>
        <li>Ask, mock exams, study sessions and teach-it-back on an offline model</li>
        <li>Math tutor, reading log, the Vault (offline libraries), World news snapshot</li>
        <li>Ctrl+K search, dictionary, mastery map, curiosity card</li>
        <li>PC sync to Obsidian with encrypted backups, demo mode</li></ul></details>
      <details><summary>Credits and licences</summary><ul class="small soft">
        <li>pdf.js (Mozilla, Apache 2.0) · KaTeX (MIT) · gifenc (Matt DesLauriers, MIT)</li>
        <li>Fonts under the SIL Open Font License</li>
        <li>Offline model: Qwen2.5 3B Instruct (Apache 2.0) run by llama.cpp (MIT)</li>
        <li>Vault reading via libzim (GPL 2.0) and Kiwix ZIM files (each under its own licence, e.g. Wikipedia CC BY-SA)</li>
        <li>Encryption by the Python cryptography library (Apache 2.0 / BSD)</li>
        <li>Quotes from public-domain and openly licensed collections</li></ul></details>
      <div class="row"><button id="tour">show the tour again</button>${me.demo ? '<span class="demochip">demo · sample data</span>' : ""}</div></div>
    <div><button id="lk">lock now</button></div></div>`);
  $("#nms").onclick = async () => { await api("settings/set", { name: $("#nm").value }); toast("Saved"); };
  $("#nm").onkeydown = (e) => { if (e.key === "Enter") $("#nms").click(); };
  $("#tour").onclick = () => { location.hash = "#/home"; setTimeout(() => tour(true), 500); };
  $("#pw").onsubmit = async (e) => {
    e.preventDefault();
    if ($("#n1").value !== $("#n2").value) return ($("#err").textContent = "New passwords don't match.");
    try { const r = await api("password", { old: $("#o").value, new: $("#n1").value }); toast(r.note); } catch (er) { $("#err").textContent = er.message; }
  };
  $("#lk").onclick = async () => { await api("lock", {}); location.hash = "#/unlock"; };
  api("quotes").then((r) => { $("#sq").value = r.text || ""; });
  fetch("/api/quotes/hidden", { method: "POST" }).then((r) => r.json()).then((h) => {
    const n = h.q.length + h.who.length; if (!n) return;
    $("#qhrow").innerHTML = `<span class="dim small">Hidden: ${h.q.length} quote${h.q.length === 1 ? "" : "s"}${h.who.length ? ` and everything by ${h.who.map(esc).join(", ")}` : ""}</span><button class="small" id="qhr">show them again</button>`;
    $("#qhr").onclick = async () => { QHID = await (await fetch("/api/quotes/hide", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"reset":true}' })).json(); $("#qhrow").innerHTML = ""; toast("Hidden quotes are back"); };
  });
  $("#sqs").onclick = async () => { await api("quotes/set", { text: $("#sq").value }); toast("Saved"); };
  $("#mr") && ($("#mr").onclick = async () => { await api("model/restart", {}); toast("Restarting the model…"); setTimeout(vSettings, 3000); });
}

// ---------- first-run tour ----------
const TOUR = [
  ["#today, .today, #bnr", "Today", "Your day at a glance: cards due, streaks and what's next. Tap any of it to jump straight there."],
  ['nav a[href="#/paper"]', "Paper", "Write with a pen, finger or stylus. Notebooks, an endless canvas and flipbooks. Your handwriting becomes searchable."],
  [null, "Ctrl + K", "Search everything from anywhere: notes, cards, books, Paper pages and the Vault. Type define: and a word for the dictionary."],
  ["#ej, .eject, nav .foot", "Eject", "Always eject before you unplug. Plug into your PC and it syncs to Obsidian by itself, with an encrypted backup."],
];
function tour(again) {
  document.querySelectorAll(".tourw").forEach((x) => x.remove());
  let i = 0;
  const w = document.createElement("div");
  w.className = "tourw";
  w.innerHTML = '<div class="tourring"></div><div class="tourcard" role="dialog" aria-modal="true" aria-labelledby="tourh"></div>';
  document.body.appendChild(w);
  const ring = w.querySelector(".tourring"), card = w.querySelector(".tourcard");
  const done = () => { w.remove(); document.removeEventListener("keydown", key); if (!again) api("settings/set", { toured: true }).catch(() => {}); };
  const key = (e) => { if (e.key === "Escape") done(); else if (e.key === "ArrowRight") next(); };
  const next = () => (i < TOUR.length - 1 ? (i++, draw()) : done());
  function draw() {
    const [sel, h, p] = TOUR[i];
    const el = sel && sel.split(",").map((x) => document.querySelector(x.trim())).find((x) => x && x.offsetParent);
    if (el) { const r = el.getBoundingClientRect(); Object.assign(ring.style, { display: "block", left: r.left - 6 + "px", top: r.top - 6 + "px", width: r.width + 12 + "px", height: r.height + 12 + "px" }); }
    else ring.style.display = "none";
    card.innerHTML = `<div class="dim small">${i + 1} of ${TOUR.length}</div><h2 id="tourh" class="serif">${h}</h2><p class="soft">${p}</p>
      <div class="row" style="justify-content:space-between"><button class="tsk">skip</button><button class="go tnx">${i === TOUR.length - 1 ? "start" : "next"}</button></div>`;
    if (el) { const r = el.getBoundingClientRect(), cw = 340; let x = r.right + 18, y = r.top; if (x + cw > innerWidth - 16) { x = Math.max(16, Math.min(innerWidth - cw - 16, r.left)); y = r.bottom + 18; } if (y + 220 > innerHeight) y = Math.max(16, r.top - 230); Object.assign(card.style, { left: x + "px", top: y + "px", transform: "none" }); }
    else Object.assign(card.style, { left: "50%", top: "40%", transform: "translate(-50%,-50%)" });
    card.querySelector(".tsk").onclick = done;
    card.querySelector(".tnx").onclick = next;
    card.querySelector(".tnx").focus();
  }
  document.addEventListener("keydown", key);
  draw();
}

// ---------- router ----------
async function route() {
  const [_, v, a] = location.hash.split("/");
  try {
    if (!v || v === "unlock") { if (document.querySelector("#lockroot")) return; return await vUnlock(); }  // already showing: keep what you've typed
    const views = { home: vHome, math: () => vMath(a), docs: () => vDocs(a), paper: () => (window.vPaper ? vPaper(a, location.hash.split("/")[3]) : vHome()), ask: vAsk, vault: () => vVault(a, location.hash.split("/").slice(3).join("/")), world: () => vWorld(a), reading: vReading, book: () => vBook(a), review: () => vReview(a), exam: vExam, study: vStudy, teach: vTeach, cards: vCards, settings: vSettings, read: () => (window.vRead ? vRead(a, location.hash.split("/")[3]) : vDocs()), note: () => vNote(location.hash.split("/").slice(2).join("/")), mastery: () => vMastery() };
    await (views[v] || vHome)();
  } catch (e) { if (e.message !== "locked") toast(e.message); }
}
window.onhashchange = route;
route();
