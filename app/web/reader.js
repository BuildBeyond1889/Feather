// ---------- the reader: books from Documents in chapters, with your place, highlights, notes and find ----------
// Highlights are stored by paragraph and character: {ch, a, oa, b, ob} = from paragraph a, offset oa to paragraph b, offset ob.
const HL = ["#f5d76e", "#b7e35a", "#ff9d8f", "#8fbfff"];  // yellow, green, red, blue (drawn see-through over the text)
const HL_NAMES = ["yellow", "green", "red", "blue"];

async function vRead(id, chArg) {
  let B;
  try { B = await api("reader/open", { id }); } catch (e) { toast(e.message); location.hash = "#/docs"; return; }
  let ch = chArg !== undefined && chArg !== "" ? +chArg : B.pos.ch || 0, C = null, saveT = null, side = RM.get().rside || "toc";
  const total = B.lens.reduce((a, b) => a + b, 0) || 1, before = (i) => B.lens.slice(0, i).reduce((a, b) => a + b, 0);
  const m = shell("docs", `<div class="rdr ${RM.get().rtoc === 0 ? "notoc" : ""}" id="rdr">
    <aside class="rside" aria-label="Book">
      <div class="rtabs" role="tablist">${[["toc", "Contents"], ["marks", "Highlights"], ["find", "Find"]].map(([k, l]) => `<button role="tab" data-side="${k}">${l}</button>`).join("")}</div>
      <div class="rsbody" id="rsb"></div></aside>
    <section class="rmain">
      <div class="rtop">
        <button class="rtg rtgw" id="rtg" aria-label="hide the side panel"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg><span id="rtgl">hide panel</span></button>
        <div class="rtitle"><a href="#/docs" class="muted small">← documents</a><span class="serif">${esc(B.title)}</span>${B.author ? `<span class="muted small">${esc(B.author)}</span>` : ""}</div>
        <div class="row" style="gap:8px;flex-wrap:nowrap"><span class="dim small num" id="rpct"></span>${readBar()}<button class="rtg" id="rfs" title="full screen (F) · Esc to leave" aria-label="full screen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button></div></div>
      <div class="rframe"><div class="rprog"><i id="rp"></i></div><div id="rd" class="reader book" tabindex="0"></div></div>
    </section></div>`);
  const rd = $("#rd");
  wireReadBar((t, s) => { rd.dataset.theme = t; rd.style.fontSize = s + "px"; });
  if (window.dictHook) dictHook(document, rd);
  // full screen: just the page, the bar fades in when the mouse moves near the top
  const setFull = async (on) => {
    const keep = C ? firstVisible() : 0;
    document.body.classList.toggle("rfull", on);
    setTimeout(() => { const p = rd.querySelector(`p[data-i="${keep}"]`); if (p && keep) rd.scrollTop = p.offsetTop - 30; }, 120);
    try { if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen(); else if (!on && document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
    $("#rfs").classList.toggle("on", on); prog();
  };
  $("#rfs").onclick = () => setFull(!document.body.classList.contains("rfull"));
  const fsChange = () => { if (!document.fullscreenElement && document.body.classList.contains("rfull")) setFull(false); };
  document.addEventListener("fullscreenchange", fsChange);
  let hideT = null;
  const peek = (e) => { if (!document.body.classList.contains("rfull")) return; const near = e.clientY < 90; document.body.classList.toggle("rpeek", near); clearTimeout(hideT); if (near) hideT = setTimeout(() => document.body.classList.remove("rpeek"), 2500); };
  document.addEventListener("pointermove", peek);
  const panel = (show) => {  // contents, highlights and find: shown or tucked away (C)
    const keep = C ? firstVisible() : 0, hide = show === undefined ? !$("#rdr").classList.contains("notoc") : !show;
    $("#rdr").classList.toggle("notoc", hide); RM.set({ rtoc: hide ? 0 : 1 });
    $("#rtgl").textContent = hide ? "contents" : "hide panel"; $("#rtg").title = (hide ? "show contents, highlights and find" : "hide contents, highlights and find") + " (C)";
    $("#rtg").setAttribute("aria-label", hide ? "show the side panel" : "hide the side panel"); $("#rtg").classList.toggle("on", !hide);
    if (C) setTimeout(() => { const p = rd.querySelector(`p[data-i="${keep}"]`); if (p && keep) rd.scrollTop = p.offsetTop - 30; prog(); }, 30);
  };
  $("#rtg").onclick = () => panel();
  panel(RM.get().rtoc !== 0);

  // ----- side panel: contents, highlights, find -----
  function drawSide() {
    m.querySelectorAll("[data-side]").forEach((b) => { b.classList.toggle("on", b.dataset.side === side); b.setAttribute("aria-selected", b.dataset.side === side); });
    const sb = $("#rsb");
    if (side === "toc") {
      let lastTop = "";
      sb.innerHTML = `<div class="rtoc">${B.toc.map((t, i) => {
        const [top, sub] = t.includes(" · ") ? t.split(" · ") : ["", t];
        const head = top && top !== lastTop ? `<div class="rtop1">${esc(top)}</div>` : ""; if (top) lastTop = top;
        const n = B.marks.filter((x) => x.ch === i).length;
        return `${head}<button class="rti ${i === ch ? "on" : ""}" data-ch="${i}">${esc(sub)}${n ? `<span class="rtn">${n}</span>` : ""}</button>`;
      }).join("")}</div>`;
      sb.querySelectorAll(".rti").forEach((b) => (b.onclick = () => { if (innerWidth < 860) $("#rdr").classList.add("notoc"); go(+b.dataset.ch, 0); }));
      sb.querySelector(".rti.on")?.scrollIntoView({ block: "center" });
    } else if (side === "marks") {
      const L = [...B.marks].sort((x, y) => x.ch - y.ch || x.a - y.a || x.oa - y.oa);
      sb.innerHTML = L.length ? L.map((x) => `<button class="rmk" data-m="${x.id}"><span class="rmkc" style="background:${HL[x.c]}"></span>
          <span class="col" style="gap:3px;min-width:0"><span class="dim small">${esc(B.toc[x.ch] || "")}</span><span class="rmkt">${esc(x.text.slice(0, 220))}</span>${x.note ? `<span class="rmkn">✎ ${esc(x.note.slice(0, 200))}</span>` : ""}</span></button>`).join("")
        : `<div class="dim small" style="padding:10px;line-height:1.6">Select any text to highlight it, add a note, save it as a quote or make a flashcard.</div>`;
      sb.querySelectorAll(".rmk").forEach((b) => (b.onclick = () => { const x = B.marks.find((k) => k.id === b.dataset.m); go(x.ch, x.a, x.id); }));
    } else {
      sb.innerHTML = `<form id="rff" class="row" style="gap:6px;flex-wrap:nowrap;padding:4px"><input id="rfq" placeholder="find in this book" autocomplete="off" style="flex:1;min-width:0"><button class="small go">find</button></form><div id="rfr" class="col" style="gap:2px"></div>`;
      $("#rff").onsubmit = async (e) => { e.preventDefault(); const q = $("#rfq").value.trim(); if (q.length < 2) return; $("#rfr").innerHTML = '<span class="spin"></span>';
        const R = await api("reader/find", { id, q });
        $("#rfr").innerHTML = R.length ? `<div class="dim small" style="padding:4px 8px">${R.length >= 80 ? "80+" : R.length} found</div>` + R.map((h, i) => `<button class="rmk" data-i="${i}"><span class="col" style="gap:3px;min-width:0"><span class="dim small">${esc(h.t)}</span><span class="rmkt">${esc(h.snip)}</span></span></button>`).join("") : '<div class="dim small" style="padding:8px">Not in this book.</div>';
        $("#rfr").querySelectorAll(".rmk").forEach((b) => (b.onclick = () => { const h = R[+b.dataset.i]; go(h.ch, h.p, null, q); })); };
      setTimeout(() => $("#rfq")?.focus(), 0);
    }
  }
  m.querySelectorAll("[data-side]").forEach((b) => (b.onclick = () => { side = b.dataset.side; RM.set({ rside: side }); drawSide(); }));

  // ----- a chapter: paragraphs with highlights drawn in -----
  function paraHTML(i, text) {
    const ms = B.marks.filter((x) => x.ch === ch && x.a <= i && x.b >= i);
    if (!ms.length) return esc(text);
    const cuts = new Set([0, text.length]);
    const spans = ms.map((x) => [x.a === i ? x.oa : 0, x.b === i ? x.ob : text.length, x]);
    spans.forEach(([a, b]) => { cuts.add(Math.max(0, Math.min(text.length, a))); cuts.add(Math.max(0, Math.min(text.length, b))); });
    const pts = [...cuts].sort((a, b) => a - b);
    let out = "";
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], seg = esc(text.slice(a, b));
      const on = spans.filter(([x, y]) => x <= a && y >= b);
      if (!on.length) { out += seg; continue; }
      const top = on[on.length - 1][2], endsNote = on.some(([, y, x]) => x.note && y === b && x.b === i);
      out += `<mark class="hl" data-m="${top.id}" style="--hl:${HL[top.c]}">${seg}</mark>${endsNote ? `<button class="hlnote" data-m="${on.find(([, y, x]) => x.note && y === b)[2].id}" aria-label="note">✎</button>` : ""}`;
    }
    return out;
  }
  function render() {
    rd.innerHTML = `<h2 class="rch">${esc(C.t.includes(" · ") ? C.t.split(" · ")[1] : C.t)}${C.t.includes(" · ") ? `<span class="rchtop">${esc(C.t.split(" · ")[0])}</span>` : ""}</h2>`
      + C.p.map((t, i) => `<p data-i="${i}">${paraHTML(i, t)}</p>`).join("")
      + `<div class="rnav">${ch > 0 ? `<button id="rprev">← ${esc(short(B.toc[ch - 1]))}</button>` : "<span></span>"}${ch < B.toc.length - 1 ? `<button class="go" id="rnext">${esc(short(B.toc[ch + 1]))} →</button>` : '<span class="dim">The end</span>'}</div>`;
    if (!rd.querySelector("p.dropcap")) dropCap(rd);
    $("#rprev") && ($("#rprev").onclick = () => go(ch - 1, 0));
    $("#rnext") && ($("#rnext").onclick = () => go(ch + 1, 0));
    rd.querySelectorAll("mark.hl, .hlnote").forEach((el) => (el.onclick = (e) => { if (String(getSelection()).trim()) return; e.stopPropagation(); markPop(B.marks.find((x) => x.id === el.dataset.m), el); }));
  }
  const short = (t) => (t.includes(" · ") ? t.split(" · ")[1] : t).slice(0, 40);
  async function go(n, para = 0, flashMark = null, findQ = null) {
    n = Math.max(0, Math.min(B.toc.length - 1, n));
    if (!C || n !== ch) { C = await api("reader/chapter", { id, ch: n }); ch = n; render(); }
    else if (flashMark) render();
    const p = rd.querySelector(`p[data-i="${para}"]`);
    if (p && para > 0) { rd.scrollTop = p.offsetTop - 30; } else if (!flashMark && !findQ) rd.scrollTop = 0;
    if (flashMark) { const el = rd.querySelector(`mark[data-m="${flashMark}"]`); if (el) { rd.scrollTop = el.offsetTop - 80; el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600); } }
    if (findQ && p) { p.classList.add("flash"); setTimeout(() => p.classList.remove("flash"), 1800); }
    history.replaceState(null, "", `#/read/${id}/${ch}`);
    if (side === "toc") drawSide(); else m.querySelectorAll(".rti").forEach((b) => b.classList.toggle("on", +b.dataset.ch === ch));
    prog(); savePos();
  }
  function firstVisible() {
    const top = rd.scrollTop + 20;
    for (const p of rd.querySelectorAll("p[data-i]")) if (p.offsetTop + p.offsetHeight > top) return +p.dataset.i;
    return 0;
  }
  function prog() {
    if (!C) return;
    const i = firstVisible(), inCh = C.p.slice(0, i).reduce((a, t) => a + t.length, 0);
    const pct = Math.min(100, (100 * (before(ch) + inCh)) / total);
    $("#rp").style.width = pct + "%";
    $("#rpct").textContent = `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}% · ch. ${ch + 1} of ${B.toc.length}`;
  }
  function savePos() { clearTimeout(saveT); saveT = setTimeout(() => api("reader/pos", { id, ch, p: firstVisible() }).catch(() => {}), 1500); }
  rd.addEventListener("scroll", () => { prog(); savePos(); }, { passive: true });

  // ----- selecting text: highlight, note, quote, flashcard, define -----
  const bar = document.createElement("div"); bar.className = "hlbar"; bar.hidden = true; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "highlight");
  bar.innerHTML = HL.map((c, i) => `<button class="hlc" data-c="${i}" style="background:${c}" aria-label="highlight ${HL_NAMES[i]}"></button>`).join("")
    + `<span class="hlsep"></span><button data-act="note">note</button><button data-act="quote">quote</button><button data-act="card">card</button><button data-act="define" hidden>define</button>`;
  document.body.appendChild(bar);
  let pending = null;
  const pOf = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest("p[data-i]");
  const offIn = (p, node, off) => { const r = document.createRange(); r.selectNodeContents(p); r.setEnd(node, off); return r.toString().length; };
  function readSel() {
    const s = getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    const r = s.getRangeAt(0), pa = pOf(r.startContainer), pb = pOf(r.endContainer);
    if (!pa || !pb || !rd.contains(pa) || !rd.contains(pb)) return null;
    const a = +pa.dataset.i, b = +pb.dataset.i, oa = offIn(pa, r.startContainer, r.startOffset), ob = offIn(pb, r.endContainer, r.endOffset);
    const text = s.toString().replace(/\s+/g, " ").trim();
    if (!text) return null;
    return { ch, a, oa, b, ob, text, rect: r.getBoundingClientRect() };
  }
  rd.addEventListener("pointerup", () => setTimeout(() => {
    pending = readSel();
    if (!pending) { bar.hidden = true; return; }
    if (typeof QA !== "undefined" && QA.mode) { QA.take({ text: pending.text.slice(0, 1500) }); getSelection().removeAllRanges(); bar.hidden = true; return; }
    bar.querySelector('[data-act="define"]').hidden = !/^[A-Za-zÀ-ɏ'-]{2,30}$/.test(pending.text);
    bar.hidden = false;
    const w = bar.offsetWidth, r = pending.rect;
    bar.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    bar.style.top = (r.top > 60 ? r.top - 48 : r.bottom + 10) + "px";
  }, 10));
  const hideBar = () => { bar.hidden = true; };
  rd.addEventListener("scroll", hideBar, { passive: true });
  document.addEventListener("pointerdown", (e) => { if (!bar.contains(e.target)) hideBar(); }, true);
  async function addMark(c, note = "") {
    const sel = pending; if (!sel) return null;
    const r = await api("reader/mark", { id, op: "add", mark: { ...sel, c, note } });
    B.marks = r.marks; getSelection().removeAllRanges(); hideBar(); render(); drawSideIf();
    return B.marks.find((x) => x.id === r.id);
  }
  const drawSideIf = () => { if (side !== "find") drawSide(); };
  bar.querySelectorAll(".hlc").forEach((b) => (b.onclick = () => addMark(+b.dataset.c)));
  bar.querySelector('[data-act="note"]').onclick = async () => { const x = await addMark(0); if (x) markPop(x, rd.querySelector(`mark[data-m="${x.id}"]`), true); };
  bar.querySelector('[data-act="quote"]').onclick = async () => { const s = pending; hideBar(); await api("reader/quote", { id, ch, text: s.text }); await addMark(0); toast("Saved to the book's quotes (Reading)"); };
  bar.querySelector('[data-act="card"]').onclick = () => { const s = pending; hideBar(); cardForm(s.text, s.rect); };
  bar.querySelector('[data-act="define"]').onclick = () => { const s = pending; hideBar(); if (window.dictShow) dictShow(s.text, s.rect.left, s.rect.bottom + 8); };

  // ----- a highlight's popover: colour, note, quote, card, delete -----
  const pop = document.createElement("div"); pop.className = "hlpop"; pop.hidden = true; document.body.appendChild(pop);
  document.addEventListener("pointerdown", (e) => { if (!pop.contains(e.target) && !e.target.closest("mark.hl,.hlnote")) pop.hidden = true; }, true);
  function markPop(x, el, focusNote) {
    if (!x || !el) return;
    pop.innerHTML = `<div class="row" style="gap:6px;flex-wrap:nowrap">${HL.map((c, i) => `<button class="hlc ${i === x.c ? "on" : ""}" data-c="${i}" style="background:${c}" aria-label="${HL_NAMES[i]}"></button>`).join("")}
        <span class="hlsep"></span><button class="small" data-act="quote">quote</button><button class="small" data-act="card">card</button><button class="small del" data-act="del">delete</button></div>
      <textarea id="hln" placeholder="add a note…" rows="3">${esc(x.note || "")}</textarea><div class="row" style="justify-content:flex-end"><button class="small go" data-act="save">save note</button></div>`;
    pop.hidden = false;
    const r = el.getBoundingClientRect(), w = Math.min(340, innerWidth - 16);
    pop.style.width = w + "px"; pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + "px";
    pop.style.top = (r.bottom + 220 < innerHeight ? r.bottom + 8 : Math.max(8, r.top - pop.offsetHeight - 8)) + "px";
    const edit = async (patch) => { const R = await api("reader/mark", { id, op: "edit", mark: { id: x.id, ...patch } }); B.marks = R.marks; Object.assign(x, patch); render(); drawSideIf(); };
    pop.querySelectorAll(".hlc").forEach((b) => (b.onclick = async () => { await edit({ c: +b.dataset.c }); pop.querySelectorAll(".hlc").forEach((k) => k.classList.toggle("on", k === b)); }));
    pop.querySelector('[data-act="save"]').onclick = async () => { await edit({ note: $("#hln").value.trim() }); pop.hidden = true; toast("Note saved"); };
    pop.querySelector('[data-act="quote"]').onclick = async () => { await api("reader/quote", { id, ch: x.ch, text: x.text }); toast("Saved to the book's quotes (Reading)"); };
    pop.querySelector('[data-act="card"]').onclick = () => { pop.hidden = true; cardForm(x.text, r); };
    sure(pop.querySelector('[data-act="del"]'), async () => { const R = await api("reader/mark", { id, op: "del", mark: { id: x.id } }); B.marks = R.marks; pop.hidden = true; render(); drawSideIf(); }, "sure?");
    $("#hln").onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) pop.querySelector('[data-act="save"]').click(); };
    if (focusNote) $("#hln").focus();
  }
  function cardForm(answer, rect) {
    pop.innerHTML = `<div class="k">New flashcard</div><input id="cfq" placeholder="the question (what should this remind you of?)" autocomplete="off">
      <div class="dim small" style="max-height:90px;overflow:auto;line-height:1.5">${esc(answer.slice(0, 600))}</div>
      <div class="row" style="justify-content:space-between"><input id="cfd" value="${esc(B.title.slice(0, 50))}" aria-label="deck" style="flex:1;min-width:0"><button class="small go" id="cfg">add card</button></div>`;
    pop.hidden = false;
    const w = Math.min(380, innerWidth - 16);
    pop.style.width = w + "px"; pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, rect.left)) + "px"; pop.style.top = Math.min(innerHeight - 240, rect.bottom + 8) + "px";
    $("#cfq").focus();
    const add = async () => { if (!$("#cfq").value.trim()) return $("#cfq").focus(); await api("cards/add", { front: $("#cfq").value.trim(), back: answer.slice(0, 2000), deck: $("#cfd").value.trim() || B.title }); pop.hidden = true; toast("Card added"); };
    $("#cfg").onclick = add; $("#cfq").onkeydown = (e) => { if (e.key === "Enter") add(); };
  }

  // ----- keys: arrows turn chapters -----
  const keys = (e) => {
    if (!document.body.contains(rd)) { document.removeEventListener("keydown", keys); bar.remove(); pop.remove(); return; }
    if (e.key.toLowerCase() === "f" && !e.target.matches("input,textarea,select") && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setFull(!document.body.classList.contains("rfull")); return; }
    if (e.target.matches("input,textarea,select") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowRight" && ch < B.toc.length - 1) go(ch + 1, 0);
    else if (e.key === "ArrowLeft" && ch > 0) go(ch - 1, 0);
    else if (e.key === "Escape") { hideBar(); pop.hidden = true; if (document.body.classList.contains("rfull") && !document.fullscreenElement) setFull(false); }
    else if (e.key.toLowerCase() === "c") panel();
  };
  document.addEventListener("keydown", keys);
  window.addEventListener("hashchange", function gone() { if (!location.hash.startsWith("#/read/" + id)) { bar.remove(); pop.remove(); document.removeEventListener("keydown", keys); document.removeEventListener("fullscreenchange", fsChange); document.removeEventListener("pointermove", peek); if (document.body.classList.contains("rfull")) setFull(false); document.body.classList.remove("rpeek"); window.removeEventListener("hashchange", gone); } });

  drawSide();
  await go(ch, chArg !== undefined && chArg !== "" ? 0 : B.pos.p || 0);
  rd.focus({ preventScroll: true });
}
