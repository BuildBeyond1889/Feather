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
        <div class="row" style="gap:8px;flex-wrap:nowrap"><span class="dim small num" id="rpct"></span>${readBar()}<button class="rtg rlis" id="rlis" title="read to me (R) · Ctrl+Alt+F hides Feather and it keeps reading">▶ read to me</button><button class="rtg" id="rsa" title="Sonia reads it: your PC makes the audio, it plays offline">Sonia ⌄</button><button class="rtg" id="rbm" title="bookmark this spot (B)" aria-label="bookmark this spot"><svg width="16" height="18" viewBox="0 0 16 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M2 2h12v16l-6-4.5L2 18z"/></svg></button><button class="rtg" id="rfs" title="full screen (F) · Esc to leave" aria-label="full screen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button></div></div>
      <div class="rframe"><div class="rprog"><i id="rp"></i></div><div id="rd" class="reader book" tabindex="0"></div><div class="rplay" id="rplay" role="region" aria-label="Read to me" hidden></div></div>
    </section></div>
    <button class="cbub" id="cbub" title="this chapter: your notes, highlights, bookmarks, people (N)" aria-label="this chapter" aria-expanded="false"><span id="cbubl">ch.1</span><i class="cdot" hidden></i></button>
    <aside class="cpan" id="cpan" aria-label="This chapter" hidden></aside>`);
  const rd = $("#rd");
  wireReadBar((t, s) => { rd.dataset.theme = t; rd.style.fontSize = s + "px"; $("#cbub").dataset.theme = t; document.body.dataset.rtheme = t; });
  if (window.dictHook) dictHook(document, rd);
  // full screen: just the page, the bar fades in when the mouse moves near the top
  const setFull = async (on) => {
    const keep = C ? firstVisible() : 0;
    document.body.classList.toggle("rfull", on);
    setTimeout(() => { const p = rd.querySelector(`p[data-i="${keep}"]`); if (p && keep) rd.scrollTop = p.offsetTop - 30; }, 120);
    try { if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen(); else if (!on && document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
    $("#rfs").classList.toggle("on", on); prog(); setTimeout(() => typeof placeBub === "function" && placeBub(), 150);
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
      out += `<mark class="hl${top.t && Date.now() / 1000 - top.t < 90 ? " fresh" : ""}" data-m="${top.id}" style="--hl:${HL[top.c]}">${seg}</mark>${endsNote ? `<button class="hlnote" data-m="${on.find(([, y, x]) => x.note && y === b)[2].id}" aria-label="note">✎</button>` : ""}`;
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
    drawPins();
    if (typeof lsPaint === "function") lsPaint();
  }
  const short = (t) => (t.includes(" · ") ? t.split(" · ")[1] : t).slice(0, 40);
  async function go(n, para = 0, flashMark = null, findQ = null) {
    n = Math.max(0, Math.min(B.toc.length - 1, n));
    if (!C || n !== ch) { C = await api("reader/chapter", { id, ch: n }); ch = n; render(); }
    else if (flashMark) render();
    const p = rd.querySelector(`p[data-i="${para}"]`);
    if (p && para > 0) { rd.scrollTop = p.offsetTop - 30; } else if (!flashMark && !findQ) rd.scrollTop = 0;
    if (flashMark) { const el = rd.querySelector(`mark[data-m="${flashMark}"]`); if (el) { rd.scrollTop = topIn(el) - 80; el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600); } }
    if (findQ && p) { p.classList.add("flash"); setTimeout(() => p.classList.remove("flash"), 1800); }
    history.replaceState(null, "", `#/read/${id}/${ch}`);
    $("#cbubl").textContent = (B.kind === "pdf" ? "p." : "ch.") + (ch + 1);
    if (CP.open && CP.follow && CP.ch !== ch) { CP.ch = ch; loadPanel().then(drawPanel, panelErr); } else if (CP.open) drawPanel();
    if (side === "toc") drawSide(); else m.querySelectorAll(".rti").forEach((b) => b.classList.toggle("on", +b.dataset.ch === ch));
    prog(); savePos();
  }
  const topIn = (el) => el.getBoundingClientRect().top - rd.getBoundingClientRect().top + rd.scrollTop;
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
  const drawSideIf = () => { if (side !== "find") drawSide(); mine(); if (CP.open) drawPanel(); };
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
    pop.classList.remove("vpop");
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
    pop.classList.remove("vpop");
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

  // ----- the chapter bubble: this chapter's highlights, notes pinned where you wrote them, bookmarks, tags, people, a recap -----
  const TAGS4 = ["loved this", "confusing", "slow", "big moment"];
  const CP = { open: false, ch: 0, follow: true, f: RM.get().cpf || "all", info: null, rx: false, ask: false };
  let pins = [], liveSig = "", lastMine = 0, liveT = null;
  const mine = () => { lastMine = Date.now(); };
  const ago = (t) => { const s = Math.max(0, Date.now() / 1000 - (t || 0)); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : when(t); };
  const fresh = (t) => t && Date.now() / 1000 - t < 90;
  const cut = (t, n) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t);
  const pinsIn = (n) => pins.filter((x) => x.ch === n);
  function drawPins() {  // margin marks: ✎ where you wrote a note, a ribbon where you bookmarked
    rd.querySelectorAll(".pinm").forEach((x) => x.remove());
    const by = {};
    pinsIn(ch).forEach((x) => { const k = (by[x.p] = by[x.p] || { note: 0, bm: 0 }); k[x.k === "bm" ? "bm" : "note"]++; });
    for (const [i, k] of Object.entries(by)) {
      const p = rd.querySelector(`p[data-i="${i}"]`); if (!p) continue;
      const el = document.createElement("span");
      el.className = "pinm " + (k.note && k.bm ? "k-both" : k.note ? "k-note" : "k-bm"); el.setAttribute("role", "button"); el.tabIndex = 0;
      el.setAttribute("aria-label", [k.note ? k.note + " note" + (k.note > 1 ? "s" : "") : "", k.bm ? "bookmark" : ""].filter(Boolean).join(" and ") + " here");
      el.title = el.getAttribute("aria-label");
      el.onclick = (e) => { e.stopPropagation(); openPanel(ch, { f: k.note ? "note" : "bm", p: +i }); };
      el.onkeydown = (e) => { if (e.key === "Enter") el.onclick(e); };
      p.appendChild(el);
    }
  }
  async function loadPanel() {
    const I = await api("reader/panel", { id, ch: CP.ch });
    CP.info = I; pins = I.pins || []; B.marks = I.marks || B.marks;
  }
  async function openPanel(n = ch, opt = {}) {
    CP.open = true; CP.ch = n; CP.follow = n === ch; CP.ask = false; if (opt.f) CP.f = opt.f; CP.hot = opt.p;
    $("#cpan").hidden = false; document.body.classList.add("cpopen"); placeBub(); $("#cbub").setAttribute("aria-expanded", "true"); $("#cbub").classList.add("on"); $("#cbub .cdot").hidden = true;
    try { await loadPanel(); drawPanel(); } catch (e) { panelErr(e); }
  }
  function panelErr(e) {  // never an empty panel: say what happened, and tell your PC's sync log
    const old = /^\?$|went wrong/.test(e.message || "");
    $("#cpan").innerHTML = `<div class="cph"><div class="cprow"><span class="cplab lime">This chapter</span><span style="flex:1"></span><button class="cpnav" data-x aria-label="close">✕</button></div>
      <div class="cpt" style="font-size:16px">${old ? "This laptop is still finishing Feather's update." : "The chapter panel couldn't open."}</div>
      <div class="dim small" style="line-height:1.6">${old ? "Press <b>Alt+M</b>, wait about 10 seconds, then <b>Ctrl+Alt+F</b>. Feather puts the rest of the update in while it's closed." : esc(e.message || String(e))}</div></div>`;
    $("#cpan [data-x]").onclick = closePanel;
    fetch("/api/jserr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ where: "chapter panel", msg: (e && (e.stack || e.message)) || String(e) }) }).catch(() => {});
  }
  function closePanel() { CP.open = false; $("#cpan").hidden = true; document.body.classList.remove("cpopen"); placeBub(); $("#cbub").setAttribute("aria-expanded", "false"); $("#cbub").classList.remove("on"); rd.focus({ preventScroll: true }); }
  $("#cbub").onclick = () => (CP.open ? closePanel() : openPanel(ch));
  function placeBub() {  // the bubble sits just left of BOOK REPORT, on the same line; both sit above the Read to me player
    const bu = $("#cbub"), rb = document.querySelector(".fdrep"); if (!bu) return;
    const pl = $("#rplay");
    if (rb) rb.style.bottom = pl && !pl.hidden && !pl.classList.contains("tuck") ? Math.max(40, Math.round(innerHeight - pl.getBoundingClientRect().top + 12)) + "px" : "";
    const r = rb && getComputedStyle(rb).display !== "none" ? rb.getBoundingClientRect() : null;
    if (!r || !r.width) { bu.style.right = bu.style.bottom = ""; return; }
    bu.style.right = Math.round(innerWidth - r.left + 12) + "px";
    bu.style.bottom = Math.round(innerHeight - r.bottom + (r.height - bu.offsetHeight) / 2) + "px";
  }
  addEventListener("resize", placeBub); setTimeout(placeBub, 50); setTimeout(placeBub, 600);
  async function addPin(k, n, para, note = "") { const R = await api("reader/pin", { id, op: "add", ch: n, p: para, pin: { k, note } }); pins = R.pins; mine(); render0(); return R.id; }
  function render0() { const st = rd.scrollTop; render(); rd.scrollTop = st; if (CP.open) drawPanel(); }
  async function bookmarkHere() {
    const at = firstVisible(), had = pins.find((x) => x.k === "bm" && x.ch === ch && x.p === at);
    if (had) { const R = await api("reader/pin", { id, op: "del", pin: { id: had.id } }); pins = R.pins; mine(); render0(); toast("Bookmark removed"); return; }
    await addPin("bm", ch, at); toast(`Bookmarked · ¶ ${at + 1}`);
  }
  $("#rbm").onclick = bookmarkHere;
  function readTo(n) { return n < ch ? Infinity : n === ch ? firstVisible() : -1; }  // how far you've read in chapter n (-1: not started)
  function drawPanel() { try { drawPanel0(); } catch (e) { panelErr(e); } }
  function drawPanel0() {
    const I = CP.info, el = $("#cpan"); if (!I || !CP.open) return;
    const n = CP.ch, here = n === ch, at = here ? firstVisible() : 0, unit = B.kind === "pdf" ? "p." : "ch.";
    const hls = B.marks.filter((x) => x.ch === n), ps = pinsIn(n);
    let items = [...hls.map((x) => ({ k: "hl", x, t: x.t || 0, p: x.a })), ...ps.map((x) => ({ k: x.k === "bm" ? "bm" : "note", x, t: x.t || 0, p: x.p }))];
    if ((I.notes || "").trim()) items.push({ k: "page", x: { note: I.notes }, t: -1, p: 0 });
    const isNote = (i) => i.k === "note" || i.k === "page" || (i.k === "hl" && i.x.note);
    const cnt = { all: items.length, hl: items.filter((i) => i.k === "hl").length, note: items.filter(isNote).length, bm: items.filter((i) => i.k === "bm").length };
    const shown = items.filter((i) => CP.f === "all" || (CP.f === "note" ? isNote(i) : i.k === CP.f)).sort((a, b) => b.t - a.t || a.p - b.p);
    const pct = here && I.paras ? Math.round((100 * at) / Math.max(1, I.paras)) : null;
    const tags = I.tags || [], extra = tags.filter((t) => !TAGS4.includes(t));
    const rc = I.recap, rt = readTo(n);
    const item = (i) => {
      const x = i.x, hot = CP.hot !== undefined && i.p === CP.hot && i.k !== "hl" ? " hot" : "", fr = fresh(i.t) ? " fresh" : "";
      if (i.k === "hl") return `<div class="cpi${fr}" data-k="hl" data-id="${x.id}"><span class="cpbar" style="background:${HL[x.c]}"></span><div class="cpb">
          <div class="cpt q">${esc(cut(x.text, 320))}</div>${x.note ? `<div class="cpt cpnote">✎ ${esc(x.note)}</div>` : ""}<div class="cpm">highlight · ${ago(x.t)} · ¶ ${x.a + 1}</div></div><button class="cpf" data-find>find ↗</button></div>`;
      if (i.k === "page") return `<div class="cpi" data-k="page"><span class="cpico">✎</span><div class="cpb"><div class="cpt">${esc(cut(x.note, 600))}</div><div class="cpm">chapter notes from the book page${I.book ? ` · <a href="#/book/${esc(I.book)}">edit there</a>` : ""}</div></div><button class="cpf" data-find>find ↗</button></div>`;
      if (i.k === "bm") return `<div class="cpi${fr}${hot}" data-k="bm" data-id="${x.id}"><span class="cpico bm" aria-hidden="true"></span><div class="cpb"><div class="cpt">${x.note ? esc(x.note) : `<span class="q">“${esc(cut(x.text || "", 70))}”</span>`}</div>
          <div class="cpm">bookmark · ¶ ${x.p + 1} · ${ago(x.t)} · <button data-edit>${x.note ? "rename" : "name it"}</button> · <button data-del>delete</button></div></div><button class="cpf" data-find>find ↗</button></div>`;
      return `<div class="cpi${fr}${hot}" data-k="note" data-id="${x.id}"><span class="cpico">✎</span><div class="cpb"><div class="cpt">${esc(x.note)}</div>
          <div class="cpm">note · on “${esc(cut(x.text || "", 40))}” · ¶ ${x.p + 1} · ${ago(x.t)}${x.src && x.src !== "laptop" ? " · from your " + esc(x.src) : ""} · <button data-edit>edit</button> · <button data-del>delete</button></div></div><button class="cpf" data-find>find ↗</button></div>`;
    };
    el.innerHTML = `<div class="cph">
        <div class="cprow"><span class="cplab lime">This chapter</span><span class="cplive" title="highlights and notes from your other devices show up here as they sync"><i></i>live</span><span style="flex:1"></span>
          <button class="cpnav" data-nav="-1" aria-label="previous chapter" ${n ? "" : "disabled"}>‹</button><button class="cpnav" data-nav="1" aria-label="next chapter" ${n < I.n - 1 ? "" : "disabled"}>›</button><button class="cpnav" data-x aria-label="close (N)">✕</button></div>
        <div class="cprow" style="align-items:baseline;gap:10px;flex-wrap:wrap"><span class="serif cptitle">${esc(short(I.t))}</span><span class="dim small">${unit} ${n + 1} of ${I.n}${pct !== null ? ` · ${pct}% in` : n < ch ? " · read" : " · not yet"}${!here ? ` · <button class="cplink" data-back>back to ${unit} ${ch + 1}</button>` : ""}</span></div>
        <div class="cptags">${[...TAGS4, ...extra].map((t) => `<button class="cptag ${tags.includes(t) ? "on" : ""}" data-tag="${esc(t)}" aria-pressed="${tags.includes(t)}">${esc(t)}</button>`).join("")}<button class="cptag add" data-addtag>+ tag</button></div>
        <div class="cprecap ${CP.rx ? "open" : ""}"><button class="cplab cprx" data-rx aria-expanded="${CP.rx}">Recap so far ${CP.rx ? "▾" : "▸"}</button>
          ${rc ? `<span class="cprt">${esc(CP.rx ? rc.text : cut(rc.text, 110))}</span>` : `<span class="dim">${rt < 0 ? "not started yet: no recap, no spoilers" : "none yet"}</span>`}
          ${CP.rx ? `<div class="cpm">${rc ? `made ${ago(rc.t)} · up to ¶ ${rc.p + 1}${rc.how === "picked" ? " · key lines (no model on this laptop)" : ""} · ` : ""}${rt >= 0 ? `<button data-recap>${rc ? "refresh it" : "make one"}</button> · only what you've read goes in` : ""}</div>` : ""}</div>
      </div>
      <div class="cpfilt" role="tablist">${[["all", "All"], ["hl", "Highlights"], ["note", "Notes"], ["bm", "Bookmarks"]].map(([k, l]) => `<button role="tab" data-f="${k}" class="${CP.f === k ? "on" : ""}" aria-selected="${CP.f === k}">${l} ${cnt[k]}</button>`).join("")}</div>
      <div class="cplist">${shown.map(item).join("") || `<div class="dim small" style="padding:6px 4px;line-height:1.6">${CP.f === "bm" ? "No bookmarks here yet. Press B (or the ribbon up top) to drop one where you are." : CP.f === "hl" ? "Select any text to highlight it." : "Nothing here yet. Write a note below: it's pinned to where you are, and find ↗ takes you back to it."}</div>`}</div>
      ${CP.ask ? `<div class="cpnew"><label class="cplab" for="cpq">Ask about this chapter · no spoilers past where you are</label><div class="row" style="gap:8px;flex-wrap:nowrap"><input id="cpq" placeholder="what does this mean? who is this?" autocomplete="off" style="flex:1;min-width:0;height:38px"><button class="go" id="cpqa" style="height:38px">ask</button></div><div id="cpans" class="cpt" style="font-size:14px"></div></div>` : ""}
      <div class="cpnew"><label class="cplab" for="cpnt">New note · ${here ? `pinned to ¶ ${at + 1}, where you are` : "pinned to the start of this chapter"}</label>
        <div class="row" style="gap:8px;flex-wrap:nowrap;align-items:stretch"><textarea id="cpnt" rows="2" placeholder="write as much as you want… (Ctrl+Enter adds it)"></textarea><button class="go" id="cpadd" style="height:auto">add</button></div></div>
      <div class="cpnew"><div class="cplab">People in this chapter</div>
        <div class="cptags">${(I.people || []).map((x) => `<span class="cpchip">${esc(x)}<button data-unp="${esc(x)}" aria-label="remove ${esc(x)}">✕</button></span>`).join("")}
          <form id="cppf" class="cpchip add"><input id="cppn" list="cppl" placeholder="+ add person" autocomplete="off" aria-label="add a person"><datalist id="cppl">${(I.allpeople || []).filter((x) => !(I.people || []).includes(x)).map((x) => `<option value="${esc(x)}">`).join("")}</datalist></form></div></div>
      <div class="cpfoot"><button id="cpbm" title="bookmark this spot (B)">🔖 ${here && ps.some((x) => x.k === "bm" && x.p === at) ? "marked" : "bookmark"}</button><button id="cpask" class="${CP.ask ? "on" : ""}">ask about it</button>${I.book ? `<a class="btn" href="#/book/${esc(I.book)}">book page</a>` : ""}</div>`;
    const Q = (s) => el.querySelector(s), QA = (s) => el.querySelectorAll(s);
    QA("[data-nav]").forEach((b) => (b.onclick = async () => { CP.ch = Math.max(0, Math.min(I.n - 1, n + +b.dataset.nav)); CP.follow = CP.ch === ch; CP.hot = undefined; try { await loadPanel(); drawPanel(); } catch (e) { panelErr(e); } }));
    Q("[data-x]").onclick = closePanel;
    Q("[data-back]") && (Q("[data-back]").onclick = async () => { CP.ch = ch; CP.follow = true; await loadPanel(); drawPanel(); });
    QA("[data-f]").forEach((b) => (b.onclick = () => { CP.f = b.dataset.f; RM.set({ cpf: CP.f }); CP.hot = undefined; drawPanel(); }));
    Q("[data-rx]").onclick = () => { CP.rx = !CP.rx; drawPanel(); };
    const saveMeta = async (patch) => { try { const R = await api("reader/chmeta", { id, ch: n, ...patch }); Object.assign(CP.info, R); mine(); drawPanel(); } catch (e) { toast(e.message); } };
    QA("[data-tag]").forEach((b) => (b.onclick = () => { const t = b.dataset.tag; saveMeta({ tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] }); }));
    Q("[data-addtag]").onclick = (e) => { const b = e.currentTarget, inp = document.createElement("input"); inp.className = "cptag"; inp.placeholder = "new tag"; inp.style.width = "120px"; b.replaceWith(inp); inp.focus();
      inp.onkeydown = (k) => { if (k.key === "Enter" && inp.value.trim()) saveMeta({ tags: [...tags, inp.value.trim().toLowerCase()] }); if (k.key === "Escape") { k.stopPropagation(); drawPanel(); } }; inp.onblur = () => setTimeout(() => CP.open && document.activeElement !== inp && drawPanel(), 150); };
    Q("[data-recap]") && (Q("[data-recap]").onclick = async (e) => { e.currentTarget.outerHTML = '<span class="spin"></span> reading back over it…';
      try { const R = await api("reader/recap", { id, ch: n, p: rt === Infinity ? 1e6 : rt }); CP.info.recap = R; mine(); } catch (er) { toast(er.message); } drawPanel(); });
    QA(".cpi").forEach((row) => {
      const k = row.dataset.k, x = k === "hl" ? B.marks.find((m) => m.id === row.dataset.id) : pins.find((m) => m.id === row.dataset.id);
      row.querySelector("[data-find]").onclick = () => {
        if (k === "hl") return go(x.ch, x.a, x.id);
        if (k === "page") { go(n, 0).then(() => (rd.scrollTop = 0)); return; }
        go(x.ch, x.p, null, "pin").then(() => { if (!x.p) rd.scrollTop = 0; });
      };
      const ed = row.querySelector("[data-edit]"), del = row.querySelector("[data-del]");
      ed && (ed.onclick = () => {
        const box = row.querySelector(".cpt"), ta = document.createElement("textarea"); ta.value = x.note || ""; ta.rows = 3; ta.className = "cped"; box.replaceWith(ta); ta.focus();
        const sv = async () => { const R = await api("reader/pin", { id, op: "edit", pin: { id: x.id, note: ta.value } }); pins = R.pins; mine(); drawPanel(); };
        ta.onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey || k === "bm")) { e.preventDefault(); sv(); } if (e.key === "Escape") { e.stopPropagation(); drawPanel(); } };
        ed.textContent = "save"; ed.onclick = sv;
      });
      del && sure(del, async () => { const R = await api("reader/pin", { id, op: "del", pin: { id: x.id } }); pins = R.pins; mine(); render0(); }, "sure?");
    });
    const add = async () => { const v = Q("#cpnt").value.trim(); if (!v) return Q("#cpnt").focus(); await addPin("note", n, here ? firstVisible() : 0, v); CP.f = CP.f === "bm" || CP.f === "hl" ? "all" : CP.f; drawPanel(); toast("Note pinned here"); };
    Q("#cpadd").onclick = add;
    Q("#cpnt").onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add(); };
    QA("[data-unp]").forEach((b) => (b.onclick = () => saveMeta({ people: (I.people || []).filter((x) => x !== b.dataset.unp) })));
    Q("#cppf").onsubmit = (e) => { e.preventDefault(); const v = Q("#cppn").value.trim(); if (v) saveMeta({ people: [...(I.people || []), v] }); };
    Q("#cpbm").onclick = async () => { if (here) return bookmarkHere(); await addPin("bm", n, 0); toast("Bookmarked the start of this chapter"); };
    Q("#cpask").onclick = () => { CP.ask = !CP.ask; drawPanel(); CP.ask && Q("#cpq")?.focus(); };
    if (CP.ask) {
      const ask = async () => { const q = Q("#cpq").value.trim(); if (!q) return; Q("#cpans").innerHTML = '<span class="spin"></span> thinking (the first answer takes longer while the model loads)';
        const R = await api("reader/ask", { id, ch: n, p: rt === Infinity ? 1e6 : Math.max(0, rt), q }); Q("#cpans") && (Q("#cpans").textContent = R.answer); };
      Q("#cpqa").onclick = ask; Q("#cpq").onkeydown = (e) => { if (e.key === "Enter") ask(); };
    }
    el.querySelector(".cpi.hot")?.scrollIntoView({ block: "nearest" });
  }
  // live: highlights and notes made on your phone or other laptop show up as they sync in
  async function live() {
    if (!document.body.contains(rd)) return clearInterval(liveT);
    let R; try { R = await api("reader/live", { id }); } catch (e) { return; }
    if (R.sig === liveSig) return;
    const first = !liveSig; liveSig = R.sig;
    if (first) { pins = R.pins; drawPins(); return; }
    B.marks = R.marks; pins = R.pins;
    const busy = !bar.hidden || !pop.hidden || String(getSelection()).trim() || document.activeElement?.closest?.("#cpan textarea, #cpan input");
    if (!busy) { const st = rd.scrollTop; render(); rd.scrollTop = st; if (side === "marks" || side === "toc") drawSide(); if (CP.open) drawPanel(); }
    if (Date.now() - lastMine > 4000 && !CP.open) $("#cbub .cdot").hidden = false;
  }
  liveT = setInterval(live, 6000);
  live();

  // ----- Read to me: Feather reads the book aloud, sentence by sentence. Ctrl+Alt+F hides Feather and it keeps reading;
  //       Ctrl+Alt+F again and it's paused on the sentence you just heard, ready to highlight, note or bookmark. -----
  const LS = { on: false, paused: false, j: 0, k: 0, sents: [], utt: null, off: false, wasHidden: false, userScroll: 0, mode: "tts" };
  // Sonia: chapters your PC read with Sonia, copied to this laptop; speed and volume are saved in Feather (the same on every device)
  const SA = { el: null, T: null, url: null, key: "", seek: false, set: { speed: RM.get().lrate || 1, vol: 1, ahead: true } };
  api("sonia/state", { rid: id }).then((r) => { SA.set = r.set; SA.st = r; lsBar(); }).catch(() => {});
  async function saLoad(c) {
    try {
      const T = await api("sonia/times", { rid: id, ch: c });
      const res = await fetch(`/sonia-audio/${id}/${c}`); if (!res.ok) return false;
      const blob = await res.blob();
      if (!SA.el) {
        SA.el = new Audio(); SA.el.preload = "auto"; SA.el.ontimeupdate = saTick;
        SA.el.onended = () => { if (SA.key !== id + "/" + ch || !LS.on || LS.paused) return; LS.j = C.p.length; lsSpeak(); };
      }
      if (SA.url) URL.revokeObjectURL(SA.url);
      SA.url = URL.createObjectURL(blob); SA.el.src = SA.url; SA.T = T; SA.key = id + "/" + c;
      return true;
    } catch (e) { return false; }
  }
  function saTime(j, a) {
    const P = SA.T && SA.T.paras[j]; if (!P) return null;
    let ms = a ? P.dur : 0; if (a) for (const [c, t] of P.w) if (c >= a) { ms = t; break; }
    return (P.t0 + ms) / 1000;
  }
  function saTick() {
    if (!LS.on || LS.mode !== "sonia" || !SA.T || SA.seek) return;
    const t = SA.el.currentTime * 1000, ps = SA.T.paras;
    let j = 0; for (let i = 0; i < ps.length; i++) if (ps[i].dur && ps[i].t0 <= t) j = i;
    const sents = j === LS.j ? LS.sents : lsSents(C.p[j] || "");
    let k = 0; for (let i = 0; i < sents.length; i++) { const st = saTime(j, sents[i][0]); if (st !== null && st * 1000 <= t + 60) k = i; }
    if (j !== LS.j || k !== LS.k) { const nj = j !== LS.j; LS.j = j; LS.sents = sents; LS.k = k; lsPaint(); lsBar(); if (nj) api("reader/pos", { id, ch, p: LS.j }).catch(() => {}); }
  }
  function saApply() { if (SA.el) { SA.el.playbackRate = SA.set.speed || 1; SA.el.volume = Math.max(0, Math.min(1, SA.set.vol == null ? 1 : SA.set.vol)); } }
  function saPlay() {
    if (SA.seek) { const st = saTime(LS.j, (LS.sents[LS.k] || [0])[0]); if (st !== null) SA.el.currentTime = st; }
    SA.seek = false; saApply(); lsPaint(); lsBar(); SA.el.play().catch(() => { LS.mode = "tts"; lsSpeak(); });
  }
  function saMode(c) {  // Sonia if this chapter is here, else the laptop's voices
    return saLoad(c).then((ok) => { LS.mode = ok ? "sonia" : "tts"; SA.seek = true; if (ok) saAhead(); return ok; });
  }
  function saAhead() {
    if (!SA.set.ahead || ch + 1 >= B.toc.length) return;
    const made = new Set([...((SA.st || {}).here || []), ...((SA.st || {}).made || [])]);
    if (made.has(ch + 1) && made.has(Math.min(B.toc.length - 1, ch + 2))) return;
    api("sonia/ask", { rid: id, from: ch + 1, to: Math.min(B.toc.length - 1, ch + 2), for: ["laptops"], ahead: true }).then(() => { (SA.st = SA.st || {}).made = [...made, ch + 1, ch + 2]; }).catch(() => {});
  }
  let saSaveT = null;
  function saSet(patch) { Object.assign(SA.set, patch); saApply(); clearTimeout(saSaveT); saSaveT = setTimeout(() => api("sonia/set", patch).catch(() => {}), 400); }
  async function soniaPop() {
    let st = SA.st || {}; try { st = SA.st = await api("sonia/state", { rid: id }); SA.set = st.set; } catch (e) {}
    const n = B.toc.length, here = ch, opt = (v, sel) => `<option value="${v}"${v === sel ? " selected" : ""}>${v + 1}</option>`, all = Array.from({ length: n }, (_, i) => i);
    pop.innerHTML = `<div class="row" style="justify-content:space-between"><span class="serif" style="font-size:20px;color:var(--text)">Sonia audio</span><button class="small" data-x aria-label="close">✕</button></div>
      <div class="dim small" style="line-height:1.6">Your PC makes it with Sonia (it needs the internet for that); then it plays offline. ${st.err ? `<br><b>${esc(st.err)}</b>` : st.left ? `<br>Your PC is making ${st.left} chapter${st.left > 1 ? "s" : ""} now.` : ""}${st.accent_now ? "<br>Making one in an accent voice: Archie on your PC is slower until it's done." : ""}</div>
      <label class="row small sarow"><input type="radio" name="saw" value="one" checked> <span style="flex:1">This chapter</span></label>
      <label class="row small sarow"><input type="radio" name="saw" value="to"> <span style="flex:1">Chapters</span><select id="safr">${all.map((v) => opt(v, here)).join("")}</select> to <select id="sato">${all.map((v) => opt(v, Math.min(n - 1, here + 5))).join("")}</select></label>
      <label class="row small sarow"><input type="radio" name="saw" value="all"> <span style="flex:1">Whole book</span></label>
      <div class="cplab">Put it on</div>
      <div class="row small" style="gap:14px"><label class="row" style="gap:6px"><input type="checkbox" id="salp" checked> laptops</label><label class="row" style="gap:6px"><input type="checkbox" id="saph"> phone</label></div>
      <label class="row small sarow"><span style="flex:1">Voice</span><select id="savo">${[...[["en-GB-SoniaNeural", "Sonia · British woman"], ["en-GB-LibbyNeural", "Libby · British woman"], ["en-GB-RyanNeural", "Ryan · British man"], ["en-GB-ThomasNeural", "Thomas · British man"], ["en-IE-EmilyNeural", "Emily · Irish woman"], ["en-IE-ConnorNeural", "Connor · Irish man"], ["en-AU-NatashaNeural", "Natasha · Australian woman"], ["en-AU-WilliamNeural", "William · Australian man"]].concat(((SA.st || {}).accents || []).map((a) => [a.v, a.name]))].map(([v, nm]) => `<option value="${v}"${v === (SA.set.voice || "en-GB-SoniaNeural") ? " selected" : ""}>${esc(nm)}</option>`).join("")}</select></label>
      <label class="row small" style="gap:8px"><input type="checkbox" id="sanight" ${SA.set.night !== false ? "checked" : ""}> overnight: record my next 3 chapters each night</label>
      <label class="row small" style="gap:8px"><input type="checkbox" id="saah" ${SA.set.ahead !== false ? "checked" : ""}> keep the next 2 chapters ready as I listen</label>
      <div class="dim small">On this laptop: ${(st.here || []).length ? st.here.map((c) => c + 1).join(", ") : "none yet"} · made on your PC: ${(st.made || []).length ? st.made.map((c) => c + 1).join(", ") : "none yet"}</div>
      <button class="go" id="sago">Make it with Sonia</button>`;
    pop.hidden = false; pop.classList.add("vpop");
    const w = Math.min(420, innerWidth - 16), pr = ($("#rplay").hidden ? $("#rlis") : $("#rplay")).getBoundingClientRect();
    pop.style.width = w + "px"; pop.style.left = Math.max(8, pr.right - w) + "px"; pop.style.top = Math.max(8, ($("#rplay").hidden ? pr.bottom + 10 : pr.top - pop.offsetHeight - 10)) + "px";
    pop.querySelector("[data-x]").onclick = () => { pop.hidden = true; pop.classList.remove("vpop"); };
    $("#saah").onchange = (e) => saSet({ ahead: e.target.checked });
    $("#savo").onchange = (e) => saSet({ voice: e.target.value });
    $("#sanight").onchange = (e) => saSet({ night: e.target.checked });
    $("#sago").onclick = async () => {
      const w2 = pop.querySelector('input[name="saw"]:checked').value, fr = w2 === "one" ? here : w2 === "all" ? 0 : +$("#safr").value, to = w2 === "one" ? here : w2 === "all" ? n - 1 : Math.max(fr, +$("#sato").value);
      const dev = [$("#salp").checked ? "laptops" : null, $("#saph").checked ? "phone" : null].filter(Boolean);
      if (!dev.length) return toast("Pick where it goes");
      try { await api("sonia/ask", { rid: id, from: fr, to, for: dev }); pop.hidden = true; pop.classList.remove("vpop"); toast("Asked your PC · it arrives after the next syncs"); } catch (e) { toast(e.message); }
    };
  }
  const lsSents = (p) => splitSentences(p);
  function lsVoice(offline) {
    const vs = speechSynthesis.getVoices().filter((v) => !/maisie/i.test(v.name)), r = RM.get(), pick = (u) => u && vs.find((v) => v.voiceURI === u);
    if (!offline) { const v = pick(r.voice) || (!r.voice && vs.find((x) => !x.localService && /^en/i.test(x.lang) && /natural/i.test(x.name))); if (v) return v; }  // Edge's natural voices first: much easier to listen to
    return pick(r.voiceOff) || vs.find((v) => v.localService && /^en/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  }
  function lsRange(j, a, b) {  // the sentence as a range over the paragraph's text (marks, note buttons and margin marks don't count)
    const p = rd.querySelector(`p[data-i="${j}"]`); if (!p) return null;
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest(".hlnote,.pinm") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const r = document.createRange(); let pos = 0, started = false, n;
    while ((n = w.nextNode())) {
      const L = n.textContent.length;
      if (!started && a <= pos + L) { r.setStart(n, Math.max(0, a - pos)); started = true; }
      if (started && b <= pos + L) { r.setEnd(n, Math.max(0, b - pos)); return r; }
      pos += L;
    }
    return started ? r : null;
  }
  function lsPaint() {  // tint the sentence being read (CSS highlights: the text itself isn't touched)
    try {
      if (!window.CSS || !CSS.highlights) return;
      CSS.highlights.delete("rnow");
      if (!LS.on || !C) return;
      const [a, b] = LS.sents[LS.k] || [0, 0], r = lsRange(LS.j, a, b); if (!r) return;
      CSS.highlights.set("rnow", new Highlight(r));
      if (!document.hidden && Date.now() - LS.userScroll > 5000) {
        const rc = r.getBoundingClientRect(), fr = rd.getBoundingClientRect();
        if (rc.top < fr.top + 40 || rc.bottom > fr.bottom - 120) rd.scrollTop += rc.top - fr.top - fr.height / 3;
      }
    } catch (e) {}
  }
  rd.addEventListener("wheel", () => (LS.userScroll = Date.now()), { passive: true });
  function lsSpeak() {
    if (!LS.on || LS.paused) return;
    const p = C.p[LS.j];
    if (p === undefined) {  // end of the chapter: on to the next one
      if (SA.el) SA.el.pause();
      if (ch < B.toc.length - 1) go(ch + 1, 0).then(() => saMode(ch)).then(() => { LS.j = 0; LS.sents = lsSents(C.p[0] || ""); LS.k = 0; lsSpeak(); });
      else { lsStop(); toast("That's the end of the book"); }
      return;
    }
    if (LS.mode === "sonia" && SA.el && SA.key === id + "/" + ch) return saPlay();
    const [a, b] = LS.sents[LS.k] || [0, 0], r = RM.get(), text = p.slice(a, b);
    if (!text.trim()) { lsAdvance(1); return lsSpeak(); }
    const u = new SpeechSynthesisUtterance(text), v = lsVoice(LS.off);
    if (v) try { u.voice = v; u.lang = v.lang; } catch (e) {}
    u.rate = SA.set.speed || 1; u.volume = Math.max(0, Math.min(1, SA.set.vol == null ? 1 : SA.set.vol)); u.pitch = r.lpitch || 1;
    LS.utt = u; lsPaint(); lsBar();
    u.onend = () => {
      if (LS.utt !== u || !LS.on || LS.paused) return;
      const j0 = LS.j; lsAdvance(1);
      if (r.lgap && LS.j !== j0 && !document.hidden) setTimeout(() => { if (LS.utt === u && LS.on && !LS.paused) lsSpeak(); }, 550);
      else lsSpeak();
    };
    u.onerror = (e) => {
      if (LS.utt !== u || e.error === "interrupted" || e.error === "canceled") return;
      if (!LS.off && v && !v.localService) { LS.off = true; const o = lsVoice(true); toast("No internet for that voice: reading with " + (o ? lsName(o) : "this laptop's voice")); LS.utt = null; lsSpeak(); }
    };
    speechSynthesis.speak(u);
  }
  function lsAdvance(d) {
    LS.k += d;
    const ps = C.p;
    while (LS.k >= LS.sents.length) { LS.j++; if (LS.j >= ps.length) { LS.k = 0; return; } LS.sents = lsSents(ps[LS.j]); LS.k = 0; }
    while (LS.k < 0) { LS.j--; if (LS.j < 0) { LS.j = 0; LS.sents = lsSents(ps[0] || ""); LS.k = 0; return; } LS.sents = lsSents(ps[LS.j]); LS.k = LS.sents.length - 1; }
    if (LS.k === 0) api("reader/pos", { id, ch, p: LS.j }).catch(() => {});  // your place, as it goes (and Feather won't idle-lock while it reads)
  }
  function lsStart(fromJ) {
    if (!C) return;
    LS.utt = null; speechSynthesis.cancel();
    let k = 0;
    if (fromJ === undefined) {  // pick up on the sentence you stopped on if it's still on screen, else where you're looking
      const el = LS.lastCh === ch && rd.querySelector(`p[data-i="${LS.lastJ}"]`), r = el && el.getBoundingClientRect(), fr = rd.getBoundingClientRect();
      if (r && r.bottom > fr.top + 20 && r.top < fr.bottom - 40) { fromJ = LS.lastJ; k = LS.lastK || 0; } else fromJ = firstVisible();
    }
    Object.assign(LS, { on: true, paused: false, off: false, j: fromJ, k: 0, userScroll: 0, wasHidden: document.hidden });
    LS.sents = lsSents(C.p[LS.j] || ""); LS.k = Math.min(k, LS.sents.length - 1);
    $("#rplay").hidden = false; document.body.classList.add("rlistening");
    saMode(ch).then((ok) => { if (!ok && !("speechSynthesis" in window)) { lsStop(); return toast("This laptop has no read-aloud voice"); } lsSpeak(); });
  }
  function lsPause() { if (!LS.on) return; LS.paused = true; LS.utt = null; speechSynthesis.cancel(); if (SA.el) SA.el.pause(); api("reader/pos", { id, ch, p: LS.j }).catch(() => {}); lsPaint(); lsBar(); }
  function lsResume() { if (!LS.on) return; LS.paused = false; LS.off = false; lsSpeak(); }
  function lsStop() {
    const was = LS.on; if (was) Object.assign(LS, { lastCh: ch, lastJ: LS.j, lastK: LS.k }); LS.on = false; LS.paused = false; LS.utt = null;
    if (was) try { speechSynthesis.cancel(); } catch (e) {}
    if (SA.el) SA.el.pause();
    try { CSS.highlights && CSS.highlights.delete("rnow"); } catch (e) {}
    const pl = $("#rplay"); if (pl) pl.hidden = true; document.body.classList.remove("rlistening"); lsBar(); placeBub();
  }
  function lsJump(d) {
    LS.utt = null; speechSynthesis.cancel(); lsAdvance(d);
    if (LS.j >= C.p.length) { LS.j = C.p.length - 1; LS.sents = lsSents(C.p[LS.j] || ""); LS.k = LS.sents.length - 1; }
    LS.userScroll = 0; SA.seek = true;
    if (LS.paused) { if (LS.mode === "sonia" && SA.el) { const st = saTime(LS.j, (LS.sents[LS.k] || [0])[0]); if (st !== null) SA.el.currentTime = st; SA.seek = false; } lsPaint(); lsBar(); } else lsSpeak();
  }
  const lsName = (v) => v.name.replace(/^Microsoft\s+/, "").replace(/\s+Online/, "").replace(/\s+-\s+.*$/, "");
  function lsBar() {
    const lb = $("#rlis"); if (lb) { lb.classList.toggle("on", LS.on); lb.textContent = LS.on ? (LS.paused ? "▶ resume" : "■ stop reading") : "▶ read to me"; }
    const el = $("#rplay"); if (!el || !LS.on || !C) return;
    const r = RM.get(), p = C.p[LS.j] || "", [a, b] = LS.sents[LS.k] || [0, 0], s = p.slice(a, b);
    el.classList.toggle("tuck", !!r.ltuck);
    const pp = `<button class="rpb" data-a="pp" aria-label="${LS.paused ? "play (space)" : "pause (space)"}">${LS.paused ? "▶" : "II"}</button>`;
    const line = `<span class="rpl"><span class="rpk">${LS.paused ? "paused · space plays on" : (LS.mode === "sonia" ? "Sonia" : "reading to you") + (r.ltuck ? "" : " · space pauses · ← → a sentence")}</span><span class="rps">${esc(s)}</span></span>`;
    el.innerHTML = r.ltuck
      ? `${pp}${line}<button data-a="hl" title="highlight this sentence (H)">✦</button><button data-a="tuck" aria-label="open the player">⌃</button>`
      : `<button data-a="back" title="back a sentence (←)">−1</button>${pp}<button data-a="fwd" title="on a sentence (→)">+1</button>${line}
        <button data-a="hl">highlight this <kbd>H</kbd></button><button data-a="note">note <kbd>N</kbd></button><button data-a="bm" title="bookmark here" aria-label="bookmark here">🔖</button>
        <label class="sasl" title="speed">${(SA.set.speed || 1).toFixed(2)}×<input type="range" data-s="speed" min="0.6" max="2" step="0.05" value="${SA.set.speed || 1}" aria-label="speed"></label>
        <label class="sasl" title="volume">${Math.round(100 * (SA.set.vol == null ? 1 : SA.set.vol))}%<input type="range" data-s="vol" min="0" max="1" step="0.05" value="${SA.set.vol == null ? 1 : SA.set.vol}" aria-label="volume"></label>
        <button data-a="sonia" title="Sonia audio for this book">${LS.mode === "sonia" ? "Sonia ✓" : "Sonia"}</button><button data-a="voice">voice</button><button data-a="tuck" aria-label="tuck the player away" title="tuck it away (it keeps reading)">⌄</button><button data-a="x" aria-label="stop reading" title="stop (R)">✕</button>`;
    el.querySelectorAll("[data-a]").forEach((bt) => (bt.onclick = () => lsAct(bt.dataset.a)));
    el.querySelectorAll("[data-s]").forEach((sl) => {
      sl.oninput = () => { saSet({ [sl.dataset.s]: +sl.value }); sl.parentElement.firstChild.textContent = sl.dataset.s === "speed" ? (+sl.value).toFixed(2) + "×" : Math.round(100 * sl.value) + "%"; };
      sl.onchange = () => { if (LS.mode !== "sonia" && LS.on && !LS.paused) { LS.utt = null; speechSynthesis.cancel(); lsSpeak(); } };
    });
    requestAnimationFrame(placeBub);
  }
  async function lsAct(a) {
    if (!LS.on) return;
    if (a === "pp") return LS.paused ? lsResume() : lsPause();
    if (a === "back") return lsJump(-1);
    if (a === "fwd") return lsJump(1);
    if (a === "x") return lsStop();
    if (a === "tuck") { RM.set({ ltuck: !RM.get().ltuck }); return lsBar(); }
    if (a === "sonia") return soniaPop();
    if (a === "voice") return voicePop();
    const p = C.p[LS.j] || "", [x0, x1] = LS.sents[LS.k] || [0, p.length], text = p.slice(x0, x1);
    if (a === "bm") { if (pins.some((x) => x.k === "bm" && x.ch === ch && x.p === LS.j)) return toast("Already bookmarked here"); await addPin("bm", ch, LS.j); return toast(`Bookmarked · ¶ ${LS.j + 1}`); }
    if (a === "hl" || a === "note") {
      if (a === "note") lsPause();
      const R = await api("reader/mark", { id, op: "add", mark: { ch, a: LS.j, oa: x0, b: LS.j, ob: x1, c: 0, text } });
      B.marks = R.marks; render0(); drawSideIf();
      if (a === "note") { const el = rd.querySelector(`mark[data-m="${R.id}"]`); if (el) markPop(B.marks.find((m) => m.id === R.id), el, true); }
      else toast("Highlighted");
    }
  }
  function voicePop() {  // every voice on this laptop: Edge's natural ones (need internet) and Windows' own (offline)
    const vs = speechSynthesis.getVoices(), lang = (navigator.language || "en").slice(0, 2).toLowerCase(), r = RM.get();
    const L = vs.filter((v) => (/^en/i.test(v.lang) || v.lang.toLowerCase().startsWith(lang)) && !/maisie/i.test(v.name));
    const nat = L.filter((v) => !v.localService), off = L.filter((v) => v.localService), cur = lsVoice(false), fb = lsVoice(true);
    const row = (v) => `<div class="vrow ${cur && v.voiceURI === cur.voiceURI ? "on" : ""}" data-u="${esc(v.voiceURI)}" role="button" tabindex="0"><span class="rad"></span>
        <span class="vn"><b>${esc(lsName(v))}</b><span class="dim">${esc(v.lang)}${v.localService && cur && !cur.localService && fb && v.voiceURI === fb.voiceURI ? " · used when there's no internet" : ""}</span></span><button class="vp" data-p="${esc(v.voiceURI)}" aria-label="hear ${esc(lsName(v))}">▶</button></div>`;
    pop.innerHTML = `<div class="row" style="justify-content:space-between"><span class="serif" style="font-size:20px;color:var(--text)">Reading voice</span><button class="small" data-x aria-label="close">✕</button></div>
      <div class="vlist">${nat.length ? `<div class="cplab lime">Natural · need internet</div>${nat.map(row).join("")}` : ""}
        ${off.length ? `<div class="cplab">On this laptop · work offline</div>${off.map(row).join("")}` : ""}${!L.length ? `<div class="dim small">No voices listed yet. Close this and open it again in a moment.</div>` : ""}</div>
      <label class="cplab" for="vpi">Pitch · <span id="vpl">${(r.lpitch || 1).toFixed(2)}</span></label><input type="range" id="vpi" min="0.6" max="1.4" step="0.05" value="${r.lpitch || 1}">
      <label class="cplab" for="vra">Speed · <span id="vrl">${(SA.set.speed || 1).toFixed(2)}×</span></label><input type="range" id="vra" min="0.6" max="2" step="0.05" value="${SA.set.speed || 1}">
      <label class="row small" style="gap:8px"><input type="checkbox" id="vgap" ${r.lgap ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--lime)"> a short pause between paragraphs</label>`;
    pop.hidden = false; pop.classList.add("vpop");
    const w = Math.min(420, innerWidth - 16), pr = $("#rplay").getBoundingClientRect();
    pop.style.width = w + "px"; pop.style.left = Math.max(8, pr.right - w) + "px"; pop.style.top = Math.max(8, pr.top - pop.offsetHeight - 10) + "px";
    const say = (v) => { const was = LS.on && !LS.paused; if (was) lsPause(); const u = new SpeechSynthesisUtterance((C.p[LS.j] || "").slice(...(LS.sents[LS.k] || [0, 160])).slice(0, 200) || "In the morning, when you rise unwillingly, let this thought be present.");
      if (v) try { u.voice = v; u.lang = v.lang; } catch (e) {} u.rate = SA.set.speed || 1; u.pitch = RM.get().lpitch || 1; speechSynthesis.cancel(); speechSynthesis.speak(u); };
    const byU = (u) => vs.find((v) => v.voiceURI === u);
    pop.querySelector("[data-x]").onclick = () => { pop.hidden = true; pop.classList.remove("vpop"); };
    pop.querySelectorAll(".vrow").forEach((rw) => (rw.onclick = (e) => { if (e.target.closest(".vp")) return; const v = byU(rw.dataset.u); RM.set(v.localService ? { voice: v.voiceURI, voiceOff: v.voiceURI } : { voice: v.voiceURI }); LS.off = false; voicePop(); say(v); lsBar(); }));
    pop.querySelectorAll(".vp").forEach((bt) => (bt.onclick = () => say(byU(bt.dataset.p))));
    $("#vpi").oninput = (e) => { RM.set({ lpitch: +e.target.value }); $("#vpl").textContent = (+e.target.value).toFixed(2); };
    $("#vpi").onchange = () => say(lsVoice(false));
    $("#vra").oninput = (e) => { saSet({ speed: +e.target.value }); $("#vrl").textContent = (+e.target.value).toFixed(2) + "×"; lsBar(); };
    $("#vra").onchange = () => say(lsVoice(false));
    $("#vgap").onchange = (e) => RM.set({ lgap: e.target.checked });
  }
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { if (!pop.hidden && pop.classList.contains("vpop")) voicePop(); };
  function lsVis() {  // back from hiding (Ctrl+Alt+F): paused on the sentence you just heard
    if (document.hidden) { LS.wasHidden = true; return; }
    if (LS.on && !LS.paused && LS.wasHidden) { lsPause(); LS.userScroll = 0; lsPaint(); toast("Paused here · H highlight · N note · space plays on"); }
    LS.wasHidden = false;
  }
  document.addEventListener("visibilitychange", lsVis);
  $("#rlis").onclick = () => (!LS.on ? lsStart() : LS.paused ? lsResume() : lsStop());
  $("#rsa").onclick = () => soniaPop();

  // ----- keys: arrows turn chapters -----
  const keys = (e) => {
    if (!document.body.contains(rd)) { document.removeEventListener("keydown", keys); bar.remove(); pop.remove(); return; }
    if (e.key.toLowerCase() === "f" && !e.target.matches("input,textarea,select") && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setFull(!document.body.classList.contains("rfull")); return; }
    if (e.target.matches("input,textarea,select") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (LS.on && (e.key === " " || e.key === "ArrowLeft" || e.key === "ArrowRight" || /^[hn]$/i.test(e.key))) {
      e.preventDefault(); lsAct(e.key === " " ? "pp" : e.key === "ArrowLeft" ? "back" : e.key === "ArrowRight" ? "fwd" : e.key.toLowerCase() === "h" ? "hl" : "note"); return; }
    if (e.key.toLowerCase() === "r") { e.preventDefault(); !LS.on ? lsStart() : LS.paused ? lsResume() : lsStop(); return; }
    if (e.key === "ArrowRight" && ch < B.toc.length - 1) go(ch + 1, 0);
    else if (e.key === "ArrowLeft" && ch > 0) go(ch - 1, 0);
    else if (e.key.toLowerCase() === "n") { e.preventDefault(); CP.open ? closePanel() : openPanel(ch); }
    else if (e.key.toLowerCase() === "b") bookmarkHere();
    else if (e.key === "Escape" && CP.open && pop.hidden && bar.hidden) closePanel();
    else if (e.key === "Escape") { hideBar(); pop.hidden = true; if (document.body.classList.contains("rfull") && !document.fullscreenElement) setFull(false); }
    else if (e.key.toLowerCase() === "c") panel();
  };
  document.addEventListener("keydown", keys);
  window.addEventListener("hashchange", function gone() { if (!location.hash.startsWith("#/read/" + id)) { bar.remove(); pop.remove(); document.removeEventListener("keydown", keys); document.removeEventListener("fullscreenchange", fsChange); document.removeEventListener("pointermove", peek); if (document.body.classList.contains("rfull")) setFull(false); document.body.classList.remove("rpeek"); window.removeEventListener("hashchange", gone); clearInterval(liveT); document.body.classList.remove("cpopen"); delete document.body.dataset.rtheme; lsStop(); document.removeEventListener("visibilitychange", lsVis); removeEventListener("resize", placeBub); const rb = document.querySelector(".fdrep"); if (rb) rb.style.bottom = ""; } });

  drawSide();
  await go(ch, chArg !== undefined && chArg !== "" ? 0 : B.pos.p || 0);
  rd.focus({ preventScroll: true });
}
