// ---------- Paper: handwritten notebooks and endless canvases (pen, finger or any stylus) ----------
// World units: a page is 1000 wide and page.h tall (1400 by default, grows as you write). A canvas has no edges.
// Items: strokes {k:"p"|"h", c, w, p:[x,y,pressure,...]} and pictures {k:"i", a:assetId, x, y, w, h}.
const PW = 1000, PH = 1400;
const PTH = {
  dark: { bg: "#141612", line: "#262a22", line2: "#3a4033", margin: "rgba(255,122,107,.22)", ink: ["#f0eee6", "#c6f432", "#ff7a6b", "#7fb4ff"] },
  sepia: { bg: "#f1e7d0", line: "#ddcfb2", line2: "#c4b28c", margin: "rgba(200,60,40,.25)", ink: ["#3b2f22", "#5b7a12", "#c0432f", "#2f5fae"] },
  paper: { bg: "#fbfaf6", line: "#e4e1d7", line2: "#cbc6b6", margin: "rgba(214,64,47,.25)", ink: ["#1d1d1b", "#4f7d00", "#d6402f", "#2f6fd6"] },
};
const HLC = ["rgba(255,214,0,.36)", "rgba(198,244,50,.30)", "rgba(255,122,107,.30)", "rgba(127,180,255,.32)"];
const TPL = [["blank", "Blank"], ["lined", "Lined"], ["grid", "Grid"], ["dot", "Dot grid"], ["cornell", "Cornell"], ["graph", "Graph"], ["story", "Storyboard"]];
const LINE = 44;
const isBox = (s) => s.k === "i" || s.k === "t";
const STICKY = ["#f2d46b", "#c6f432", "#ff9ab0", "#8fc1ff"];
// text boxes and sticky notes: a font each (ff), a size (fs), and stickies can fold to one line (col)
const FONTS = { serif: "Newsreader, Georgia, serif", hand: "Caveat, Newsreader, Georgia, serif", sans: "'Segoe UI', system-ui, sans-serif", mono: "'JetBrains Mono', Consolas, monospace" };
const FONT_NAMES = { serif: "Serif", hand: "Handwriting", sans: "Sans", mono: "Mono" };
const tFF = (s) => (FONTS[s.ff] ? s.ff : "serif");
const tFont = (s) => FONTS[tFF(s)];
const tPad = (s) => (s.sticky ? 16 : 4);
const FOLDH = (s) => tPad(s) * 2 + (s.fs || 22) * 1.3;
const FOLDING = new WeakMap();  // a sticky in the middle of folding or unfolding -> its height right now
const tShown = (s) => (FOLDING.has(s) ? FOLDING.get(s) : s.sticky && s.col ? FOLDH(s) : s.h);  // a folded sticky shows its first line
const foldBtn = (s) => { const z = 28, hh = tShown(s), y = s.col ? s.y + (hh - z) / 2 : s.y + 6; return [s.x + s.w - z - 6, y, s.x + s.w - 6, y + z]; };  // the little arrow, top right
function wrapText(x, text, w) {  // -> lines that fit width w with the current font
  const out = [];
  for (const para of String(text || "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const t = line ? line + " " + word : word;
      if (x.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

// pictures (imported images and PDF pages), decrypted by Feather and cached here
const ASSETS = {};
function asset(id, onload) {
  if (!id) return null;
  let a = ASSETS[id];
  if (!a) { a = ASSETS[id] = { img: new Image(), cbs: [] }; a.img.onload = () => { a.cbs.splice(0).forEach((f) => f()); }; a.img.src = "/paper-asset/" + id; }
  if (!a.img.complete && onload) a.cbs.push(onload);
  return a.img.complete && a.img.naturalWidth ? a.img : null;
}

function drawTemplate(x, tpl, th, h = PH) {
  const T = PTH[th] || PTH.dark;
  x.fillStyle = T.bg; x.fillRect(0, 0, PW, h);
  x.lineWidth = 1.2; x.strokeStyle = T.line;
  const hline = (y, a = 0, b = PW) => { x.beginPath(); x.moveTo(a, y); x.lineTo(b, y); x.stroke(); };
  const vline = (X, a = 0, b = h) => { x.beginPath(); x.moveTo(X, a); x.lineTo(X, b); x.stroke(); };
  const grid = (g) => { for (let X = g; X < PW; X += g) vline(X); for (let y = g; y < h; y += g) hline(y); };
  if (tpl === "lined") { for (let y = 140; y < h - 20; y += LINE) hline(y); x.strokeStyle = T.margin; vline(90); }
  if (tpl === "grid") grid(40);
  if (tpl === "dot") { x.fillStyle = T.line2; for (let X = 40; X < PW; X += 40) for (let y = 40; y < h; y += 40) { x.beginPath(); x.arc(X, y, 2, 0, 7); x.fill(); } }
  if (tpl === "graph") { grid(40); x.strokeStyle = T.line2; x.lineWidth = 2.4; hline(Math.round(h / 80) * 40); vline(PW / 2); }
  if (tpl === "cornell") {
    const end = h - 220;
    for (let y = 174; y < end; y += LINE) hline(y, 290, PW);
    x.strokeStyle = T.line2; x.lineWidth = 2.4; hline(130); vline(280, 130, end); hline(end);
    x.fillStyle = T.line2; x.font = "22px JetBrains Mono, monospace"; x.fillText("topic · date", 30, 90); x.fillText("cues", 30, 170); x.fillText("summary", 30, end + 40);
  }
  if (tpl === "story") {
    x.strokeStyle = T.line2; x.lineWidth = 2.4;
    for (let r = 0; 60 + r * 445 + 380 < h; r++) for (let c = 0; c < 2; c++) {
      const X = 50 + c * 470, Y = 60 + r * 445;
      x.strokeRect(X, Y, 430, 280); x.save(); x.strokeStyle = T.line; x.lineWidth = 1.2; hline(Y + 325, X, X + 430); hline(Y + 370, X, X + 300); x.restore();
    }
  }
}
// an endless canvas: only the visible part of the pattern is drawn
function drawPattern(x, tpl, th, [x0, y0, x1, y1], z) {
  const T = PTH[th] || PTH.dark;
  x.fillStyle = T.bg; x.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (tpl === "blank") return;
  let g = 40; while (g * z < 14) g *= 4;  // keep the pattern readable when zoomed far out
  const sx = Math.floor(x0 / g) * g, sy = Math.floor(y0 / g) * g;
  if (tpl === "dot") { x.fillStyle = T.line2; const r = Math.max(1.2, 2 / Math.sqrt(z)) ; for (let X = sx; X < x1; X += g) for (let y = sy; y < y1; y += g) { x.fillRect(X - r / 2, y - r / 2, r, r); } return; }
  x.strokeStyle = T.line; x.lineWidth = 1.2 / z; x.beginPath();
  for (let X = sx; X < x1; X += g) { x.moveTo(X, y0); x.lineTo(X, y1); }
  for (let y = sy; y < y1; y += g) { x.moveTo(x0, y); x.lineTo(x1, y); }
  x.stroke();
}

function drawStroke(x, s, th, onload, tint) {
  if (s.k === "t") {  // a sticky note or a text box
    if (tint) return;
    const fs = s.fs || 22, pad = tPad(s), hh = tShown(s);
    if (s.sticky) { x.save(); x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 14; x.shadowOffsetY = 5; x.fillStyle = STICKY[s.c] || STICKY[0]; x.fillRect(s.x, s.y, s.w, hh); x.restore(); }
    x.fillStyle = s.sticky ? "#1d1d1b" : (PTH[th] || PTH.dark).ink[s.c] || "#fff";
    x.font = `${fs}px ${tFont(s)}`; x.textBaseline = "top";
    let lines = wrapText(x, s.text, s.w - pad * 2 - (s.sticky ? 26 : 0));
    if (s.sticky && s.col && !FOLDING.has(s)) {  // folded: the first line, cut to fit beside the arrow
      let first = lines[0] || "", more = lines.length > 1;
      while (first && x.measureText(first + (more ? " …" : "")).width > s.w - pad * 2 - 30) { first = first.slice(0, -1); more = true; }
      lines = [first + (more ? " …" : "")];
    }
    if (s.sticky) { x.save(); x.beginPath(); x.rect(s.x, s.y, s.w, hh); x.clip(); }
    lines.forEach((ln, i) => { if (!s.sticky || !i || pad + i * fs * 1.3 < hh) x.fillText(ln, s.x + pad, s.y + pad + i * fs * 1.3); });
    if (s.sticky) {  // the fold arrow: ⌃ folds it up, ⌄ opens it
      x.restore();
      const [a, b, c, d] = foldBtn(s), cx = (a + c) / 2, cy = (b + d) / 2, k = 6;
      x.save(); x.fillStyle = "rgba(0,0,0,.08)"; x.beginPath(); x.arc(cx, cy, 13, 0, Math.PI * 2); x.fill();
      x.strokeStyle = "rgba(0,0,0,.55)"; x.lineWidth = 2.4; x.lineCap = "round"; x.lineJoin = "round"; x.beginPath();
      if (s.col) { x.moveTo(cx - k, cy - k / 2); x.lineTo(cx, cy + k / 2); x.lineTo(cx + k, cy - k / 2); } else { x.moveTo(cx - k, cy + k / 2); x.lineTo(cx, cy - k / 2); x.lineTo(cx + k, cy + k / 2); }
      x.stroke(); x.restore();
    }
    return;
  }
  if (s.k === "i") {
    if (tint) return;
    const img = asset(s.a, onload);
    if (img) x.drawImage(img, s.x, s.y, s.w, s.h);
    else { x.fillStyle = "rgba(128,128,128,.15)"; x.fillRect(s.x, s.y, s.w, s.h); }
    return;
  }
  const p = s.p, n = p.length / 3;
  if (!n) return;
  x.lineCap = "round"; x.lineJoin = "round";
  if (s.k === "h") {
    if (tint) return;
    x.strokeStyle = HLC[s.c] || HLC[0]; x.lineWidth = 14 + s.w * 4;
    x.beginPath(); x.moveTo(p[0], p[1]);
    for (let i = 1; i < n; i++) x.lineTo(p[i * 3], p[i * 3 + 1]);
    if (n === 1) x.lineTo(p[0] + 0.1, p[1]);
    x.stroke(); return;
  }
  const col = tint || (PTH[th] || PTH.dark).ink[s.c] || "#fff", base = 1.1 + s.w * 0.85;
  x.strokeStyle = col; x.fillStyle = col;
  if (n === 1) { x.beginPath(); x.arc(p[0], p[1], base * (0.35 + 0.9 * p[2]) / 2, 0, 7); x.fill(); return; }
  let mx = p[0], my = p[1];
  for (let i = 1; i < n; i++) {
    const X = p[i * 3], Y = p[i * 3 + 1], last = i === n - 1;
    const nx = last ? X : (X + p[i * 3 + 3]) / 2, ny = last ? Y : (Y + p[i * 3 + 4]) / 2;
    x.lineWidth = base * (0.35 + 0.9 * (p[i * 3 - 1] + p[i * 3 + 2]) / 2);
    x.beginPath(); x.moveTo(mx, my); x.quadraticCurveTo(X, Y, nx, ny); x.stroke();
    mx = nx; my = ny;
  }
}
const BOX = new WeakMap();
function sbox(s) {
  let b = BOX.get(s);
  if (b) return b;
  if (FOLDING.has(s)) return [s.x, s.y, s.x + s.w, s.y + Math.max(s.h, FOLDING.get(s))];
  if (isBox(s)) b = [s.x, s.y, s.x + s.w, s.y + (s.k === "t" ? tShown(s) : s.h)];
  else { let a = 1e9, c = 1e9, d = -1e9, e = -1e9; for (let i = 0; i < s.p.length; i += 3) { a = Math.min(a, s.p[i]); c = Math.min(c, s.p[i + 1]); d = Math.max(d, s.p[i]); e = Math.max(e, s.p[i + 1]); } const m = s.k === "h" ? 14 + s.w * 4 : 2 + s.w; b = [a - m, c - m, d + m, e + m]; }
  BOX.set(s, b); return b;
}
function allBox(list) { let b = null; for (const s of list) { const q = sbox(s); b = b ? [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])] : q.slice(); } return b; }

// a whole page (or a canvas, cropped to what's drawn) into a canvas element: thumbnails and export
function renderPage(canvas, strokes, pg, th, kind, onload) {
  const x = canvas.getContext("2d");
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, canvas.width, canvas.height);
  if (kind === "canvas") {
    const b = allBox(strokes) || [0, 0, 1000, 700], m = 60, w = b[2] - b[0] + 2 * m, h = b[3] - b[1] + 2 * m;
    const k = Math.min(canvas.width / w, canvas.height / h);
    x.setTransform(k, 0, 0, k, (canvas.width - w * k) / 2 - (b[0] - m) * k, (canvas.height - h * k) / 2 - (b[1] - m) * k);
    drawPattern(x, pg.tpl, th, [b[0] - m - 1e4, b[1] - m - 1e4, b[2] + m + 1e4, b[3] + m + 1e4], k);
  } else {
    const k = canvas.width / PW;
    x.setTransform(k, 0, 0, k, 0, 0);
    drawTemplate(x, pg.bg ? "blank" : pg.tpl, pg.bg ? "paper" : th, pg.h || PH);
    if (pg.bg) { const img = asset(pg.bg, onload); if (img) x.drawImage(img, 0, 0, PW, pg.h || PH); }
  }
  for (const s of strokes) drawStroke(x, s, th, onload);
}

// a list of canvases -> an animated GIF download (gifenc)
function saveGif(frames, delays, name) {
  const { GIFEncoder, quantize, applyPalette } = window.gifenc, g = GIFEncoder();
  frames.forEach((c, i) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, pal = quantize(d, 256), idx = applyPalette(d, pal); g.writeFrame(idx, c.width, c.height, { palette: pal, delay: Array.isArray(delays) ? delays[i] : delays }); });
  g.finish();
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([g.bytes()], { type: "image/gif" })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}
// a stroke list cut off after k points (for replays); pictures count as one point
function partialList(list, k) {
  const out = [];
  for (const s of list) {
    if (k <= 0) break;
    const n = isBox(s) ? 1 : s.p.length / 3;
    if (n <= k) { out.push(s); k -= n; } else { out.push({ ...s, p: s.p.slice(0, Math.max(1, Math.floor(k)) * 3) }); k = 0; }
  }
  return out;
}
const pointCount = (list) => list.reduce((a, s) => a + (isBox(s) ? 1 : s.p.length / 3), 0);

