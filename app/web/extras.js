// ---------- Feather extras: dictionary, Ctrl+K search, quote collector, Q/A flashcard sets, mastery map, note viewer ----------

// ===== dictionary: double-click any word =====
const DICT = { el: null };
function dictClose() { if (DICT.el) { DICT.el.remove(); DICT.el = null; } }
async function dictShow(word, x, y) {
  word = (word || "").trim().replace(/[^\p{L}'-]/gu, "");
  if (!word || word.length < 2 || word.length > 40) return;
  dictClose();
  const el = DICT.el = document.createElement("div");
  el.className = "dict"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Definition of " + word);
  el.innerHTML = `<div class="dw">${esc(word)}</div><div class="muted small"><span class="spin"></span> looking it up…</div>`;
  document.body.appendChild(el);
  const place = () => { const r = el.getBoundingClientRect(); el.style.left = Math.max(10, Math.min(innerWidth - r.width - 10, x - r.width / 2)) + "px"; el.style.top = (y + 18 + r.height > innerHeight - 10 ? y - r.height - 14 : y + 18) + "px"; };
  place();
  try {
    const d = await api("define", { word });
    if (DICT.el !== el) return;
    el.innerHTML = `<div class="row" style="justify-content:space-between;align-items:baseline"><div class="dw">${esc(d.word)}</div><button class="dx" aria-label="close">×</button></div>
      ${d.senses.map((s) => `<div class="dpos">${esc(s.pos)}</div><ol>${s.defs.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>`).join("")}
      <a class="act small" href="#/vault/a/${esc(d.book)}/${encodeURIComponent(d.path)}">open in the Vault →</a>`;
  } catch (e) {
    if (DICT.el !== el) return;
    el.innerHTML = `<div class="dw">${esc(word)}</div><div class="muted small">${esc(e.message === "locked" ? "Unlock Feather first." : e.message)}</div>`;
  }
  el.querySelector(".dx")?.addEventListener("click", dictClose);
  place();
}
// hook a document (the app, or a Vault page inside its frame) up to the dictionary
function dictHook(doc, frame) {
  doc.addEventListener("dblclick", (e) => {
    if (e.target.closest && e.target.closest("input,textarea,canvas,button,.dict")) return;
    const sel = doc.getSelection(), w = sel ? sel.toString() : "";
    if (!w || /\s/.test(w.trim())) return;
    let x = e.clientX, y = e.clientY;
    if (frame) { const r = frame.getBoundingClientRect(); x += r.left; y += r.top; }
    dictShow(w, x, y);
  });
  doc.addEventListener("pointerdown", (e) => { if (DICT.el && !(e.target.closest && e.target.closest(".dict"))) dictClose(); });
}
dictHook(document);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") dictClose(); });

// ===== quote collector + Q/A capture for text: watch selections in a reader =====
// opts: { source: () => "title", frame: iframe element or null }
function readerHook(doc, opts) {
  const chip = document.createElement("button");
  chip.className = "qchip"; chip.type = "button"; chip.hidden = true;
  chip.innerHTML = '<span aria-hidden="true">❝</span> save quote';
  document.body.appendChild(chip);
  let text = "";
  const hide = () => { chip.hidden = true; };
  doc.addEventListener("pointerup", () => setTimeout(() => {
    const sel = doc.getSelection(), t = sel ? sel.toString().replace(/\s+/g, " ").trim() : "";
    if (!t || t.length < 2) return hide();
    if (QA.mode) { QA.take({ text: t.slice(0, 1500) }); sel.removeAllRanges(); return hide(); }  // the Q / A bar is waiting for this
    if (t.length < 12 || t.length > 400 || !sel.rangeCount) return hide();
    const r = sel.getRangeAt(0).getBoundingClientRect(), off = opts.frame ? opts.frame.getBoundingClientRect() : { left: 0, top: 0 };
    text = t; chip.hidden = false;
    chip.style.left = Math.max(10, Math.min(innerWidth - 150, off.left + r.left + r.width / 2 - 60)) + "px";
    chip.style.top = Math.max(10, off.top + r.top - 42) + "px";
  }, 10));
  doc.addEventListener("pointerdown", (e) => { if (e.target !== chip) hide(); });
  doc.addEventListener("scroll", hide, { passive: true });
  chip.onclick = async () => {
    hide();
    const src = (opts.source && opts.source()) || "";
    await api("quotes/add", { text: `"${text.replace(/"/g, "'")}"${src ? ` (${src})` : ""}` });
    toast("Quote saved · it can show up on the lock screen and banner");
  };
  const gone = () => { if (!document.body.contains(opts.frame || doc.body)) { chip.remove(); window.removeEventListener("hashchange", gone); } };
  window.addEventListener("hashchange", () => setTimeout(gone, 50));
}

// ===== Q / A flashcard sets =====
// A bar with Q and A. Tap Q, capture the question (lasso in Paper, select text in readers), then A for the answer. Repeat. Then make the set.
const QA = {
  mode: null, pairs: [], bar: null, onMode: null,
  open(host, onMode) {  // host: an element to put the bar after; onMode(mode): Paper switches to the lasso
    this.close();
    this.onMode = onMode || null; this.pairs = []; this.mode = null;
    const bar = this.bar = document.createElement("div");
    bar.className = "qabar"; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Make flashcards");
    host.insertAdjacentElement("afterend", bar);
    this.draw();
  },
  close() { const had = !!this.bar; if (this.bar) this.bar.remove(); this.bar = null; this.mode = null; if (had && this.onMode) this.onMode(null); this.onMode = null; },
  set(mode) { this.mode = this.mode === mode ? null : mode; if (this.onMode) this.onMode(this.mode); this.draw(); },
  take(item) {
    if (!this.mode) return;
    let last = this.pairs[this.pairs.length - 1];
    if (this.mode === "q") { if (!last || last.q) { last = {}; this.pairs.push(last); } last.q = item; this.mode = "a"; }
    else { if (!last || last.a) { last = {}; this.pairs.push(last); } last.a = item; this.mode = "q"; }
    if (this.onMode) this.onMode(this.mode);
    this.draw();
  },
  prev(it) { return it ? (it.preview ? `<img src="${it.preview}" alt="">` : `<span>${esc(it.text.slice(0, 40))}${it.text.length > 40 ? "…" : ""}</span>`) : '<span class="dim">…</span>'; },
  draw() {
    const b = this.bar; if (!b) return;
    const done = this.pairs.filter((p) => p.q && p.a).length;
    b.innerHTML = `<span class="k">Flashcards</span>
      <button class="qab ${this.mode === "q" ? "on" : ""}" data-m="q" title="then lasso or select the question">Q</button>
      <button class="qab ${this.mode === "a" ? "on" : ""}" data-m="a" title="then lasso or select the answer">A</button>
      <span class="qahint dim small">${this.mode === "q" ? "now lasso or select the question" : this.mode === "a" ? "now lasso or select the answer" : "tap Q to start a card"}</span>
      <span class="qapairs">${this.pairs.map((p, i) => `<span class="qap" title="card ${i + 1}">${this.prev(p.q)}<i>→</i>${this.prev(p.a)}<button data-del="${i}" aria-label="remove card ${i + 1}">×</button></span>`).join("")}</span>
      <button class="go qamake" ${done ? "" : "disabled"}>make ${done || ""} card${done === 1 ? "" : "s"}</button><button class="qax" aria-label="close the flashcard bar">×</button>`;
    b.querySelectorAll(".qab").forEach((x) => (x.onclick = () => this.set(x.dataset.m)));
    b.querySelectorAll("[data-del]").forEach((x) => (x.onclick = () => { this.pairs.splice(+x.dataset.del, 1); this.draw(); }));
    b.querySelector(".qax").onclick = () => this.close();
    b.querySelector(".qamake").onclick = () => this.finish();
  },
  async finish() {
    const pairs = this.pairs.filter((p) => p.q && p.a); if (!pairs.length) return;
    const decks = await api("cards/decks").catch(() => []);
    const m = document.createElement("div"); m.className = "modal"; m.setAttribute("role", "dialog");
    const opts = (sel) => `<option value="__set" ${sel ? "selected" : ""}>this set (new deck)</option>${decks.map(([d, n]) => `<option value="${esc(d)}">${esc(d)} · ${n}</option>`).join("")}`;
    m.innerHTML = `<div class="mbox col" style="gap:14px"><h2 class="hd" style="font-size:22px">New flashcard set</h2>
      <label class="col" style="gap:6px"><span class="k">Set name</span><input id="qaname" placeholder="e.g. Photosynthesis" autocomplete="off"></label>
      <div class="qalist">${pairs.map((p, i) => `<div class="qarow"><div class="qaside">${this.prev(p.q)}</div><div class="qaside">${this.prev(p.a)}</div>
        <div class="col" style="gap:6px;min-width:220px"><select data-deck="${i}" aria-label="deck for card ${i + 1}">${opts(true)}</select><input data-hint="${i}" placeholder="note or hint (optional)" autocomplete="off"></div></div>`).join("")}</div>
      <div class="row" style="justify-content:flex-end"><button id="qacancel">cancel</button><button class="go" id="qaok">add ${pairs.length} card${pairs.length === 1 ? "" : "s"}</button></div></div>`;
    document.body.appendChild(m); $("#qaname").focus();
    $("#qacancel").onclick = () => m.remove();
    $("#qaok").onclick = async () => {
      const name = $("#qaname").value.trim() || "New set";
      const cards = pairs.map((p, i) => {
        const deck = m.querySelector(`[data-deck="${i}"]`).value;
        return { front: p.q.text || "", fimg: p.q.img || null, back: p.a.text || "", bimg: p.a.img || null, deck: deck === "__set" ? name : deck, hint: m.querySelector(`[data-hint="${i}"]`).value };
      });
      const r = await api("cards/addmany", { name, cards });
      m.remove(); this.pairs = []; this.mode = null; this.draw(); if (this.onMode) this.onMode(null);
      toast(`${r.made} card${r.made === 1 ? "" : "s"} added · review them in Flashcards`);
    };
  },
};
window.addEventListener("hashchange", () => QA.close());

// ===== Ctrl+K: search everything =====
const CK = { el: null, t: null, items: [], i: 0, seq: 0, last: null, q: "" };
const CK_STATIC = () => [...NAV.filter(([k]) => k !== "-").map(([k, l]) => ({ g: "Go to", t: l, href: "#/" + k })), { g: "Go to", t: "Mastery map", href: "#/mastery" }, { g: "Go to", t: "Settings", href: "#/settings" },
  { g: "Do", t: "New notebook or canvas", href: "#/paper" }, { g: "Do", t: "Review flashcards", href: "#/cards" }, { g: "Do", t: "Lock Feather", run: async () => { await api("lock", {}); location.hash = "#/unlock"; } }];
function ckOpen() {
  if (CK.el || location.hash.startsWith("#/unlock") || !location.hash || $("#lockroot")) return;
  const el = CK.el = document.createElement("div"); el.className = "ck"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Search everything");
  el.innerHTML = `<div class="ckbox"><div class="ckin"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
    <input id="ckq" placeholder="Search notes, documents, Paper, flashcards, math, the Vault…" autocomplete="off" spellcheck="false" aria-label="Search"><kbd>esc</kbd></div><div class="ckres" id="ckres" role="listbox"></div></div>`;
  document.body.appendChild(el);
  el.addEventListener("pointerdown", (e) => { if (e.target === el) ckClose(); });
  const q = $("#ckq"); q.focus();
  q.oninput = () => { clearTimeout(CK.t); ckDraw(q.value, CK.last && q.value.toLowerCase().startsWith(CK.q.toLowerCase()) ? CK.last : null, true); CK.t = setTimeout(() => ckFetch(q.value), 110); };
  q.onkeydown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); CK.i = Math.max(0, Math.min(CK.items.length - 1, CK.i + (e.key === "ArrowDown" ? 1 : -1))); ckMark(); }
    else if (e.key === "Enter") { e.preventDefault(); ckGo(CK.items[CK.i]); }
    else if (e.key === "Escape") ckClose();
  };
  ckDraw("", null);
}
function ckClose() { if (CK.el) CK.el.remove(); CK.el = null; }
// two quick rounds: your own stuff first (instant), then the Vault titles; older answers never overwrite newer ones
async function ckFetch(q) {
  if (q.trim().length < 2) return;
  const n = ++CK.seq;
  try {
    const mine = await api("search", { q, vault: false });
    if (!CK.el || n !== CK.seq) return;
    CK.last = mine; CK.q = q; ckDraw(q, mine, true);
    const vlt = await api("search", { q, vault: true });
    if (!CK.el || n !== CK.seq) return;
    CK.last = vlt; ckDraw(q, vlt, false);
  } catch (e) {}
}
function ckDraw(q, r, more) {
  const ql = q.trim().toLowerCase(), items = [];
  CK_STATIC().filter((s) => !ql || s.t.toLowerCase().includes(ql)).slice(0, ql ? 4 : 8).forEach((s) => items.push(s));
  if (r) {
    (r.notes || []).forEach((n) => items.push({ g: "Notes", t: n.name, s: n.snip, href: "#/note/" + encodeURIComponent(n.path) }));
    (r.docs || []).forEach((n) => items.push({ g: "Documents", t: n.name, s: n.snip, href: (n.book ? "#/read/" : "#/docs/") + n.id }));
    (r.paper || []).forEach((n) => items.push({ g: "Paper", t: n.title + (n.page ? ` · page ${n.page}` : ""), s: n.snip || (n.kind === "canvas" ? "canvas" : n.kind === "flip" ? "flipbook" : "notebook"), href: `#/paper/${n.nb}${n.pid ? "/" + n.pid : ""}` }));
    (r.cards || []).forEach((n) => items.push({ g: "Flashcards", t: n.front, s: n.deck, href: "#/cards" }));
    (r.math || []).forEach((n) => items.push({ g: "Math", t: n.name, href: "#/math/" + n.id }));
    (r.vault || []).forEach((n) => items.push({ g: "Vault", t: n.title, s: n.name, href: `#/vault/a/${n.book}/${encodeURIComponent(n.path)}` }));
  }
  const keep = CK.items[CK.i] && items.findIndex((x) => x.href === CK.items[CK.i].href && x.t === CK.items[CK.i].t);
  CK.items = items; CK.i = keep > 0 ? keep : 0;  // the highlight stays put while results fill in
  let g = "";
  $("#ckres").innerHTML = items.map((it, i) => `${it.g !== g ? `<div class="ckg">${esc((g = it.g))}</div>` : ""}<button class="cki" role="option" data-i="${i}"><span>${esc(it.t)}</span>${it.s ? `<span class="dim small">${esc(it.s)}</span>` : ""}</button>`).join("")
    + (q.trim().length >= 2 && more ? '<div class="ckg ckmore"><span class="spin"></span> searching the Vault…</div>' : "") + (r && !more && items.length === 0 ? '<div class="muted small" style="padding:14px">Nothing found.</div>' : "");
  $("#ckres").querySelectorAll(".cki").forEach((b) => { b.onclick = () => ckGo(CK.items[+b.dataset.i]); b.onmousemove = () => { CK.i = +b.dataset.i; ckMark(); }; });
  ckMark();
}
function ckMark() { CK.el?.querySelectorAll(".cki").forEach((b) => { const on = +b.dataset.i === CK.i; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); if (on) b.scrollIntoView({ block: "nearest" }); }); }
function ckGo(it) { if (!it) return; ckClose(); if (it.run) it.run(); else location.hash = it.href; }
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); CK.el ? ckClose() : ckOpen(); } });

