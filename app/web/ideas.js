// ---------- Idea board: a big canvas like Paper. Cards for ideas, PDFs and pictures; lime threads tie them; the node on a thread cuts it ----------
// Pan: drag empty space (one finger on touch) · zoom: wheel or pinch · double-click empty space: new idea · drag a card's pin onto another card: tie a thread
(() => {
const css = `.ibx{position:absolute;inset:0;overflow:hidden;touch-action:none;background-color:var(--bg);background-image:radial-gradient(var(--line2) 1.1px,transparent 1.2px);cursor:default}
.ibx.pan{cursor:grabbing}.ibw{position:absolute;left:0;top:0;transform-origin:0 0}.ibs{position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none}
.ibs2{z-index:4}.ibs .cut{pointer-events:all;cursor:pointer}.ibs .cut circle{fill:var(--panel);stroke:var(--lime);stroke-width:1.6;transition:r .15s}.ibs .cut:hover circle{fill:var(--lime)}.ibs .cut text{font:11px sans-serif;fill:var(--lime);pointer-events:none;opacity:0}.ibs .cut:hover text{opacity:1;fill:#0c0d0b}
.ibc{position:absolute;width:210px;background:var(--panel);border:1px solid var(--line2);border-radius:10px;padding:14px 14px 12px;cursor:grab;user-select:none;box-shadow:0 10px 26px rgba(0,0,0,.45);transform-origin:50% 0}
.ibc.drag{cursor:grabbing;box-shadow:0 22px 40px rgba(0,0,0,.6);border-color:var(--lime);z-index:5}.ibc.sel{border-color:var(--lime)}.ibc.pop{animation:ibpop .5s cubic-bezier(.2,1.6,.4,1)}@keyframes ibpop{0%{transform:scale(.25) rotate(-8deg);opacity:0}}
.ibc .pin{position:absolute;left:50%;top:-7px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--lime);box-shadow:0 0 0 3px var(--bg),0 0 12px color-mix(in srgb,var(--lime) 60%,transparent);cursor:crosshair;touch-action:none}
.ibc h3{margin:0 0 4px;font:700 23px/1.1 Caveat,cursive;color:var(--text);outline:none}.ibc p{margin:0;font:19px/1.18 Caveat,cursive;color:var(--soft);outline:none;white-space:pre-wrap}
.ibc [contenteditable=true]{cursor:text;outline:1px dashed var(--line2);outline-offset:2px}
.ibc .tag{display:inline-flex;gap:6px;align-items:center;margin-top:9px;font:700 10px "JetBrains Mono",monospace;letter-spacing:.08em;border-radius:99px;padding:2px 8px;border:1px solid currentColor;outline:none}
.ibc .dot{width:8px;height:8px;border-radius:50%;background:currentColor;cursor:pointer}.ibc .x{position:absolute;right:6px;top:4px;background:none;border:0;color:var(--muted);font-size:17px;cursor:pointer;opacity:0}.ibc:hover .x{opacity:1}.ibc .x:hover{color:var(--bad)}
.ibc img{display:block;width:100%;border-radius:6px;margin:2px 0 8px;background:var(--bg)}.ibc .fn{font:11px "JetBrains Mono",monospace;color:var(--muted);word-break:break-all}.ibc .open{margin-top:6px;font:700 10px "JetBrains Mono",monospace;color:var(--lime);cursor:pointer}
.c-lime{color:var(--lime)}.c-coral{color:var(--bad)}.c-blue{color:#7fb4ff}.c-soft{color:var(--soft)}
.ibbar{position:absolute;left:14px;right:14px;top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;z-index:8;pointer-events:none}.ibbar>*{pointer-events:auto}
.ibbar button{font:700 11px "JetBrains Mono",monospace;letter-spacing:.06em;background:var(--panel);color:var(--soft);border:1px solid var(--line2);border-radius:99px;padding:6px 12px;cursor:pointer}.ibbar button:hover,.ibbar button.on{border-color:var(--lime);color:var(--lime)}
.ibbar .z{font:11px "JetBrains Mono",monospace;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:99px;padding:5px 10px}.ibbar .sp{flex:1}
.ibhint{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);font:11px "JetBrains Mono",monospace;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:99px;padding:6px 14px;z-index:8;pointer-events:none;transition:opacity .6s}
.ibdrop{position:absolute;inset:0;border:2px dashed var(--lime);background:color-mix(in srgb,var(--lime) 6%,transparent);z-index:9;display:none;align-items:center;justify-content:center;font:500 24px Newsreader,serif;color:var(--lime);pointer-events:none}.ibx.over .ibdrop{display:flex}`;
document.head.append(Object.assign(document.createElement("style"), { textContent: css }));
const COLORS = ["lime", "coral", "blue", "soft"], uid = () => Math.random().toString(16).slice(2, 10), cl = (x, a, b) => Math.max(a, Math.min(b, x));
const E = (v) => (typeof esc === "function" ? esc(v) : String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
let PDFJ = null;
const pdfjs = () => PDFJ || (PDFJ = window.pdfjsLib ? Promise.resolve(window.pdfjsLib) : new Promise((ok, no) => { const s = document.createElement("script"); s.src = "pdfjs/pdf.min.js"; s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = "pdfjs/pdf.worker.min.js"; ok(pdfjsLib); }; s.onerror = no; document.head.append(s); }));

window.vIdeas = async function () {
  const m = shell("ideas", `<div class="ibx" id="ibx"><div class="ibw" id="ibw"><svg class="ibs" id="ibs"></svg><svg class="ibs ibs2" id="ibs2"></svg></div>
    <div class="ibbar"><button id="ibn">+ IDEA</button><button id="ibf">+ PDF / PICTURE</button><input id="ibfi" type="file" accept="application/pdf,image/*" multiple hidden><span id="ibtags"></span><span class="sp"></span><button id="ibfit">FIT</button><span class="z" id="ibz">100%</span></div>
    <div class="ibhint" id="ibhint">drag empty space to move · scroll or pinch to zoom · double-click for a new idea · drop PDFs and pictures anywhere · drag a lime pin onto a card to tie a thread</div>
    <div class="ibdrop">Drop to pin it on the board</div></div>`);
  m.style.position = "relative"; m.style.padding = "0"; m.style.overflow = "hidden";
  const X = m.querySelector("#ibx"), W = m.querySelector("#ibw"), SV = m.querySelector("#ibs"), SV2 = m.querySelector("#ibs2");
  let st = { cards: [], links: [], view: null };
  try { st = await api("ideas"); } catch (e) {}
  st.cards = st.cards || []; st.links = st.links || [];
  let view = st.view || { x: 120, y: 90, z: 1 }, filter = "", sel = null, saveT = 0;
  const el = {}, born = new Map(), cutting = new Map();
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => api("ideas/save", { cards: st.cards, links: st.links, view }).catch(() => {}), 700); };
  const apply = () => { W.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`; X.style.backgroundSize = `${26 * view.z}px ${26 * view.z}px`; X.style.backgroundPosition = `${view.x}px ${view.y}px`; m.querySelector("#ibz").textContent = Math.round(view.z * 100) + "%"; };
  const toWorld = (cx, cy) => { const r = X.getBoundingClientRect(); return [(cx - r.left - view.x) / view.z, (cy - r.top - view.y) / view.z]; };
  // ---- cards ----
  function render(c, pop) {
    const d = document.createElement("div"); d.className = "ibc" + (pop ? " pop" : ""); d.dataset.id = c.id;
    const tag = `<span class="tag c-${c.color || "lime"}"><i class="dot" title="change colour"></i><span class="tg">${E(c.tag || "IDEA")}</span></span>`;
    d.innerHTML = `<div class="pin" title="drag onto another card to tie a thread"></div><button class="x" title="remove">×</button>` + (c.kind === "file"
      ? `${c.thumb ? `<img src="${c.thumb}" alt="">` : ""}<h3>${E(c.title || c.fname)}</h3><div class="fn">${E(c.fname || "")}</div><div class="open">OPEN ↗</div>${tag}`
      : `<h3>${E(c.title || "New idea")}</h3><p>${E(c.body || "")}</p>${tag}`);
    W.append(d); el[c.id] = d; place(c);
    d.addEventListener("dblclick", (e) => { const t = e.target.closest("h3,p,.tg"); if (!t) return; e.stopPropagation(); edit(t, c); });
    d.querySelector(".dot").onclick = (e) => { e.stopPropagation(); c.color = COLORS[(COLORS.indexOf(c.color || "lime") + 1) % COLORS.length]; d.querySelector(".tag").className = "tag c-" + c.color; save(); };
    d.querySelector(".x").onclick = (e) => { e.stopPropagation(); remove(c); };
    const o = d.querySelector(".open"); if (o) o.onclick = (e) => { e.stopPropagation(); window.open("/idea-file/" + c.fid, "_blank"); };
    d.addEventListener("pointerdown", (e) => down(e, c));
    return d;
  }
  function edit(t, c) {
    t.contentEditable = true; t.focus(); document.getSelection().selectAllChildren(t);
    t.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter" && !(t.tagName === "P" && e.shiftKey)) { if (t.tagName !== "P" || e.ctrlKey) { e.preventDefault(); t.blur(); } } if (e.key === "Escape") t.blur(); };
    t.onblur = () => { t.contentEditable = false; const v = t.innerText.trim(); if (t.tagName === "H3") c.title = v; else if (t.tagName === "P") c.body = v; else c.tag = v.toUpperCase() || "IDEA"; tags(); save(); };
  }
  function place(c) { const d = el[c.id]; if (!d) return; d.style.left = c.x + "px"; d.style.top = c.y + "px"; d.style.transform = c.r ? `rotate(${c.r}deg)` : ""; }
  function remove(c) {
    st.cards = st.cards.filter((x) => x !== c); st.links = st.links.filter((l) => l.a !== c.id && l.b !== c.id); el[c.id]?.remove(); delete el[c.id];
    if (c.kind === "file" && c.fid) api("ideas/file/delete", { fid: c.fid }).catch(() => {});
    tags(); save();
  }
  function add(c, pop = true) { st.cards.push(c); render(c, pop); tags(); save(); return c; }
  const newIdea = (x, y) => { const c = add({ id: uid(), kind: "note", x: x - 105, y: y - 20, title: "New idea", body: "", tag: filter || "IDEA", color: "lime" }); setTimeout(() => edit(el[c.id].querySelector("h3"), c), 80); };
  // ---- files: PDFs and pictures, dropped or picked ----
  async function thumb(f) {
    try {
      const cv = document.createElement("canvas"), g = cv.getContext("2d");
      if (f.type === "application/pdf") { const lib = await pdfjs(), pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise, pg = await pdf.getPage(1), v0 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: 360 / v0.width }); cv.width = v.width; cv.height = Math.min(v.height, 460); await pg.render({ canvasContext: g, viewport: v }).promise; }
      else { const b = await createImageBitmap(f), s = Math.min(1, 360 / b.width); cv.width = b.width * s; cv.height = Math.min(b.height * s, 460); g.drawImage(b, 0, 0, b.width * s, b.height * s); }
      return cv.toDataURL("image/jpeg", 0.72);
    } catch (e) { return ""; }
  }
  async function bring(files, x, y) {
    let k = 0;
    for (const f of files) {
      if (!/^(application\/pdf|image\/)/.test(f.type)) { toast?.("Only PDFs and pictures can go on the board."); continue; }
      if (f.size > 60e6) { toast?.(f.name + " is over 60 MB."); continue; }
      const data = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });
      const [th, up] = await Promise.all([thumb(f), api("ideas/file", { name: f.name, type: f.type, data }).catch((e) => ({ error: e.message }))]);
      if (!up.fid) { toast?.(up.error || "Couldn't save " + f.name); continue; }
      add({ id: uid(), kind: "file", x: x - 105 + k * 30, y: y - 40 + k * 30, title: f.name.replace(/\.[^.]+$/, ""), fname: f.name, fid: up.fid, thumb: th, tag: f.type === "application/pdf" ? "PDF" : "PICTURE", color: "blue" });
      k++;
    }
  }
  X.addEventListener("dragover", (e) => { e.preventDefault(); X.classList.add("over"); });
  X.addEventListener("dragleave", (e) => { if (e.target === X || !X.contains(e.relatedTarget)) X.classList.remove("over"); });
  X.addEventListener("drop", (e) => { e.preventDefault(); X.classList.remove("over"); const [x, y] = toWorld(e.clientX, e.clientY); bring([...e.dataTransfer.files], x, y); });
  m.querySelector("#ibf").onclick = () => m.querySelector("#ibfi").click();
  m.querySelector("#ibfi").onchange = (e) => { const r = X.getBoundingClientRect(), [x, y] = toWorld(r.left + r.width / 2, r.top + r.height / 2); bring([...e.target.files], x, y); e.target.value = ""; };
  m.querySelector("#ibn").onclick = () => { const r = X.getBoundingClientRect(), [x, y] = toWorld(r.left + r.width / 2, r.top + r.height / 2); newIdea(x, y); };
  // ---- tags filter ----
  function tags() {
    const ts = [...new Set(st.cards.map((c) => (c.tag || "IDEA").toUpperCase()))].sort(), b = m.querySelector("#ibtags");
    b.innerHTML = ["", ...ts].map((t) => `<button data-t="${E(t)}" class="${t === filter ? "on" : ""}">${t ? E(t) : "ALL"}</button>`).join(" ");
    b.querySelectorAll("button").forEach((x) => x.onclick = () => { filter = x.dataset.t; tags(); dim(); });
  }
  const dim = () => st.cards.forEach((c) => { const d = el[c.id]; if (d) d.style.opacity = !filter || (c.tag || "IDEA").toUpperCase() === filter ? 1 : 0.18; });
  // ---- pointer: drag cards, tie threads, pan, pinch ----
  const P = new Map(); let mode = null, grab = null, tie = null, pinch = null, mouse = [0, 0];
  function down(e, c) {
    if (e.target.isContentEditable || e.target.closest(".x,.dot,.open")) return;
    e.stopPropagation(); P.set(e.pointerId, [e.clientX, e.clientY]);
    sel && el[sel]?.classList.remove("sel"); sel = c.id; el[c.id].classList.add("sel");
    if (e.target.classList.contains("pin")) { mode = "tie"; tie = { from: c.id }; return; }
    const [x, y] = toWorld(e.clientX, e.clientY); mode = "card"; grab = { c, dx: x - c.x, dy: y - c.y, lx: x }; el[c.id].classList.add("drag");
  }
  X.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ibbar") || e.target.closest(".ibc") || e.target.closest(".cut")) return;
    P.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.size === 2) { const [a, b] = [...P.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: view.z, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, vx: view.x, vy: view.y }; mode = "pinch"; return; }
    sel && el[sel]?.classList.remove("sel"); sel = null; mode = "pan"; grab = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; X.classList.add("pan");
  });
  const move = (e) => { if (!X.isConnected) return;
    if (!P.has(e.pointerId)) { mouse = toWorld(e.clientX, e.clientY); return; }
    P.set(e.pointerId, [e.clientX, e.clientY]); mouse = toWorld(e.clientX, e.clientY);
    if (mode === "card") { const c = grab.c; c.x = mouse[0] - grab.dx; c.y = mouse[1] - grab.dy; c.r = cl((mouse[0] - grab.lx) * 0.5, -9, 9); grab.lx = mouse[0]; place(c); }
    else if (mode === "pan") { view.x = grab.vx + e.clientX - grab.sx; view.y = grab.vy + e.clientY - grab.sy; apply(); }
    else if (mode === "pinch" && P.size === 2) { const [a, b] = [...P.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), z = cl(pinch.z * d / pinch.d, 0.2, 2.5), r = X.getBoundingClientRect(), wx = (pinch.cx - r.left - pinch.vx) / pinch.z, wy = (pinch.cy - r.top - pinch.vy) / pinch.z, cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      view.z = z; view.x = cx - r.left - wx * z; view.y = cy - r.top - wy * z; apply(); }
  };
  addEventListener("pointermove", move);
  const up = (e) => {
    if (!X.isConnected) { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); return; }
    if (!P.has(e.pointerId)) return; P.delete(e.pointerId);
    if (mode === "card") { el[grab.c.id].classList.remove("drag"); save(); }
    if (mode === "tie") { const t = document.elementFromPoint(e.clientX, e.clientY)?.closest(".ibc"), to = t?.dataset.id;
      if (to && to !== tie.from && !st.links.some((l) => (l.a === tie.from && l.b === to) || (l.a === to && l.b === tie.from))) { st.links.push({ a: tie.from, b: to }); born.set(st.links.at(-1), performance.now()); save(); } tie = null; }
    if (mode === "pan" || mode === "pinch") save();
    if (!P.size) { mode = null; X.classList.remove("pan"); }
  };
  addEventListener("pointerup", up); addEventListener("pointercancel", up);
  X.addEventListener("wheel", (e) => { e.preventDefault(); const r = X.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, z = cl(view.z * Math.exp(-e.deltaY * 0.0015), 0.2, 2.5); view.x = mx - (mx - view.x) * z / view.z; view.y = my - (my - view.y) * z / view.z; view.z = z; apply(); save(); }, { passive: false });
  X.addEventListener("dblclick", (e) => { if (e.target.closest(".ibc,.ibbar")) return; const [x, y] = toWorld(e.clientX, e.clientY); newIdea(x, y); });
  const keys = (e) => { if (!X.isConnected) return document.removeEventListener("keydown", keys); if ((e.key === "Delete" || e.key === "Backspace") && sel && !e.target.isContentEditable && !e.target.matches("input,textarea")) { const c = st.cards.find((x) => x.id === sel); if (c) remove(c); sel = null; } };
  document.addEventListener("keydown", keys);
  m.querySelector("#ibfit").onclick = () => { if (!st.cards.length) return; const xs = st.cards.map((c) => c.x), ys = st.cards.map((c) => c.y), r = X.getBoundingClientRect(), x0 = Math.min(...xs) - 60, x1 = Math.max(...xs) + 270, y0 = Math.min(...ys) - 80, y1 = Math.max(...ys) + 260;
    const z = cl(Math.min(r.width / (x1 - x0), r.height / (y1 - y0)), 0.2, 1.4), from = { ...view }, to = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z + 20 }, t0 = performance.now();
    (function step(n) { const u = Math.min(1, (n - t0) / 450), k = 1 - Math.pow(1 - u, 3); view = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k }; apply(); if (u < 1) requestAnimationFrame(step); else save(); })(t0); };
  // ---- threads: sagging strings that sway; the node in the middle cuts them ----
  const pinOf = (id) => { const c = st.cards.find((x) => x.id === id), d = el[id]; return c && d ? [c.x + d.offsetWidth / 2, c.y] : null; };
  SV2.addEventListener("pointerdown", (e) => { const g = e.target.closest(".cut"); if (g) e.stopPropagation(); if (!g) return; const l = st.links[+g.dataset.i]; if (l && !cutting.has(l)) cutting.set(l, performance.now()); });
  function frame(n) {
    if (!X.isConnected) return; const t = n / 1000; let s = "", s2 = "";
    st.links.forEach((l, i) => {
      const A = pinOf(l.a), B = pinOf(l.b); if (!A || !B) return;
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2 + 46 + Math.sin(t * 1.3 + i) * 6, mid = [(A[0] + 2 * mx + B[0]) / 4, (A[1] + 2 * my + B[1]) / 4], bt = born.get(l), u = bt ? Math.min(1, (n - bt) / 500) : 1, ct = cutting.get(l);
      const off = filter && ![l.a, l.b].every((id) => (st.cards.find((c) => c.id === id)?.tag || "IDEA").toUpperCase() === filter) ? 0.12 : 0.55;
      if (ct) { // snap: each half whips back to its own card
        const k = Math.min(1, (n - ct) / 420), e2 = 1 - Math.pow(1 - k, 3), half = (P0, P2) => { const q = [P0[0] + (mid[0] - P0[0]) * (1 - e2), P0[1] + (mid[1] - P0[1]) * (1 - e2) + Math.sin(k * 9) * 14 * (1 - k)]; return `M${P0[0]},${P0[1]} Q${(P0[0] + q[0]) / 2},${(P0[1] + q[1]) / 2 + 18 * (1 - e2)} ${q[0]},${q[1]}`; };
        s += `<path d="${half(A)} ${half(B)}" fill="none" stroke="#ff8a6b" stroke-opacity="${0.8 * (1 - k)}" stroke-width="1.6"/>`;
        if (k >= 1) { st.links = st.links.filter((x) => x !== l); cutting.delete(l); save(); }
        return;
      }
      s += `<path d="M${A[0]},${A[1]} Q${mx},${my} ${B[0]},${B[1]}" fill="none" stroke="var(--lime)" stroke-opacity="${off}" stroke-width="1.7" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - u}"/>`;
      if (u >= 1) s2 += `<g class="cut" data-i="${i}" transform="translate(${mid[0]},${mid[1]})"><title>cut this thread</title><circle r="6"/><text text-anchor="middle" y="4">✂</text></g>`;
    });
    if (tie) { const A = pinOf(tie.from); if (A) s2 += `<path d="M${A[0]},${A[1]} Q${(A[0] + mouse[0]) / 2},${(A[1] + mouse[1]) / 2 + 30} ${mouse[0]},${mouse[1]}" fill="none" stroke="var(--lime)" stroke-width="1.7" stroke-dasharray="4 5"/>`; }
    SV.innerHTML = s; SV2.innerHTML = s2;
    st.cards.forEach((c) => { if (c.r && (!grab || grab.c !== c || mode !== "card")) { c.r *= 0.86; if (Math.abs(c.r) < 0.05) c.r = 0; place(c); } });
    requestAnimationFrame(frame);
  }
  st.cards.forEach((c, i) => setTimeout(() => X.isConnected && render(c, true), Math.min(i, 20) * 45));
  apply(); tags(); requestAnimationFrame(frame);
  if (!st.cards.length) setTimeout(() => { const r = X.getBoundingClientRect(), [x, y] = toWorld(r.left + r.width / 2, r.top + r.height / 2); add({ id: uid(), kind: "note", x: x - 105, y: y - 40, title: "Your first idea", body: "Double-click to edit.\nDrop a PDF next to it, then drag this lime pin onto it.", tag: "IDEA", color: "lime" }); }, 300);
  setTimeout(() => { const h = m.querySelector("#ibhint"); if (h) h.style.opacity = 0; }, 9000);
};
})();