// ---------- notebook list ----------
async function vPaper(nb, pg) {
  if (nb) return paperBook(nb, pg);
  const L = await api("paper/list");
  const m = shell("paper", `<div class="col" style="gap:18px">
    <div class="row" style="justify-content:space-between;align-items:baseline"><h1>Paper</h1><span class="muted small">Write and draw with a pen, a stylus or your finger. Pages go to Obsidian when you plug into your PC.</span></div>
    <div class="nbgrid">
      <form class="nb new" id="nf"><div class="k">New</div><input id="nt" placeholder="name (e.g. Robotics)" autocomplete="off">
        <select id="nk"><option value="pages">Notebook</option><option value="canvas">Canvas</option><option value="flip">Flipbook</option></select>
        <select id="np">${TPL.map(([k, l]) => `<option value="${k}" ${k === "lined" ? "selected" : ""}>${l} paper</option>`).join("")}</select><button class="go">start</button>
        <button type="button" id="nimp" class="nimp" title="import a PDF or a picture">${pic("import", 16)}<span>import PDF</span></button></form>
      ${L.map((b) => `<a class="nb" href="#/paper/${b.id}"><button class="nbdel small del" data-del="${b.id}" title="delete this ${b.kind === "canvas" ? "canvas" : b.kind === "flip" ? "flipbook" : "notebook"}" aria-label="delete ${esc(b.title)}">delete</button><canvas class="nbthumb" data-nb="${b.id}" width="200" height="280"></canvas>
        <div class="nbt">${esc(b.title)}</div><div class="dim small">${b.kind === "canvas" ? "canvas" : b.kind === "flip" ? `flipbook · ${b.pages.length} frame${b.pages.length === 1 ? "" : "s"}` : `${b.pages.length} page${b.pages.length === 1 ? "" : "s"}`} · ${ago(b.t)}</div></a>`).join("")}
    </div>
    ${L.length ? "" : `<div class="card">${EMPTY("doc", "No notebooks yet", "Make a notebook for pages or a canvas for an endless board. Import a PDF to write and highlight on it.")}</div>`}</div>`);
  $("#nk").onchange = () => { $("#np").value = { canvas: "dot", flip: "blank" }[$("#nk").value] || "lined"; };
  $("#nf").onsubmit = async (e) => { e.preventDefault(); const r = await api("paper/new", { title: $("#nt").value, tpl: $("#np").value, kind: $("#nk").value }); location.hash = "#/paper/" + r.id; };
  $("#nimp").onclick = () => importMenu($("#nimp"), { newNotebook: true });
  m.querySelectorAll(".nbdel").forEach((btn) => sure(btn, async () => { await api("paper/delete", { nb: btn.dataset.del }); toast("Deleted"); btn.closest(".nb").remove(); }, "tap again"));
  m.querySelectorAll(".nbthumb").forEach(async (c) => {
    const b = L.find((x) => x.id === c.dataset.nb), pg = b.pages[0];
    const r = pg ? await api("paper/page", { nb: b.id, pid: pg.id }).catch(() => ({ strokes: [] })) : { strokes: [] };
    const draw = () => renderPage(c, r.strokes || [], pg || { tpl: "lined" }, b.theme, b.kind, draw);
    draw();
  });
}

// ---------- importing PDFs and pictures ----------
let PDFJS = null;
function loadPdfJs() {
  if (PDFJS) return PDFJS;
  PDFJS = new Promise((ok, no) => { const s = document.createElement("script"); s.src = "pdfjs/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "pdfjs/pdf.worker.min.js"; ok(window.pdfjsLib); }; s.onerror = () => { PDFJS = null; no(new Error("The PDF reader didn't load.")); }; document.head.appendChild(s); });
  return PDFJS;
}
const toDataURL = (c, type = "image/jpeg") => c.toDataURL(type, 0.86);
function progress(msg) { let el = $("#pprog"); if (!el) { el = document.createElement("div"); el.id = "pprog"; el.className = "pprog"; document.body.appendChild(el); } if (msg) el.innerHTML = `<span class="spin"></span> ${esc(msg)}`; else el.remove(); }
async function pdfPages(buf, name) {  // -> [{bg, h}] after storing each page picture encrypted
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: buf }).promise, n = Math.min(doc.numPages, 300), out = [];
  for (let i = 1; i <= n; i++) {
    progress(`${name}: page ${i} of ${n}`);
    const pg = await doc.getPage(i), v1 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: 1600 / v1.width });
    const c = document.createElement("canvas"); c.width = Math.round(v.width); c.height = Math.round(v.height);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: x, viewport: v }).promise;
    const a = await api("paper/asset", { data: toDataURL(c) });
    out.push({ bg: a.id, h: Math.round(PW * v.height / v.width) });
  }
  progress(null);
  return out;
}
async function pictureAsset(file) {  // downscale to 2000 px on the long side, keep PNG transparency
  const url = URL.createObjectURL(file), img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error("That picture couldn't be opened.")); img.src = url; });
  const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const a = await api("paper/asset", { data: toDataURL(c, file.type === "image/png" ? "image/png" : "image/jpeg") });
  return { id: a.id, w: c.width, h: c.height };
}
// opts.newNotebook: a PDF becomes its own notebook. opts.place(items): add pictures/pages to the open board.
async function importMenu(anchor, opts) {
  const old = $("#pimpmenu"); if (old) return old.remove();
  const docs = (await api("readings").catch(() => [])).filter((r) => r.kind === "pdf" && r.file !== false);
  const menu = document.createElement("div"); menu.id = "pimpmenu"; menu.className = "ppop pimpmenu";
  menu.innerHTML = `<div class="k">Bring in</div><button id="pifile">${pic("import", 16)} a PDF or picture from this laptop</button>
    ${docs.length ? `<div class="k" style="margin-top:6px">From Documents</div><div class="pidocs">${docs.slice(0, 30).map((d) => `<button data-rid="${esc(d.id)}">${esc(d.name)} <span class="dim">${d.pages || ""}p</span></button>`).join("")}</div>` : ""}
    <div class="dim small" style="max-width:280px;line-height:1.5">${opts.newNotebook ? "A PDF becomes a notebook with one page per PDF page. Write and highlight right on it." : "A PDF opens as its own notebook. A picture lands in the middle of what you're looking at; move it with the lasso."}</div>
    <input type="file" id="pifin" accept="application/pdf,image/*" hidden>`;
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect(); menu.style.left = Math.min(innerWidth - 330, r.left) + "px"; menu.style.top = r.bottom + 8 + "px";
  const close = (e) => { if (!menu.contains(e.target) && e.target !== anchor) { menu.remove(); document.removeEventListener("pointerdown", close, true); } };
  setTimeout(() => document.addEventListener("pointerdown", close, true));
  const asNotebook = async (buf, name) => { const pages = await pdfPages(buf, name); const nb = await api("paper/new", { title: name.replace(/\.pdf$/i, ""), theme: "paper", pages }); location.hash = "#/paper/" + nb.id; };
  const go = async (fn) => { menu.remove(); try { await fn(); } catch (e) { progress(null); toast(e.message); } };
  $("#pifile").onclick = () => $("#pifin").click();
  $("#pifin").onchange = (e) => go(async () => {
    const f = e.target.files[0]; if (!f) return;
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) return asNotebook(await f.arrayBuffer(), f.name);
    if (!f.type.startsWith("image/")) throw new Error("Pick a PDF or a picture.");
    progress("adding the picture"); const a = await pictureAsset(f); progress(null);
    if (opts.place) return opts.place([a]);
    const nb = await api("paper/new", { title: f.name.replace(/\.[^.]+$/, ""), kind: "canvas", tpl: "dot" });
    const w = Math.min(900, a.w), h = w * a.h / a.w;
    await api("paper/save", { nb: nb.id, pid: (await api("paper/get", { nb: nb.id })).pages[0].id, strokes: [{ k: "i", a: a.id, x: 0, y: 0, w, h }] });
    location.hash = "#/paper/" + nb.id;
  });
  menu.querySelectorAll("[data-rid]").forEach((b) => (b.onclick = () => go(async () => {
    const d = docs.find((x) => x.id === b.dataset.rid);
    progress("opening " + d.name);
    const res = await fetch("/reading/" + d.id); if (!res.ok) throw new Error("That document isn't on the stick as a file.");
    return asNotebook(await res.arrayBuffer(), d.name);
  })));
}

// ---------- one notebook or canvas ----------
const PS = { get() { try { return JSON.parse(localStorage.getItem("feather-paper")) || {}; } catch (e) { return {}; } },
  set(x) { try { localStorage.setItem("feather-paper", JSON.stringify({ ...PS.get(), ...x })); } catch (e) {} } };