// ===== a note, opened from search =====
async function vNote(enc) {
  const path = decodeURIComponent(enc || ""), n = await api("note", { path });
  const name = path.split("/").pop().replace(/\.md$/, "");
  const m = shell("ask", `<div class="col" style="gap:12px;height:100%">
    <div class="row" style="justify-content:space-between"><div class="row"><a class="btn" href="javascript:history.back()">← back</a><span class="serif" style="font-size:20px">${esc(name)}</span></div>
      <div class="row">${readBar()}<span class="rsep"></span><button id="qaopen">flashcards</button></div></div>
    <div class="rframe" style="flex:1"><div class="rprog"><i id="rp"></i></div><div id="rd" class="reader">${(n.text || "(empty)").split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("")}</div></div></div>`);
  const rd = $("#rd");
  dropCap(rd); wireReadBar((t, s) => { rd.dataset.theme = t; rd.style.fontSize = s + "px"; });
  const prog = () => { const h = rd.scrollHeight - rd.clientHeight; $("#rp").style.width = (h > 0 ? 100 * rd.scrollTop / h : 100) + "%"; }; rd.addEventListener("scroll", prog, { passive: true }); prog();
  readerHook(document, { source: () => name });
  $("#qaopen").onclick = () => (QA.bar ? QA.close() : QA.open(m.querySelector(".row")));
}