const PIC = {
  pen: '<path d="M3 21l3.5-1 12-12-2.5-2.5-12 12z"/><path d="M14.5 5.5l2.5 2.5"/>',
  hl: '<path d="M9 14l-4 4v3h3l4-4"/><path d="M9 14l7-9 4 4-9 7z"/>',
  er: '<path d="M4 16l8-8 6 6-6 6H8z"/><path d="M12 20h8"/>',
  lasso: '<path d="M12 4c5 0 8 2.5 8 5.5S16 15 12 15s-8-2.5-8-5.5S7 4 12 4z" stroke-dasharray="2.5 2.5"/><path d="M8 14c-1 2 0 4 2 5"/>',
  shape: '<rect x="3" y="3" width="8" height="8" rx="1"/><circle cx="16.5" cy="16.5" r="4.5"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-2"/>',
  redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h2"/>',
  hand: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6"/><path d="M11 11V4a1.5 1.5 0 0 1 3 0v7"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L8 15"/>',
  tpl: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  zoom: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8.5 11h5M11 8.5v5"/>',
  save: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  import: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ret: '<path d="M20 5v7a3 3 0 0 1-3 3H5"/><path d="M9 11l-4 4 4 4"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  cards: '<rect x="3" y="7" width="14" height="12" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v10"/>',
  replay: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4"/><path d="M10 9l5 3-5 3z"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  onion: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6" opacity=".5"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  sticky: '<path d="M5 4h14v10l-5 6H5z"/><path d="M14 20v-6h5"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  fold: '<path d="M6 9l6 6 6-6"/>', unfold: '<path d="M9 6l6 6-6 6"/>', grip: '<circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>',
  fit: '<rect x="5" y="5" width="14" height="14" rx="2" stroke-dasharray="3 2"/><path d="M9 12h6M12 9v6"/>',
};
const pic = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PIC[k]}</svg>`;

async function paperBook(nbid, pgid) {
  const NB = await api("paper/get", { nb: nbid });
  const canvasMode = NB.kind === "canvas", flipMode = NB.kind === "flip";
  let page = NB.pages.find((p) => p.id === pgid) || NB.pages[0];
  const saved = PS.get(), pref = { tool: "pen", ink: 0, size: 3, smooth: 0.45, snap: true, guard: 110, ...saved, touch: saved.touchSet ? !!saved.touch : !saved.penEver };
  const th = () => NB.theme || "dark";
  const cache = {};
  const m = shell("paper", `<div class="pbook ${canvasMode ? "iscanvas" : ""} ${flipMode ? "isflip" : ""}">
    <div class="phead"><a class="btn" href="#/paper">← paper</a><input id="ptitle" class="ptitle" value="${esc(NB.title)}" aria-label="Name">
      <span class="dim small" id="pinfo"></span>
      <span class="phint dim">${canvasMode ? "two fingers or the mouse wheel move around · pinch or Ctrl + wheel zooms" : "hold the pen still for the round menu · hold at the end of a line, box or circle to snap it"}</span></div>
    <div class="ptools" role="toolbar" aria-label="Paper tools">
      ${["move", "pen", "hl", "er", "lasso", "text"].map((t) => `<button class="pt" data-tool="${t}" title="${{ move: "move and scroll: drag the page around, drag notes and text boxes, double-click to edit (V)", pen: "pen (P)", hl: "highlighter (H)", er: "eraser (E)", lasso: "lasso: circle to select, then drag (L)", text: "type text: tap the page, or tap a text to edit it (T)" }[t]}" aria-label="${t}">${pic(t)}</button>`).join("")}
      <button class="pt" id="psticky" title="add a sticky note" aria-label="add a sticky note">${pic("sticky")}</button>
      <button class="pt" id="psnap" title="snap shapes when you hold at the end" aria-label="shape snap">${pic("shape")}</button>
      <span class="psep"></span><span class="pinks">${[0, 1, 2, 3].map((i) => `<button class="pink" data-ink="${i}" aria-label="ink ${i + 1}"></button>`).join("")}</span><span class="psep"></span>
      <label class="psl">size<input type="range" id="psize" min="1" max="10" step="1" value="${pref.size}"></label>
      <label class="psl">smooth<input type="range" id="psmooth" min="0" max="0.85" step="0.05" value="${pref.smooth}"></label><span class="psep"></span>
      <button class="pt" id="ptpl" title="paper and colour" aria-label="paper">${pic("tpl")}</button>
      <button class="pt" id="pimp" title="bring in a PDF or picture" aria-label="import">${pic("import")}</button>
      <button class="pt" id="pzoom" title="zoom writing strip: write big, it lands small" aria-label="zoom writing strip">${pic("zoom")}</button>
      <button class="pt" id="pqa" title="make flashcards: Q, lasso the question, A, lasso the answer" aria-label="make flashcards">${pic("cards")}</button>
      ${flipMode ? `<span class="psep"></span><button class="pt on" id="ponion" title="onion skin: see the frames before (red) and after (blue)" aria-label="onion skin">${pic("onion")}</button>
        <button class="pt" id="pplay" title="play the animation (space)" aria-label="play">${pic("play")}</button><select id="pfps" aria-label="frames per second" class="pfps">${[6, 8, 12, 24].map((f) => `<option value="${f}" ${f === 12 ? "selected" : ""}>${f} fps</option>`).join("")}</select>`
        : `<button class="pt" id="preplay" title="replay how this was drawn" aria-label="replay">${pic("replay")}</button>`}
      <button class="pt" id="ptouch" title="draw with touch (finger or any stylus)" aria-label="draw with touch">${pic("hand")}</button><span class="psep"></span>
      <button class="pt" id="pundo" title="undo (Ctrl+Z, two-finger tap)" aria-label="undo">${pic("undo")}</button><button class="pt" id="predo" title="redo (Ctrl+Y, three-finger tap)" aria-label="redo">${pic("redo")}</button>
      <button class="pt" id="pdel" title="delete selection" aria-label="delete selection" hidden>${pic("trash")}</button><span class="psep"></span>
      <button class="pt" id="pfit" title="${canvasMode ? "fit everything" : "fit the page"} (0)" aria-label="fit">${pic("fit")}</button>
      <button class="pt" id="pfull" title="full screen (F)" aria-label="full screen">${pic("full")}</button>
      <span class="pright"><span class="dim small" id="psaved">saved · encrypted</span><button id="pexp" class="pexp">${pic("save", 16)}export</button></span></div>
    <div class="ppop" id="ppop" hidden></div>
    <div class="pbody">
      <div class="pview" id="pview"><canvas id="cbase"></canvas><canvas id="clive"></canvas>
        <div class="pbox" id="pbox" hidden><div class="pbbar" id="pbbar" role="toolbar" aria-label="note and text box">
          <button class="pbg" id="pbgrip" title="drag to move" aria-label="move">${pic("grip", 16)}</button>
          <span class="pbcols" id="pbcols">${[0, 1, 2, 3].map((i) => `<button class="pbc" data-c="${i}" aria-label="colour ${i + 1}"></button>`).join("")}</span>
          <select id="pbff" aria-label="font">${Object.entries(FONT_NAMES).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select>
          <button id="pbsm" aria-label="smaller text" title="smaller">A−</button><span id="pbfs" class="pbfs">22</span><button id="pbbg" aria-label="bigger text" title="bigger">A+</button>
          <button id="pbfold" title="fold to one line" aria-label="fold">${pic("fold", 16)}</button>
          <button id="pbed" title="edit the text (double-click works too)" aria-label="edit">${pic("text", 16)}</button>
          <button id="pbdel" title="delete" aria-label="delete">${pic("trash", 16)}</button></div>
          <i class="pbrs" id="pbrs" title="drag to resize"></i></div>
        ${canvasMode ? '<canvas class="pmini" id="pmini" width="200" height="130" title="overview: click to jump"></canvas><button class="pminib" id="pminib" title="hide the map (M)" aria-label="hide the map">–</button>' : ""}
        <div class="pstrip" id="pstrip" hidden><div class="pstripin"><canvas id="cstrip"></canvas><span class="pstriplab">zoom strip · write big, it lands small</span>
          <button class="pret" id="pret" title="next line" aria-label="next line">${pic("ret", 16)}</button></div></div>
        <div class="preplay" id="prep" hidden><button id="rpp" aria-label="play or pause">${pic("pause", 16)}</button><input type="range" id="rps" min="0" max="1000" value="0" aria-label="replay position"><select id="rpx" aria-label="speed">${[1, 2, 4, 8, 16].map((s) => `<option value="${s}" ${s === 4 ? "selected" : ""}>${s}×</option>`).join("")}</select><button id="rpg">save GIF</button><button id="rpc" aria-label="close the replay">×</button></div>
        <div class="pguard" id="pguard" hidden><i id="pgh" title="drag to resize"></i><span>wrist guard · rest your hand here, touches are ignored</span></div>
        <div class="pradial" id="pradial" hidden>${["pen", "hl", "er", "lasso"].map((t, i) => `<button data-tool="${t}" style="--a:${i * 90 - 90}deg" aria-label="${t}">${pic(t, 20)}</button>`).join("")}<i id="prc"></i></div>
      </div>
      ${canvasMode ? "" : `<button class="pshow" id="pshow" title="show the ${flipMode ? "frames" : "pages"}" aria-label="show the ${flipMode ? "frames" : "pages"}">‹ <span>${flipMode ? "frames" : "pages"}</span></button><aside class="pside"><div class="row pshead"><span class="k">${flipMode ? "Frames" : "Pages"}</span><button class="small" id="phide" title="hide this strip so the page gets more room" aria-label="hide the ${flipMode ? "frames" : "pages"}">›</button></div><div id="pthumbs" class="pthumbs"></div><button class="padd" id="padd" title="add a ${flipMode ? "blank frame" : "page"}" aria-label="add">${pic("plus", 20)}</button>${flipMode ? `<button class="padd" id="pdup" title="duplicate this frame" aria-label="duplicate this frame">${pic("dup", 20)}</button><button class="padd small" id="pdelf" title="delete this frame" aria-label="delete this frame">${pic("trash", 18)}</button>` : ""}</aside>`}
    </div></div>`);
  m.classList.add("pmain");
  if (!canvasMode) {  // the strip of pages can tuck away so the page gets the room
    const strip = (show) => { let off = false; try { off = localStorage.getItem("feather-pside") === "off"; } catch (e) {}
      if (show !== undefined) { off = !show; try { localStorage.setItem("feather-pside", off ? "off" : "on"); } catch (e) {} }
      m.querySelector(".pbook").classList.toggle("noside", off); setTimeout(() => window.dispatchEvent(new Event("resize")), 30); };
    $("#phide").onclick = () => strip(false); $("#pshow").onclick = () => strip(true); strip();
  }
  const view = $("#pview"), cb = $("#cbase"), cl = $("#clive"), xb = cb.getContext("2d"), xl = cl.getContext("2d");
  let strokes = [], hist = [], redo = [], sel = null, dirty = false, saveT = null, dpr = 1, vw = 0, vh = 0, onion = true, replayK = null, recT = null, qaRects = [], editing = null;
  const cam = { x: 0, y: 0, z: 1 };
  const H = () => page.h || PH;
  const pageTh = () => (page.bg ? "paper" : th());  // writing on a PDF uses dark ink

  // ----- camera -----
  const toWorld = (e) => { const r = cb.getBoundingClientRect(); return [(e.clientX - r.left) / cam.z + cam.x, (e.clientY - r.top) / cam.z + cam.y]; };
  const viewRect = () => [cam.x, cam.y, cam.x + vw / cam.z, cam.y + vh / cam.z];
  function clampCam() {
    if (canvasMode) return;
    const pw = PW * cam.z, ph = H() * cam.z;
    cam.x = pw + 80 < vw ? -(vw - pw) / 2 / cam.z : Math.max(-40 / cam.z, Math.min(PW - (vw - 40) / cam.z, cam.x));
    cam.y = Math.max(-40 / cam.z, Math.min(H() - vh / cam.z + 300 / cam.z, cam.y));
  }
  function fit() {
    if (canvasMode) {
      const b = allBox(strokes);
      if (!b) { cam.z = 1; cam.x = -vw / 2; cam.y = -vh / 2; }
      else { const m = 80; cam.z = Math.max(0.05, Math.min(2, Math.min(vw / (b[2] - b[0] + 2 * m), vh / (b[3] - b[1] + 2 * m)))); cam.x = (b[0] + b[2]) / 2 - vw / 2 / cam.z; cam.y = (b[1] + b[3]) / 2 - vh / 2 / cam.z; }
    } else { cam.z = Math.max(0.2, Math.min((vw - 40) / PW, 1.6)); cam.x = 0; cam.y = -20 / cam.z; }
    clampCam(); redraw();
  }
  function zoomAt(f, sx, sy) {
    const r = cb.getBoundingClientRect(), px = sx - r.left, py = sy - r.top, wx = px / cam.z + cam.x, wy = py / cam.z + cam.y;
    if (editing) commitText();
    cam.z = Math.max(canvasMode ? 0.05 : 0.25, Math.min(6, cam.z * f));
    cam.x = wx - px / cam.z; cam.y = wy - py / cam.z; clampCam(); redrawSoon();
  }
  const panBy = (dx, dy) => { if (editing) commitText(); cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); redrawSoon(); };
  let rafPending = false;
  const redrawSoon = () => { if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; redraw(); }); } };

  // ----- drawing the world -----
  function setT(x) { x.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, -cam.x * cam.z * dpr, -cam.y * cam.z * dpr); }
  function resize() {
    dpr = window.devicePixelRatio || 1; vw = view.clientWidth; vh = view.clientHeight;
    for (const c of [cb, cl]) { c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr); c.style.width = vw + "px"; c.style.height = vh + "px"; }
  }
  function drawWorld(x, rect, z) {
    const vis = (s) => { const b = sbox(s); return b[2] >= rect[0] && b[0] <= rect[2] && b[3] >= rect[1] && b[1] <= rect[3]; };
    if (canvasMode) drawPattern(x, page.tpl, th(), rect, z);
    else {
      x.save(); x.beginPath(); x.rect(0, 0, PW, H()); x.clip();
      drawTemplate(x, page.bg ? "blank" : page.tpl, pageTh(), H());
      if (page.bg) { const img = asset(page.bg, redrawSoon); if (img) x.drawImage(img, 0, 0, PW, H()); }
      x.restore();
    }
    if (flipMode && onion) {
      const i = NB.pages.indexOf(page), pv = NB.pages[i - 1], nx = NB.pages[i + 1];
      x.save();
      if (nx && cache[nx.id]) { x.globalAlpha = 0.22; for (const s of cache[nx.id]) drawStroke(x, s, pageTh(), null, "#5f8fe0"); }
      if (pv && cache[pv.id]) { x.globalAlpha = 0.32; for (const s of cache[pv.id]) drawStroke(x, s, pageTh(), null, "#e05f4f"); }
      x.restore();
    }
    const list = (replayK === null ? strokes : partialList(strokes, replayK)).filter((s) => s !== editing);
    for (const s of list) if (vis(s)) drawStroke(x, s, pageTh(), redrawSoon);
  }
  function redraw() {
    xb.setTransform(1, 0, 0, 1, 0, 0);
    xb.fillStyle = canvasMode ? PTH[th()].bg : getComputedStyle(document.body).backgroundColor || "#0c0d0b";
    xb.fillRect(0, 0, cb.width, cb.height);
    setT(xb);
    if (!canvasMode) { xb.save(); xb.shadowColor = "rgba(0,0,0,.5)"; xb.shadowBlur = 30 * cam.z * dpr; xb.shadowOffsetY = 10 * cam.z * dpr; xb.fillStyle = PTH[pageTh()].bg; xb.fillRect(0, 0, PW, H()); xb.restore(); }
    drawWorld(xb, viewRect(), cam.z);
    drawLive(); drawStrip(); drawMini(); showBox();
  }

  // ----- history + saving -----
  const snap = () => { hist.push(strokes.slice()); if (hist.length > 120) hist.shift(); redo = []; };
  function changed() { dirty = true; $("#psaved").textContent = "saving…"; clearTimeout(saveT); saveT = setTimeout(save, 1200); }
  async function save() {
    if (!dirty) return; dirty = false; clearTimeout(saveT);
    const pid = page.id, out = strokes.map((s) => (s.k === "t" ? { k: "t", text: s.text, sticky: !!s.sticky, c: s.c, fs: s.fs || 22, ff: tFF(s), ...(s.col ? { col: true } : {}), x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.w), h: Math.round(s.h) } : s.k === "i" ? { k: "i", a: s.a, x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.w), h: Math.round(s.h) } : { k: s.k, c: s.c, w: s.w, p: s.p.map((v, i) => (i % 3 === 2 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10)) }));
    cache[pid] = strokes;
    try { await api("paper/save", { nb: nbid, pid, strokes: out }); $("#psaved").textContent = "saved · encrypted"; thumb(pid); if (!flipMode) recognizeSoon(pid); }
    catch (e) { $("#psaved").textContent = "not saved: " + e.message; dirty = true; }
  }
  function recognizeSoon(pid) {  // read the handwriting for search a few seconds after you stop writing
    clearTimeout(recT);
    recT = setTimeout(() => {
      const pg = NB.pages.find((p) => p.id === pid), list = cache[pid] || [];
      if (!pg || !list.some((s) => s.k === "p" || s.k === "t")) return;
      let img = null;
      if (!canvasMode && !pg.bg) { const c = document.createElement("canvas"); c.width = PW; c.height = Math.min(6000, pg.h || PH); renderPage(c, list.filter((s) => s.k === "p"), { tpl: "blank", h: pg.h }, "paper", "pages"); img = c.toDataURL("image/png"); }
      api("paper/recognize", { nb: nbid, pid, img }).catch(() => {});
    }, 6000);
  }
  const undo = () => { if (!hist.length) return; redo.push(strokes); strokes = hist.pop(); sel = null; redraw(); changed(); syncTools(); };
  const redoIt = () => { if (!redo.length) return; hist.push(strokes); strokes = redo.pop(); sel = null; redraw(); changed(); syncTools(); };
  function grow(s) {  // a page gets longer when you write near the bottom (not PDF pages)
    if (canvasMode || page.bg) return;
    const b = sbox(s);
    if (b[3] > H() - 260) { page.h = Math.ceil((b[3] + 700) / LINE) * LINE; api("paper/set", { nb: nbid, pid: page.id, h: page.h }); info(); clampCam(); redraw(); }
  }

  // ----- pages -----
  const info = () => { if (!$("#pinfo")) return; $("#pinfo").textContent = canvasMode ? "canvas · " + Math.round(cam.z * 100) + "%" : `${flipMode ? "frame" : "page"} ${NB.pages.indexOf(page) + 1} of ${NB.pages.length}${page.bg ? " · PDF" : ""}${H() > PH ? " · long page" : ""}`; };
  async function openPage(pg) {
    await save();
    page = pg; if (!canvasMode) history.replaceState(null, "", `#/paper/${nbid}/${pg.id}`);
    strokes = cache[pg.id] || (await api("paper/page", { nb: nbid, pid: pg.id })).strokes || [];
    cache[pg.id] = strokes; hist = []; redo = []; sel = null; qaRects = [];
    if (flipMode) { const i = NB.pages.indexOf(pg); for (const q of [NB.pages[i - 1], NB.pages[i + 1]]) if (q && !cache[q.id]) cache[q.id] = (await api("paper/page", { nb: nbid, pid: q.id }).catch(() => ({ strokes: [] }))).strokes || []; }
    info(); drawThumbs(); resize(); fit();
  }
  function drawThumbs() {
    if (canvasMode) return;
    $("#pthumbs").innerHTML = NB.pages.map((p, i) => `<button class="pth ${p.id === page.id ? "on" : ""}" data-pid="${p.id}" aria-label="page ${i + 1}"><canvas width="96" height="${Math.min(400, Math.round(96 * (p.h || PH) / PW))}"></canvas><span>${i + 1}</span></button>`).join("");
    $("#pthumbs").querySelectorAll(".pth").forEach((b) => { b.onclick = () => openPage(NB.pages.find((p) => p.id === b.dataset.pid)); thumb(b.dataset.pid); });
  }
  async function thumb(pid) {
    const c = $(`.pth[data-pid="${pid}"] canvas`); if (!c) return;
    const pg = NB.pages.find((p) => p.id === pid);
    if (!cache[pid]) cache[pid] = (await api("paper/page", { nb: nbid, pid }).catch(() => ({ strokes: [] }))).strokes || [];
    const want = Math.min(400, Math.round(96 * (pg.h || PH) / PW)); if (c.height !== want) c.height = want;
    const d = () => renderPage(c, cache[pid], pg, th(), "pages", d); d();
  }
  if (!canvasMode) $("#padd").onclick = async () => { await save(); const pg = await api("paper/addpage", { nb: nbid, tpl: page.bg ? "lined" : page.tpl, after: NB.pages.indexOf(page) }); NB.pages.splice(NB.pages.indexOf(page) + 1, 0, pg); cache[pg.id] = []; openPage(pg); };
  $("#ptitle").onchange = () => api("paper/set", { nb: nbid, title: $("#ptitle").value });

  // ----- toolbar -----
  function syncTools() {
    m.querySelectorAll(".pt[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === pref.tool));
    cl.dataset.tool = pref.tool;
    const T = PTH[pageTh()];
    m.querySelectorAll(".pink").forEach((b) => { const i = +b.dataset.ink; b.style.background = T.ink[i]; b.classList.toggle("on", i === pref.ink); });
    $("#psnap").classList.toggle("on", pref.snap); $("#ptouch").classList.toggle("on", pref.touch); $("#pzoom").classList.toggle("on", !!zs.on);
    $("#pdel").hidden = !sel; $("#pguard").hidden = !pref.touch; $("#pguard").style.height = pref.guard + "px";
    $("#pstrip").hidden = !zs.on; $("#pstrip").style.bottom = (pref.touch ? pref.guard : 0) + "px";
    $("#pfull").classList.toggle("on", document.body.classList.contains("pfull"));
    PS.set({ tool: pref.tool === "lasso" ? "pen" : pref.tool, ink: pref.ink, size: pref.size, smooth: pref.smooth, touch: pref.touch, snap: pref.snap, guard: pref.guard });
  }
  const setTool = (t) => { pref.tool = t; if (t !== "lasso") { sel = null; drawLive(); } if (t !== "move" && t !== "text" && boxSel) { boxSel = null; showBox(); } syncTools(); };
  m.querySelectorAll(".pt[data-tool]").forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  m.querySelectorAll(".pink").forEach((b) => (b.onclick = () => {
    pref.ink = +b.dataset.ink;
    if (sel) { snap(); const now = new Set(); strokes = strokes.map((s) => { if (!sel.has(s) || s.k === "i") return s; /* pictures keep their colours */ const t = { ...s, c: pref.ink }; now.add(t); return t; }); strokes.forEach((s) => { if (sel.has(s) && s.k === "i") now.add(s); }); sel = now; redraw(); changed(); return syncTools(); }
    if (pref.tool === "er" || pref.tool === "lasso") pref.tool = "pen";
    syncTools();
  }));
  $("#psize").oninput = (e) => { pref.size = +e.target.value; syncTools(); };
  $("#psmooth").oninput = (e) => { pref.smooth = +e.target.value; syncTools(); };
  $("#psnap").onclick = () => { pref.snap = !pref.snap; syncTools(); };
  $("#ptouch").onclick = () => { pref.touch = !pref.touch; PS.set({ touchSet: 1 }); syncTools(); toast(pref.touch ? "Touch draws now · two fingers move and zoom" : "Touch moves around · only a pen or mouse draws"); };
  $("#pundo").onclick = undo; $("#predo").onclick = redoIt;
  $("#pdel").onclick = () => { if (!sel) return; snap(); strokes = strokes.filter((s) => !sel.has(s)); sel = null; redraw(); changed(); syncTools(); };
  $("#pfit").onclick = fit;
  const toggleFull = async () => {
    const on = !document.body.classList.contains("pfull");
    document.body.classList.toggle("pfull", on);
    try { if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen(); else if (!on && document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
    syncTools(); setTimeout(() => { resize(); clampCam(); redraw(); }, 60);
  };
  $("#pfull").onclick = toggleFull;
  const fsChange = () => { if (!document.fullscreenElement && document.body.classList.contains("pfull")) { document.body.classList.remove("pfull"); syncTools(); setTimeout(() => { resize(); redraw(); }, 60); } };
  document.addEventListener("fullscreenchange", fsChange);
  $("#pimp").onclick = () => importMenu($("#pimp"), { place: (list) => {  // pictures land in the middle of the view
    snap();
    const [x0, y0, x1, y1] = viewRect(), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (const a of list) { const w = Math.min((x1 - x0) * 0.6, a.w), h = w * a.h / a.w; strokes = strokes.concat([{ k: "i", a: a.id, x: cx - w / 2, y: cy - h / 2, w, h }]); }
    redraw(); changed(); setTool("lasso"); toast("Picture added · drag it with the lasso");
  } });
  const pop = $("#ppop");
  $("#ptpl").onclick = () => {
    if (!pop.hidden) return (pop.hidden = true);
    pop.innerHTML = `<div class="k">${canvasMode ? "Background" : "Paper for this page"}</div><div class="ptpls">${(canvasMode ? TPL.filter(([k]) => ["blank", "dot", "grid"].includes(k)) : TPL).map(([k, l]) => `<button data-tpl="${k}" class="${k === page.tpl ? "on" : ""}"><canvas width="60" height="84"></canvas>${l}</button>`).join("")}</div>
      <div class="k" style="margin-top:10px">Colour</div><div class="row">${["dark", "sepia", "paper"].map((t) => `<button data-th="${t}" class="rt ${t === th() ? "on" : ""}" style="background:${PTH[t].bg};color:${PTH[t].ink[0]}">${t}</button>`).join("")}</div>`;
    pop.hidden = false;
    pop.querySelectorAll("[data-tpl]").forEach((b) => { renderPage(b.querySelector("canvas"), [], { tpl: b.dataset.tpl }, th(), "pages");
      b.onclick = async () => { page.tpl = b.dataset.tpl; pop.hidden = true; await api("paper/set", { nb: nbid, pid: page.id, tpl: page.tpl }); redraw(); thumb(page.id); }; });
    pop.querySelectorAll("[data-th]").forEach((b) => (b.onclick = async () => { NB.theme = b.dataset.th; pop.hidden = true; await api("paper/set", { nb: nbid, theme: NB.theme }); syncTools(); redraw(); drawThumbs(); }));
  };
  $("#pexp").onclick = () => {
    if (!pop.hidden) return (pop.hidden = true);
    pop.innerHTML = `<div class="k">Export</div>${flipMode ? '<button id="exg">the animation as a GIF</button>' : ""}<button id="ex1">${canvasMode ? "the board as a picture" : flipMode ? "this frame as a picture" : "this page as a picture"}</button>${canvasMode ? "" : `<button id="exa">every ${flipMode ? "frame" : "page"} as pictures</button>`}
      <div class="dim small" style="max-width:240px;line-height:1.5">Or just plug into your PC: pages land in Obsidian, and the pen button on the popup saves them to a folder.</div>`;
    pop.hidden = false;
    const dl = async (pg, list, i) => {
      const c = document.createElement("canvas");
      if (canvasMode) { const b = allBox(list) || [0, 0, 1000, 700], k = Math.min(1.5, 6000 / Math.max(b[2] - b[0] + 120, b[3] - b[1] + 120)); c.width = Math.round((b[2] - b[0] + 120) * k); c.height = Math.round((b[3] - b[1] + 120) * k); }
      else { c.width = PW * 1.5; c.height = Math.round((pg.h || PH) * 1.5); }
      const ids = list.filter((s) => s.k === "i").map((s) => s.a).concat(pg.bg ? [pg.bg] : []);
      await Promise.all(ids.map((id) => new Promise((ok) => (asset(id, ok) ? ok() : setTimeout(ok, 4000)))));
      renderPage(c, list, pg, th(), canvasMode ? "canvas" : "pages");
      const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = canvasMode ? `${NB.title}.png` : `${NB.title} - page ${String(i + 1).padStart(2, "0")}.png`; a.click();
    };
    $("#ex1").onclick = () => { pop.hidden = true; dl(page, strokes, NB.pages.indexOf(page)); };
    if ($("#exg")) $("#exg").onclick = async () => {
      pop.hidden = true; await save(); toast("Making the GIF…");
      const frames = [];
      for (const pg of NB.pages) { const list = cache[pg.id] || (cache[pg.id] = (await api("paper/page", { nb: nbid, pid: pg.id })).strokes || []); const c = document.createElement("canvas"); c.width = 500; c.height = Math.round(500 * (pg.h || PH) / PW); renderPage(c, list, pg, th(), "pages"); frames.push(c); }
      saveGif(frames, Math.round(1000 / +$("#pfps").value), `${NB.title}.gif`);
    };
    if ($("#exa")) $("#exa").onclick = async () => { pop.hidden = true; await save();
      for (const [i, pg] of NB.pages.entries()) { const list = cache[pg.id] || (await api("paper/page", { nb: nbid, pid: pg.id })).strokes || []; await dl(pg, list, i); await new Promise((r) => setTimeout(r, 350)); } };
  };

  // ----- live layer: current stroke, lasso, selection, zoom-strip box -----
  let cur = null, lasso = null, drag = null, lastBoxTap = 0, lastFF = "serif";
  const acc = () => getComputedStyle(document.documentElement).getPropertyValue("--lime").trim() || "#c6f432";
  function drawLive() {
    xl.setTransform(1, 0, 0, 1, 0, 0); xl.clearRect(0, 0, cl.width, cl.height); setT(xl);
    if (cur && cur.s) drawStroke(xl, cur.s, pageTh());
    const lw = 2 / cam.z;
    if (lasso) { xl.setLineDash([8 / cam.z, 7 / cam.z]); xl.strokeStyle = acc(); xl.lineWidth = lw; xl.beginPath(); lasso.forEach(([X, Y], i) => (i ? xl.lineTo(X, Y) : xl.moveTo(X, Y))); xl.stroke(); xl.setLineDash([]); }
    if (sel && sel.size) {
      const b = allBox([...sel]), dx = drag ? drag.dx : 0, dy = drag ? drag.dy : 0;
      if (drag) { xl.save(); xl.translate(dx, dy); for (const s of sel) drawStroke(xl, s, pageTh()); xl.restore(); }
      xl.setLineDash([8 / cam.z, 7 / cam.z]); xl.strokeStyle = acc(); xl.lineWidth = lw; xl.strokeRect(b[0] - 10 + dx, b[1] - 10 + dy, b[2] - b[0] + 20, b[3] - b[1] + 20); xl.setLineDash([]);
    }
    if (zs.on) { xl.strokeStyle = acc(); xl.lineWidth = lw; xl.setLineDash([10 / cam.z, 6 / cam.z]); xl.strokeRect(zs.x, zs.y, zs.w, zs.h); xl.setLineDash([]); }
    if (typeof QA !== "undefined" && QA.bar) for (const q of qaRects) {
      const col = q.kind === "q" ? "rgba(255,214,0,.85)" : acc();
      xl.fillStyle = q.kind === "q" ? "rgba(255,214,0,.10)" : "rgba(198,244,50,.08)"; xl.fillRect(q.r[0], q.r[1], q.r[2] - q.r[0], q.r[3] - q.r[1]);
      xl.strokeStyle = col; xl.lineWidth = lw; xl.strokeRect(q.r[0], q.r[1], q.r[2] - q.r[0], q.r[3] - q.r[1]);
      xl.fillStyle = col; xl.font = `${14 / cam.z}px JetBrains Mono, monospace`; xl.fillText((q.kind === "q" ? "Q" : "A") + q.n, q.r[0] + 4 / cam.z, q.r[1] - 5 / cam.z);
    }
  }
  const inPoly = (X, Y, poly) => { let o = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > Y) !== (yj > Y)) && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) o = !o; } return o; };

  // ----- overview map (canvas) -----
  const mini = $("#pmini");
  const miniShow = (show) => {  // the map folds down to a small button (M)
    if (!mini) return;
    let off = false; try { off = localStorage.getItem("feather-mini") === "off"; } catch (e) {}
    if (show !== undefined) { off = !show; try { localStorage.setItem("feather-mini", off ? "off" : "on"); } catch (e) {} }
    mini.hidden = off; const b = $("#pminib"); b.classList.toggle("closed", off);
    b.innerHTML = off ? pic("fit", 16) + "<span>map</span>" : "–"; b.title = off ? "show the map (M)" : "hide the map (M)"; b.setAttribute("aria-label", off ? "show the map" : "hide the map");
    if (!off) drawMini();
  };
  if (mini) { $("#pminib").onclick = () => miniShow(mini.hidden); setTimeout(() => miniShow(), 0); }
  function drawMini() {
    if (!mini || mini.hidden) return;
    const x = mini.getContext("2d"), b0 = allBox(strokes), v = viewRect();
    const b = b0 ? [Math.min(b0[0], v[0]), Math.min(b0[1], v[1]), Math.max(b0[2], v[2]), Math.max(b0[3], v[3])] : v;
    const k = Math.min((mini.width - 16) / (b[2] - b[0]), (mini.height - 16) / (b[3] - b[1]));
    const ox = (mini.width - (b[2] - b[0]) * k) / 2 - b[0] * k, oy = (mini.height - (b[3] - b[1]) * k) / 2 - b[1] * k;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, mini.width, mini.height);
    x.fillStyle = "rgba(12,13,11,.82)"; x.fillRect(0, 0, mini.width, mini.height);
    x.fillStyle = "rgba(200,208,190,.55)";
    for (const s of strokes) { const q = sbox(s); x.fillRect(q[0] * k + ox, q[1] * k + oy, Math.max(1, (q[2] - q[0]) * k), Math.max(1, (q[3] - q[1]) * k)); }
    x.strokeStyle = acc(); x.lineWidth = 1.5; x.strokeRect(v[0] * k + ox, v[1] * k + oy, (v[2] - v[0]) * k, (v[3] - v[1]) * k);
    mini._map = { k, ox, oy };
  }
  if (mini) mini.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); const r = mini.getBoundingClientRect(), { k, ox, oy } = mini._map || { k: 1, ox: 0, oy: 0 };
    const wx = (e.clientX - r.left - ox) / k, wy = (e.clientY - r.top - oy) / k; cam.x = wx - vw / 2 / cam.z; cam.y = wy - vh / 2 / cam.z; redraw();
  });

  // ----- shapes: hold still at the end of a stroke -----
  function recognize(p) {
    const n = p.length / 3; if (n < 8) return null;
    const pts = []; for (let i = 0; i < n; i++) pts.push([p[i * 3], p[i * 3 + 1]]);
    let len = 0; for (let i = 1; i < n; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const [x0, y0] = pts[0], [x1, y1] = pts[n - 1], chord = Math.hypot(x1 - x0, y1 - y0);
    const out = (list) => { const q = []; for (const [X, Y] of list) q.push(X, Y, 0.7); return q; };
    const seg = (a, b, k = 12) => Array.from({ length: k + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k]);
    if (len > 30 && chord / len > 0.93) return out(seg(pts[0], pts[n - 1], 16));
    if (len > 60 && chord < 0.22 * len) {
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys);
      let cx = (l + r) / 2, cy = (t + b) / 2, rx = (r - l) / 2, ry = (b - t) / 2;
      if (rx < 8 || ry < 8) return null;
      let eErr = 0, rErr = 0;
      for (const [X, Y] of pts) {
        eErr += Math.abs(Math.hypot((X - cx) / rx, (Y - cy) / ry) - 1);
        rErr += Math.min(Math.abs(X - l), Math.abs(X - r), Math.abs(Y - t), Math.abs(Y - b)) / Math.min(rx, ry);
      }
      if (rErr < eErr * 0.8) return out([...seg([l, t], [r, t]), ...seg([r, t], [r, b]), ...seg([r, b], [l, b]), ...seg([l, b], [l, t])]);
      if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.15) rx = ry = (rx + ry) / 2;
      return out(Array.from({ length: 73 }, (_, i) => [cx + rx * Math.cos(i / 72 * 2 * Math.PI - Math.PI / 2), cy + ry * Math.sin(i / 72 * 2 * Math.PI - Math.PI / 2)]));
    }
    return null;
  }

  // ----- drawing pipeline (shared by the board and the zoom strip) -----
  let holdT = null, radialT = null, penSeen = 0;
  function begin(e, at, tool) {
    pop.hidden = true; $("#pradial").hidden = true;
    const [X, Y] = at;
    if (tool === "lasso") {
      if (sel && sel.size) { const b = allBox([...sel]); if (X > b[0] - 14 && X < b[2] + 14 && Y > b[1] - 14 && Y < b[3] + 14) { drag = { sx: X, sy: Y, dx: 0, dy: 0 }; return; } }
      sel = null; lasso = [[X, Y]]; syncTools(); drawLive(); return;
    }
    if (tool === "er") { snap(); cur = { erase: true, hit: false }; eraseAt(X, Y); return; }
    const boxAt = (kinds) => [...strokes].reverse().find((s) => kinds.includes(s.k) && X >= s.x && X <= s.x + s.w && Y >= s.y && Y <= s.y + (s.k === "t" ? tShown(s) : s.h));
    if (tool !== "er" && tool !== "lasso") {  // the fold arrow on a sticky answers every tool
      const st = [...strokes].reverse().find((s) => s.sticky && (() => { const [a, b, c, d] = foldBtn(s); return X >= a - 4 && X <= c + 4 && Y >= b - 4 && Y <= d + 4; })());
      if (st) { toggleFold(st); return; }
    }
    if (tool === "move") {  // drag the page around, or drag a note / text box / picture; double-click edits text
      const hit = boxAt(["t", "i"]);
      if (editing) commitText();
      if (!hit) { boxSel = null; showBox(); cur = { pan: { x: e.clientX, y: e.clientY } }; return; }
      const again = boxSel === hit && e.timeStamp - (lastBoxTap || 0) < 380; lastBoxTap = e.timeStamp;
      boxSel = hit; showBox();
      if (again && hit.k === "t") { editText(hit, false); return; }
      snap(); strokes = strokes.filter((s) => s !== hit).concat([hit]);  // what you pick up comes to the front
      cur = { mv: { orig: hit, sx: X, sy: Y, moved: false } }; return;
    }
    if (tool === "text") {
      const hit = boxAt(["t"]);
      if (hit) { editText(hit, false); return; }
      if (editing || boxSel) { if (editing) commitText(); boxSel = null; showBox(); return; }  // a click off a box just lets go of it
      editText({ k: "t", text: "", c: pref.ink, fs: 22 + (pref.size - 3) * 2, ff: lastFF, x: X, y: Y - 14, w: Math.min(520, (canvasMode ? 520 : PW - X - 20)), h: 40 }, true);
      return;
    }
    if (boxSel) { boxSel = null; showBox(); }
    const pr = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.6;
    cur = { s: { k: tool === "hl" ? "h" : "p", c: pref.ink, w: pref.size, p: [X, Y, pr] }, real: e.pointerType === "pen" && e.pressure > 0 && e.pressure !== 0.5, fx: X, fy: Y, lt: e.timeStamp, pr, snapped: false, sx: X, sy: Y, moved: false };
    drawLive();
    if (tool === "pen" && e.pointerType !== "touch") radialT = setTimeout(() => { if (cur && !cur.moved) { cur = null; drawLive(); radial(e.clientX, e.clientY); } }, 650);
  }
  function move(e, at) {
    const [X, Y] = at;
    if (cur && cur.pan) { panBy(e.clientX - cur.pan.x, e.clientY - cur.pan.y); cur.pan.x = e.clientX; cur.pan.y = e.clientY; return; }
    if (cur && cur.mv) { const o = cur.mv.orig, n = { ...o, x: o.x + X - cur.mv.sx, y: o.y + Y - cur.mv.sy }; cur.mv.moved = cur.mv.moved || Math.abs(X - cur.mv.sx) + Math.abs(Y - cur.mv.sy) > 2; strokes = strokes.map((s) => (s === boxSel ? n : s)); boxSel = n; redrawSoon(); return; }
    if (drag) { drag.dx = X - drag.sx; drag.dy = Y - drag.sy; drawLive(); return; }
    if (lasso) { lasso.push([X, Y]); drawLive(); return; }
    if (!cur) return;
    if (cur.erase) { eraseAt(X, Y); return; }
    if (cur.snapped) return;
    const k = 1 - pref.smooth;
    const fx = cur.fx + (X - cur.fx) * k, fy = cur.fy + (Y - cur.fy) * k;
    const d = Math.hypot(fx - cur.fx, fy - cur.fy);
    if (d < 0.6 / Math.max(1, cam.z)) return;
    if (Math.hypot(X - cur.sx, Y - cur.sy) > 5 / cam.z) { cur.moved = true; clearTimeout(radialT); }
    let pr;
    if (cur.real) pr = e.pressure;
    else { const dt = Math.max(1, e.timeStamp - cur.lt), v = d * cam.z / dt; pr = cur.pr * 0.7 + Math.max(0.3, Math.min(1, 1.15 - v * 0.9)) * 0.3; }
    cur.fx = fx; cur.fy = fy; cur.lt = e.timeStamp; cur.pr = pr;
    cur.s.p.push(fx, fy, pr);
    drawLive(); if (zs.on) drawStrip();
    if (pref.snap && pref.tool !== "hl") { clearTimeout(holdT); holdT = setTimeout(() => { if (!cur || cur.erase) return; const sh = recognize(cur.s.p); if (sh) { cur.s.p = sh; cur.snapped = true; drawLive(); drawStrip(); } }, 550); }
  }
  function end() {
    clearTimeout(holdT); clearTimeout(radialT);
    if (cur && cur.pan) { cur = null; info(); return; }
    if (cur && cur.mv) { const m = cur.mv; cur = null; if (m.moved) { changed(); grow(boxSel); } else { strokes = hist.pop(); boxSel = m.orig; redraw(); } return; }
    if (drag) {
      const { dx, dy } = drag; drag = null;
      if (Math.abs(dx) + Math.abs(dy) > 1) { snap(); const moved = new Set(); strokes = strokes.map((s) => { if (!sel.has(s)) return s; const t = isBox(s) ? { ...s, x: s.x + dx, y: s.y + dy } : { ...s, p: s.p.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v)) }; moved.add(t); return t; }); sel = moved; redraw(); changed(); grow([...moved].pop()); }
      else drawLive();
      return;
    }
    if (lasso) {
      const poly = lasso; lasso = null;
      if (typeof QA !== "undefined" && QA.mode && poly.length > 4) { qaCapture(poly); drawLive(); return; }
      if (poly.length > 4) {
        sel = new Set(strokes.filter((s) => {
          if (isBox(s)) { const b = sbox(s); return inPoly((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, poly); }
          let inside = 0; const n = s.p.length / 3; for (let i = 0; i < s.p.length; i += 3) if (inPoly(s.p[i], s.p[i + 1], poly)) inside++; return inside / n > 0.6;
        }));
        if (!sel.size) sel = null;
      }
      syncTools(); drawLive(); return;
    }
    if (!cur) return;
    if (cur.erase) { if (!cur.hit) hist.pop(); cur = null; return; }
    const s = cur.s; cur = null;
    snap(); strokes = strokes.concat([s]); setT(xb); drawStroke(xb, s, pageTh()); drawLive(); drawStrip(); drawMini(); changed(); grow(s);
  }
  async function qaCapture(poly) {  // the lassoed area of the page -> a picture for the card
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const r = [Math.min(...xs) - 8, Math.min(...ys) - 8, Math.max(...xs) + 8, Math.max(...ys) + 8];
    if (r[2] - r[0] < 12 || r[3] - r[1] < 12) return;
    const k = Math.min(2, 1100 / (r[2] - r[0]), 900 / (r[3] - r[1])), c = document.createElement("canvas");
    c.width = Math.round((r[2] - r[0]) * k); c.height = Math.round((r[3] - r[1]) * k);
    const x = c.getContext("2d"); x.fillStyle = PTH[pageTh()].bg; x.fillRect(0, 0, c.width, c.height);
    x.setTransform(k, 0, 0, k, -r[0] * k, -r[1] * k); drawWorld(x, r, k);
    const kind = QA.mode, url = c.toDataURL("image/png");
    qaRects.push({ r, kind, n: QA.pairs.filter((p) => p.q).length + (kind === "q" ? 1 : 0) });
    try { const a = await api("paper/asset", { data: url }); QA.take({ img: a.id, preview: url }); } catch (e) { toast(e.message); }
    drawLive();
  }
  // ----- text boxes and sticky notes -----
  function textH(item, text) {  // height that fits the text; a sticky keeps at least its own height
    const pad = tPad(item), fs = item.fs || 22;
    xb.save(); xb.font = `${fs}px ${tFont(item)}`; const lines = text ? wrapText(xb, text, item.w - pad * 2 - (item.sticky ? 26 : 0)).length : 0; xb.restore();
    return Math.max(item.sticky ? Math.max(80, item.h || item.w) : 30, pad * 2 + Math.max(1, lines) * fs * 1.3);
  }
  function editText(item, isNew) {
    if (editing) commitText();
    if (item.col) { const open = { ...item, col: false }; if (!isNew) { strokes = strokes.map((s) => (s === item ? open : s)); } item = open; }
    boxSel = isNew ? null : item;
    editing = item; redraw();
    const ta = document.createElement("textarea"); ta.className = "ptext" + (item.sticky ? " sticky" : ""); ta.value = item.text || "";
    ta.setAttribute("aria-label", item.sticky ? "sticky note" : "text");
    const fs = (item.fs || 22) * cam.z, pad = tPad(item) * cam.z;
    Object.assign(ta.style, { left: (item.x - cam.x) * cam.z + "px", top: (item.y - cam.y) * cam.z + "px", width: item.w * cam.z + "px", minHeight: item.h * cam.z + "px", fontSize: fs + "px", padding: pad + "px", paddingRight: pad + (item.sticky ? 26 * cam.z : 0) + "px",
      color: item.sticky ? "#1d1d1b" : PTH[pageTh()].ink[item.c] || "#fff", background: item.sticky ? STICKY[item.c] || STICKY[0] : "transparent", fontFamily: tFont(item) });
    view.appendChild(ta); ta.focus();
    const fitH = () => { ta.style.height = "auto"; ta.style.height = Math.max(item.h * cam.z, ta.scrollHeight) + "px"; }; fitH();
    ta.oninput = () => { fitH(); showBox(); };
    ta.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) ta.blur(); };
    ta.onblur = () => commitText();
    editing._ta = ta; editing._new = isNew;
  }
  function commitText() {
    const item = editing; if (!item) return;
    const ta = item._ta; editing = null;
    const text = ta.value.replace(/\s+$/, ""); ta.remove();
    const next = { k: "t", text, sticky: !!item.sticky, c: item.c, fs: item.fs || 22, ff: tFF(item), x: item.x, y: item.y, w: item.w, h: item.h };
    next.h = item.sticky ? Math.max(item.h || item.w, textH(next, text)) : textH(next, text);
    if (!text && item._new) { boxSel = null; return redraw(); }
    snap();
    strokes = item._new ? strokes.concat([next]) : (text ? strokes.map((s) => (s === item ? next : s)) : strokes.filter((s) => s !== item));
    boxSel = text ? next : null;
    if (!next.sticky) lastFF = next.ff;
    redraw(); changed(); grow(next);
  }
  // ----- the bar over a selected note or text box: move, resize, colour, font, size, fold, delete -----
  let boxSel = null;
  const pbox = $("#pbox");
  function showBox() {
    const it = editing || boxSel;
    if (!it || (!editing && !strokes.includes(boxSel)) || replayK !== null) { pbox.hidden = true; if (!editing) boxSel = null; return; }
    const hh = editing ? Math.max(it.h, (it._ta ? it._ta.offsetHeight / cam.z : it.h)) : it.k === "t" ? tShown(it) : it.h;
    Object.assign(pbox.style, { left: (it.x - cam.x) * cam.z + "px", top: (it.y - cam.y) * cam.z + "px", width: it.w * cam.z + "px", height: hh * cam.z + "px" });
    pbox.hidden = false;
    const isT = it.k === "t";
    for (const id of ["pbcols", "pbff", "pbsm", "pbfs", "pbbg", "pbed"]) $("#" + id).hidden = !isT;
    $("#pbfold").hidden = !(isT && it.sticky) || !!editing;
    $("#pbrs").hidden = !!editing;
    if (isT) {
      pbox.querySelectorAll(".pbc").forEach((b) => { const i = +b.dataset.c; b.style.background = it.sticky ? STICKY[i] : PTH[pageTh()].ink[i]; b.classList.toggle("on", i === it.c); });
      $("#pbff").value = tFF(it); $("#pbfs").textContent = Math.round(it.fs || 22);
      $("#pbfold").innerHTML = pic(it.col ? "unfold" : "fold", 16); $("#pbfold").title = it.col ? "unfold" : "fold to one line";
    }
    pbox.classList.toggle("up", (it.y - cam.y) * cam.z < 46);  // no room above: put the bar below
  }
  function patchBox(p) {  // change the selected box; keeps typing going if it was being edited
    const wasEditing = !!editing;
    if (editing) commitText();
    if (!boxSel) return;
    snap();
    let n = { ...boxSel, ...p };
    if (n.k === "t" && ("fs" in p || "ff" in p)) n.h = n.sticky ? Math.max(n.h, textH(n, n.text)) : textH(n, n.text);
    strokes = strokes.map((s) => (s === boxSel ? n : s)); boxSel = n;
    redraw(); changed(); grow(n);
    if (wasEditing && n.k === "t") editText(n, false);
  }
  pbox.addEventListener("mousedown", (e) => { if (e.target.tagName !== "SELECT") e.preventDefault(); });  // keep the text box focused while using the bar
  pbox.querySelectorAll(".pbc").forEach((b) => (b.onclick = () => patchBox({ c: +b.dataset.c })));
  $("#pbff").onchange = () => patchBox({ ff: $("#pbff").value });
  $("#pbsm").onclick = () => patchBox({ fs: Math.max(10, Math.round((boxSel || editing).fs || 22) - 2) });
  $("#pbbg").onclick = () => patchBox({ fs: Math.min(120, Math.round((boxSel || editing).fs || 22) + 2) });
  $("#pbfold").onclick = () => { if (boxSel) toggleFold(boxSel); };
  function toggleFold(it) {  // folds a sticky up into its first line, or opens it, with a short slide
    if (editing) commitText();
    snap();
    const n = { ...it, col: !it.col }, from = tShown(it), to = n.col ? FOLDH(n) : n.h, t0 = performance.now(), dur = calm() ? 0 : 180;
    strokes = strokes.map((s) => (s === it ? n : s)); if (boxSel === it) boxSel = n;
    const step = (t) => {
      const k = dur ? Math.min(1, (t - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      if (k < 1) { FOLDING.set(n, from + (to - from) * e); redraw(); requestAnimationFrame(step); }
      else { FOLDING.delete(n); redraw(); changed(); }
    };
    requestAnimationFrame(step);
  }
  $("#pbed").onclick = () => { if (boxSel && !editing) editText(boxSel, false); };
  $("#pbdel").onclick = () => { if (editing) { editing._ta.value = ""; const it = editing; commitText(); if (!it._new) return; } if (!boxSel) return; snap(); strokes = strokes.filter((s) => s !== boxSel); boxSel = null; redraw(); changed(); };
  function boxDrag(e, kind) {  // the grip moves it, the corner resizes it
    e.preventDefault(); e.stopPropagation();
    if (editing) commitText();
    if (!boxSel) return;
    const orig = boxSel, sx = e.clientX, sy = e.clientY; let movedAny = false;
    snap();
    const mv = (ev) => {
      const dx = (ev.clientX - sx) / cam.z, dy = (ev.clientY - sy) / cam.z; movedAny = true;
      let n;
      if (kind === "move") n = { ...orig, x: orig.x + dx, y: orig.y + dy };
      else if (orig.k === "i") { const w = Math.max(40, orig.w + dx); n = { ...orig, w, h: w * orig.h / orig.w }; }
      else { n = { ...orig, w: Math.max(80, orig.w + dx) }; n.h = orig.sticky ? Math.max(60, orig.h + dy) : textH(n, n.text); if (orig.sticky) n.h = Math.max(n.h, n.col ? 0 : textH({ ...n, h: 0 }, n.text)); }
      strokes = strokes.map((s) => (s === boxSel ? n : s)); boxSel = n; redrawSoon();
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); if (movedAny) { changed(); grow(boxSel); } else hist.pop(); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }
  $("#pbgrip").addEventListener("pointerdown", (e) => boxDrag(e, "move"));
  $("#pbrs").addEventListener("pointerdown", (e) => boxDrag(e, "size"));
  $("#psticky").onclick = () => {
    const [x0, y0, x1, y1] = viewRect(), w = 240, vis = strokes.filter((s) => s.sticky && s.x < x1 && s.x + s.w > x0 && s.y < y1 && s.y + s.h > y0);
    let x = (x0 + x1) / 2 - w / 2, y = (y0 + y1) / 2 - w / 2;
    if (vis.length) { const last = vis[vis.length - 1]; x = last.x + last.w + 24; y = last.y; if (x + w > x1) { x = vis[0].x; y = Math.max(...vis.map((s) => s.y + s.h)) + 24; } }  // line up beside the last one
    setTool("text");
    editText({ k: "t", sticky: true, text: "", c: pref.ink, fs: 24, ff: "serif", x, y, w, h: w }, true);
  };
  function eraseAt(X, Y) {
    const r = 14 + pref.size * 1.5, r2 = r * r;
    const keep = strokes.filter((s) => { if (isBox(s)) return true; for (let i = 0; i < s.p.length; i += 3) { const dx = s.p[i] - X, dy = s.p[i + 1] - Y; if (dx * dx + dy * dy < r2) return false; } return true; });
    if (keep.length !== strokes.length) { strokes = keep; cur.hit = true; redraw(); changed(); }
  }
  function radial(cx, cy) {
    const R = $("#pradial"), host = view.getBoundingClientRect();
    R.style.left = cx - host.left - 75 + "px"; R.style.top = cy - host.top - 75 + "px"; R.hidden = false;
    $("#prc").style.background = PTH[pageTh()].ink[pref.ink];
    R.querySelectorAll("button").forEach((b) => (b.onclick = () => { R.hidden = true; setTool(b.dataset.tool); }));
    $("#prc").onclick = () => { pref.ink = (pref.ink + 1) % 4; $("#prc").style.background = PTH[pageTh()].ink[pref.ink]; syncTools(); };
  }

  // ----- input: pen vs finger, palm rejection, wrist guard, moving and zooming, finger taps -----
  const touches = new Map(); let gesture = null, active = null, hinted = false, spaceDown = false, mpan = null;
  const isPalm = (e) => e.pointerType === "touch" && e.width > 110 && e.height > 110;
  const inGuard = (e) => pref.touch && e.clientY > view.getBoundingClientRect().bottom - pref.guard;
  const drawer = (e) => {
    if (e.pointerType === "mouse") return e.button === 0 && !spaceDown;
    if (e.pointerType === "pen") return true;
    return pref.touch && touches.size === 1 && Date.now() - penSeen > 1500;
  };
  const toolFor = (e) => (e.pointerType === "pen" && (e.buttons & 32 || e.buttons & 2) ? "er" : pref.tool);
  function onDown(e, mapper) {
    if (replayK !== null || playing) return;
    if (e.pointerType === "pen") { penSeen = Date.now(); if (!PS.get().penEver) PS.set({ penEver: 1 }); }
    if (e.pointerType === "mouse" && (e.button === 1 || (e.button === 0 && spaceDown))) { e.preventDefault(); mpan = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { e.target.setPointerCapture(e.pointerId); } catch (er) {} return; }
    if (e.pointerType === "touch") {
      if (isPalm(e) || inGuard(e)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size >= 2) {  // two fingers: cancel a just-started touch stroke, then move / zoom
        if (active && active.touch) { cur = null; lasso = null; active = null; drawLive(); }
        gesture = gesture || { t: e.timeStamp, max: 0, moved: 0 };
        const [a, b] = [...touches.values()]; gesture.d = Math.hypot(a.x - b.x, a.y - b.y); gesture.mx = (a.x + b.x) / 2; gesture.my = (a.y + b.y) / 2;
        gesture.max = Math.max(gesture.max, touches.size);
        return;
      }
    }
    if (active || !drawer(e)) {
      if (e.pointerType === "touch") { gesture = gesture || { t: e.timeStamp, max: 1, moved: 0, pan: true };
        if (!pref.touch && !hinted) { hinted = true; toast("Your finger moves around right now · tap the hand button to draw with touch"); } }
      return;
    }
    e.preventDefault(); try { e.target.setPointerCapture(e.pointerId); } catch (er) {}
    active = { id: e.pointerId, touch: e.pointerType === "touch", mapper };
    begin(e, mapper(e), toolFor(e));
  }
  function onMove(e) {
    if (e.pointerType === "pen") penSeen = Date.now();
    if (mpan && mpan.id === e.pointerId) { panBy(e.clientX - mpan.x, e.clientY - mpan.y); mpan.x = e.clientX; mpan.y = e.clientY; return; }
    const t = touches.get(e.pointerId);
    if (t && (!active || active.id !== e.pointerId)) {
      const dx = e.clientX - t.x, dy = e.clientY - t.y; t.x = e.clientX; t.y = e.clientY;
      if (gesture) {
        gesture.moved += Math.abs(dx) + Math.abs(dy);
        if (touches.size >= 2) {
          const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          panBy(mx - gesture.mx, my - gesture.my);
          if (gesture.d > 20) zoomAt(d / gesture.d, mx, my);
          gesture.d = d; gesture.mx = mx; gesture.my = my;
        } else if (gesture.pan) panBy(dx, dy);
      }
      return;
    }
    if (!active || active.id !== e.pointerId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ce of evs.length ? evs : [e]) move(ce, active.mapper(ce));
  }
  function onUp(e) {
    if (mpan && mpan.id === e.pointerId) { mpan = null; return; }
    if (touches.has(e.pointerId)) {
      touches.delete(e.pointerId);
      if (!touches.size && gesture) {  // quick two / three finger tap = undo / redo
        if (gesture.max >= 2 && e.timeStamp - gesture.t < 320 && gesture.moved < 24) (gesture.max >= 3 ? redoIt : undo)();
        gesture = null;
      } else if (touches.size === 1 && gesture) { const [a] = [...touches.values()]; gesture.mx = a.x; gesture.my = a.y; gesture.pan = true; }
    }
    if (!active || active.id !== e.pointerId) return;
    active = null; end();
  }
  cl.addEventListener("pointerdown", (e) => {
    if (zs.on && pref.tool !== "lasso" && pref.tool !== "er" && e.pointerType !== "touch" && e.button === 0 && !spaceDown) {  // with the strip on, tapping the board moves the writing box
      const [X, Y] = toWorld(e); zs.x = canvasMode ? X - 20 : Math.max(0, Math.min(PW - zs.w, X - 20)); zs.y = canvasMode ? Y - zs.h / 2 : Math.max(0, Math.min(H() - zs.h, Y - zs.h / 2)); zs.x0 = zs.x; drawLive(); drawStrip(); return;
    }
    onDown(e, toWorld);
  });
  cl.addEventListener("pointermove", onMove); cl.addEventListener("pointerup", onUp); cl.addEventListener("pointercancel", onUp);
  cl.addEventListener("pointerrawupdate", (e) => { if (e.pointerType === "pen") penSeen = Date.now(); });
  view.addEventListener("pointermove", (e) => { if (e.pointerType === "pen") penSeen = Date.now(); });
  cl.addEventListener("contextmenu", (e) => e.preventDefault());
  view.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
    else panBy(-(e.shiftKey ? e.deltaY : e.deltaX), -(e.shiftKey ? 0 : e.deltaY));
    info();
  }, { passive: false });

  // ----- zoom writing strip -----
  const zs = { on: false, x: 100, y: 112, w: 330, h: 96, x0: 100 };
  const cs = $("#cstrip"), xs = cs.getContext("2d");
  function stripLayout() {
    const W = Math.min(vw - 40, 980), Hh = Math.round(W * zs.h / zs.w);
    cs.style.width = W + "px"; cs.style.height = Hh + "px"; cs.width = Math.round(W * dpr); cs.height = Math.round(Hh * dpr); drawStrip();
  }
  function drawStrip() {
    if (!zs.on) return;
    const k = cs.width / zs.w;
    xs.setTransform(1, 0, 0, 1, 0, 0); xs.fillStyle = PTH[pageTh()].bg; xs.fillRect(0, 0, cs.width, cs.height);
    xs.setTransform(k, 0, 0, k, -zs.x * k, -zs.y * k);
    drawWorld(xs, [zs.x, zs.y, zs.x + zs.w, zs.y + zs.h], k / dpr);
    if (cur && cur.s) drawStroke(xs, cur.s, pageTh());
    xs.setTransform(1, 0, 0, 1, 0, 0);
    xs.strokeStyle = acc(); xs.setLineDash([6 * dpr, 6 * dpr]); xs.lineWidth = 2 * dpr; xs.beginPath(); xs.moveTo(cs.width * 0.8, 8 * dpr); xs.lineTo(cs.width * 0.8, cs.height - 8 * dpr); xs.stroke(); xs.setLineDash([]);
  }
  const stripMap = (e) => { const r = cs.getBoundingClientRect(); return [zs.x + (e.clientX - r.left) / r.width * zs.w, zs.y + (e.clientY - r.top) / r.height * zs.h]; };
  const keepBoxInView = () => { const [, y0, , y1] = viewRect(); if (zs.y < y0 || zs.y + zs.h > y1 - 260 / cam.z) { cam.y = zs.y - 120 / cam.z; clampCam(); redraw(); } };
  const nextLine = () => { zs.x = canvasMode ? zs.x0 : (page.tpl === "lined" ? 100 : 40); zs.y = canvasMode ? zs.y + LINE * 2 : Math.min(H() - zs.h, zs.y + LINE * 2); keepBoxInView(); drawLive(); drawStrip(); };
  cs.addEventListener("pointerdown", (e) => onDown(e, stripMap));
  cs.addEventListener("pointermove", onMove);
  cs.addEventListener("pointerup", (e) => {
    const wasDrawing = active && active.id === e.pointerId, r = cs.getBoundingClientRect();
    onUp(e);
    if (wasDrawing && pref.tool !== "er" && pref.tool !== "lasso" && e.clientX - r.left > r.width * 0.8) {  // past the line: slide the box along
      zs.x += zs.w * 0.6; if (!canvasMode && zs.x + zs.w > PW - 20) return nextLine();
      drawLive(); drawStrip();
    }
  });
  cs.addEventListener("pointercancel", onUp);
  cs.addEventListener("contextmenu", (e) => e.preventDefault());
  $("#pret").onclick = nextLine;
  $("#pzoom").onclick = () => {
    zs.on = !zs.on;
    if (zs.on) { const [x0, y0, x1] = viewRect(); if (canvasMode || zs.y < y0 || zs.y > y0 + vh / cam.z - 300 / cam.z) { zs.x = zs.x0 = canvasMode ? x0 + (x1 - x0) * 0.15 : 100; zs.y = y0 + 60 / cam.z; } }
    syncTools(); stripLayout(); drawLive();
  };

  // ----- Q / A flashcards -----
  let toolBeforeQA = "pen";
  $("#pqa").onclick = () => {
    if (QA.bar) { QA.close(); return; }
    qaRects = []; toolBeforeQA = pref.tool === "lasso" ? "pen" : pref.tool;
    QA.open($(".ptools"), (mode) => {
      if (!document.body.contains(cl)) return;
      if (mode) setTool("lasso");
      if (!QA.bar) { qaRects = []; setTool(toolBeforeQA); }  // bar closed: back to writing
      $("#pqa").classList.toggle("on", !!QA.bar); drawLive();
    });
    $("#pqa").classList.add("on"); QA.set("q");
  };

  // ----- flipbook: onion skin, play, frames -----
  let playing = null;
  function stopPlay() { if (!playing) return; clearInterval(playing.t); playing = null; $("#pplay").innerHTML = pic("play"); redraw(); }
  if (flipMode) {
    $("#ponion").onclick = () => { onion = !onion; $("#ponion").classList.toggle("on", onion); redraw(); };
    $("#pplay").onclick = async () => {
      if (playing) return stopPlay();
      await save();
      for (const pg of NB.pages) if (!cache[pg.id]) cache[pg.id] = (await api("paper/page", { nb: nbid, pid: pg.id })).strokes || [];
      let i = NB.pages.indexOf(page);
      $("#pplay").innerHTML = pic("pause");
      playing = { t: setInterval(() => {
        i = (i + 1) % NB.pages.length;
        xb.setTransform(1, 0, 0, 1, 0, 0); xb.fillStyle = getComputedStyle(document.body).backgroundColor || "#0c0d0b"; xb.fillRect(0, 0, cb.width, cb.height);
        setT(xb); drawTemplate(xb, NB.pages[i].tpl, pageTh(), NB.pages[i].h || PH);
        for (const s of cache[NB.pages[i].id]) drawStroke(xb, s, pageTh());
        xl.setTransform(1, 0, 0, 1, 0, 0); xl.clearRect(0, 0, cl.width, cl.height);
        $("#pinfo").textContent = `playing · frame ${i + 1} of ${NB.pages.length}`;
      }, 1000 / +$("#pfps").value) };
    };
    $("#pfps").onchange = () => { if (playing) { stopPlay(); $("#pplay").click(); } };
    $("#pdup").onclick = async () => {
      await save();
      const pg = await api("paper/addpage", { nb: nbid, tpl: page.tpl, after: NB.pages.indexOf(page) });
      NB.pages.splice(NB.pages.indexOf(page) + 1, 0, pg);
      cache[pg.id] = strokes.slice();
      await api("paper/save", { nb: nbid, pid: pg.id, strokes: cache[pg.id] });
      openPage(pg);
    };
    $("#pdelf").onclick = async () => {
      if (NB.pages.length < 2) return toast("A flipbook needs at least one frame.");
      if (!$("#pdelf").dataset.sure) { $("#pdelf").dataset.sure = 1; toast("Tap delete again to remove this frame"); setTimeout(() => delete $("#pdelf")?.dataset.sure, 2500); return; }
      const i = NB.pages.indexOf(page), r = await api("paper/delpage", { nb: nbid, pid: page.id });
      NB.pages = r.pages; dirty = false; openPage(NB.pages[Math.max(0, i - 1)]);
    };
  }

  // ----- replay: watch the page being drawn again -----
  const rep = { t: null, total: 0 };
  function replayStop() { clearInterval(rep.t); rep.t = null; replayK = null; $("#prep").hidden = true; redraw(); }
  function replayPlay() {
    clearInterval(rep.t); $("#rpp").innerHTML = pic("pause", 16);
    rep.t = setInterval(() => {
      replayK = Math.min(rep.total, replayK + +$("#rpx").value * 1.5);
      $("#rps").value = Math.round(1000 * replayK / rep.total); redrawSoon();
      if (replayK >= rep.total) { clearInterval(rep.t); rep.t = null; $("#rpp").innerHTML = pic("play", 16); }
    }, 33);
  }
  if ($("#preplay")) $("#preplay").onclick = () => {
    if (replayK !== null) return replayStop();
    rep.total = pointCount(strokes); if (!rep.total) return toast("Nothing drawn here yet.");
    replayK = 0; $("#prep").hidden = false; redraw(); replayPlay();
  };
  $("#rpp").onclick = () => { if (rep.t) { clearInterval(rep.t); rep.t = null; $("#rpp").innerHTML = pic("play", 16); } else { if (replayK >= rep.total) replayK = 0; replayPlay(); } };
  $("#rps").oninput = (e) => { clearInterval(rep.t); rep.t = null; $("#rpp").innerHTML = pic("play", 16); replayK = rep.total * e.target.value / 1000; redrawSoon(); };
  $("#rpc").onclick = replayStop;
  $("#rpg").onclick = async () => {
    toast("Making the GIF…"); await new Promise((r) => setTimeout(r, 30));
    const N = 48, frames = [];
    for (let f = 1; f <= N; f++) {
      const list = partialList(strokes, rep.total * f / N), c = document.createElement("canvas");
      if (canvasMode) { const b = allBox(strokes), w = b[2] - b[0] + 120, h = b[3] - b[1] + 120, k = Math.min(1, 720 / Math.max(w, h)); c.width = Math.round(w * k); c.height = Math.round(h * k);
        const x = c.getContext("2d"); x.setTransform(k, 0, 0, k, -(b[0] - 60) * k, -(b[1] - 60) * k); drawPattern(x, page.tpl, th(), [b[0] - 60, b[1] - 60, b[2] + 60, b[3] + 60], k); for (const s of list) drawStroke(x, s, th()); }
      else { c.width = 500; c.height = Math.round(500 * H() / PW); renderPage(c, list, page, th(), "pages"); }
      frames.push(c);
    }
    saveGif(frames, frames.map((_, i) => (i === N - 1 ? 2000 : 90)), `${NB.title} - replay.gif`);
  };

  // ----- wrist guard resize -----
  $("#pgh").addEventListener("pointerdown", (e) => {
    e.preventDefault(); const y0 = e.clientY, g0 = pref.guard; e.target.setPointerCapture(e.pointerId);
    const mv = (ev) => { pref.guard = Math.max(50, Math.min(320, g0 - (ev.clientY - y0))); syncTools(); };
    e.target.addEventListener("pointermove", mv); e.target.addEventListener("pointerup", () => e.target.removeEventListener("pointermove", mv), { once: true });
  });

  // ----- keys, leaving, resizing -----
  const keys = (e) => {
    if (!document.body.contains(cl)) { document.removeEventListener("keydown", keys); document.removeEventListener("keyup", keyUp); return; }
    if (e.target.matches("input,textarea,select")) return;
    const k = e.key.toLowerCase();
    if (k === " ") { spaceDown = true; cl.style.cursor = "grab"; e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? redoIt() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); redoIt(); }
    else if ((e.ctrlKey || e.metaKey) && (k === "=" || k === "+" || k === "-")) { e.preventDefault(); const r = cb.getBoundingClientRect(); zoomAt(k === "-" ? 0.85 : 1.18, r.left + vw / 2, r.top + vh / 2); }
    else if (k === "delete" || k === "backspace") { if (boxSel) $("#pbdel").click(); else $("#pdel").click(); }
    else if (k === "escape" && boxSel) { boxSel = null; showBox(); }
    else if (k === "0") fit();
    else if (k === "m" && mini) miniShow(mini.hidden);
    else if (k === "f" && !e.ctrlKey) toggleFull();
    else if (!e.ctrlKey && { p: 1, h: 1, e: 1, l: 1, t: 1, v: 1 }[k]) setTool({ p: "pen", h: "hl", e: "er", l: "lasso", t: "text", v: "move" }[k]);
  };
  const keyUp = (e) => { if (e.key === " ") { spaceDown = false; cl.style.cursor = ""; } };
  document.addEventListener("keydown", keys); document.addEventListener("keyup", keyUp);
  const leave = () => {
    save(); clearInterval(rep.t); if (playing) clearInterval(playing.t); window.removeEventListener("hashchange", leave); document.removeEventListener("fullscreenchange", fsChange);
    if (document.body.classList.contains("pfull")) { document.body.classList.remove("pfull"); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  };
  window.addEventListener("hashchange", leave);
  window.addEventListener("beforeunload", () => save());
  let lastW = 0;
  const ro = new ResizeObserver(() => { if (!document.body.contains(cl)) return ro.disconnect(); const w0 = vw; resize(); if (!lastW || Math.abs(w0 - vw) > 200) { lastW = vw; } clampCam(); redraw(); if (zs.on) stripLayout(); });
  ro.observe(view);

  syncTools();
  await openPage(page);
}