// ===== mastery map =====
async function vMastery() {
  const M = await api("mastery");
  const shade = (s) => `color-mix(in srgb, var(--lime) ${Math.round(12 + s * 78)}%, var(--panel2))`;
  const tracks = {};
  for (const t of M.math) (tracks[t.track || "Math"] = tracks[t.track || "Math"] || []).push(t);
  const m = shell("mastery", `<div class="col" style="gap:20px;max-width:1100px">
    <div class="row" style="justify-content:space-between;align-items:baseline"><h1>Mastery</h1><span class="muted small">Brighter is stronger. Tap anything to practise it.</span></div>
    <div class="mlegend"><span>new</span><i style="background:${shade(0)}"></i><i style="background:${shade(0.33)}"></i><i style="background:${shade(0.66)}"></i><i style="background:${shade(1)}"></i><span>mastered</span></div>
    <section class="card"><h2 class="hd">Math</h2>${Object.entries(tracks).map(([tr, L]) => `<div class="mtrack"><div class="k">${esc(tr)}</div><div class="mtiles">${L.map((t) => `<a class="mtile ${t.open ? "" : "locked"}" href="#/math/${t.id}" style="background:${shade(t.s)};${t.s > 0.55 ? "color:#0c0d0b" : ""}" title="${esc(t.name)}${t.mastered ? " · mastered" : t.open ? "" : " · not unlocked yet"}"><span>${esc(t.name)}</span></a>`).join("")}</div></div>`).join("") || '<div class="muted small">Open Math to start.</div>'}</section>
    <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <section class="card"><h2 class="hd">Flashcard decks</h2>${M.decks.length ? M.decks.map((d) => `<a class="mrow" href="#/cards"><span>${esc(d.name)}</span><span class="mbar"><i style="width:${Math.round(d.s * 100)}%;background:${shade(d.s)}"></i></span><span class="dim small">${d.due ? d.due + " due" : d.n + " cards"}</span></a>`).join("") : '<div class="muted small">No decks yet.</div>'}</section>
      <section class="card"><h2 class="hd">Notes you've been tested on</h2>${M.notes.length ? M.notes.map((d) => `<a class="mrow" href="#/teach"><span>${esc(d.name)}</span><span class="mbar"><i style="width:${Math.round(d.s * 100)}%;background:${shade(d.s)}"></i></span><span class="dim small">${d.n} check${d.n === 1 ? "" : "s"}</span></a>`).join("") : '<div class="muted small">Mock exams and Teach it back fill this in.</div>'}</section>
    </div></div>`);
}

// ===== today's curiosity (Home) =====
async function curiosity(el) {
  if (!el) return;
  try {
    const a = await api("curious");
    if (!a.title) return el.remove();
    el.innerHTML = `<h2 class="hd">Today's curiosity</h2><div class="serif" style="font-size:22px;line-height:1.2">${esc(a.title)}</div>
      <div class="muted small" style="line-height:1.6">${esc(a.teaser)}</div><a class="act" href="#/vault/a/${esc(a.book)}/${encodeURIComponent(a.path)}">Read it →</a>`;
  } catch (e) { el.remove(); }
}
