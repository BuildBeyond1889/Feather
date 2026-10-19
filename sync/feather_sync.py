"""Feather · PC sync. Runs quietly in the background on your PC (started with Windows).

Plug the Feather stick in and, with nothing else to do:
  1. your reading logs, chapter notes, quotes, reviews, flashcards, exams and Paper pages go into Obsidian (vault\\Feather\\…)
  2. your Obsidian notes are copied onto the stick (encrypted) for mock exams, study sessions and teach-it-back
  3. a small Archie notification pops up: "Feather updated · safe to eject", with an eject button.

The first time it sees your stick it asks for the Feather password once, then remembers the key on THIS PC only,
protected by your Windows login (DPAPI). A lost stick stays locked. Each sync also keeps an encrypted backup of the stick in D:\\Feather\\backups.
"""
import base64, ctypes, urllib.request, zipfile, tempfile, ctypes.wintypes as W, gzip, json, os, re, shutil, sqlite3, string, subprocess, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)  # D:\Feather
sys.path.insert(0, os.path.join(BASE, "app"))
import store  # noqa: E402

SETTINGS = os.path.join(HERE, "settings.json")
PAIRED = os.path.join(HERE, "paired.json")
ICON = os.path.join(BASE, "icon", "feather-48.png")


# ---------- Windows key protection (DPAPI) ----------
class BLOB(ctypes.Structure):
    _fields_ = [("cbData", W.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _blob(b):
    buf = ctypes.create_string_buffer(b, len(b))
    return BLOB(len(b), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf


def protect(b):
    i, _k = _blob(b)
    o = BLOB()
    ctypes.windll.crypt32.CryptProtectData(ctypes.byref(i), None, None, None, None, 0, ctypes.byref(o))
    r = ctypes.string_at(o.pbData, o.cbData)
    ctypes.windll.kernel32.LocalFree(o.pbData)
    return r


def unprotect(b):
    i, _k = _blob(b)
    o = BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(i), None, None, None, None, 0, ctypes.byref(o)):
        return None
    r = ctypes.string_at(o.pbData, o.cbData)
    ctypes.windll.kernel32.LocalFree(o.pbData)
    return r


def load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return default


# ---------- the little Archie windows ----------
def ask_password(msg):
    import tkinter as tk
    res = {"pw": None}
    w = tk.Tk()
    w.title("Feather")
    w.configure(bg="#0c0d0b")
    w.attributes("-topmost", True)
    w.resizable(False, False)
    tk.Label(w, text=msg, fg="#e8ecdf", bg="#0c0d0b", font=("Consolas", 11), justify="left", wraplength=360).pack(padx=22, pady=(20, 10), anchor="w")
    e = tk.Entry(w, show="•", font=("Consolas", 13), bg="#141612", fg="#e8ecdf", insertbackground="#c6f432", relief="flat", width=30)
    e.pack(padx=22, pady=6, ipady=6)
    e.focus_set()

    def ok(*_):
        res["pw"] = e.get()
        w.destroy()
    tk.Button(w, text="pair this PC", command=ok, bg="#c6f432", fg="#0c0d0b", relief="flat", font=("Consolas", 11, "bold"), padx=14, pady=6).pack(padx=22, pady=(8, 20), anchor="e")
    e.bind("<Return>", ok)
    w.mainloop()
    return res["pw"]


def notify(title, lines, drive=None, extra=None):
    import tkinter as tk
    w = tk.Tk()
    w.overrideredirect(True)
    w.attributes("-topmost", True)
    w.configure(bg="#c6f432")
    inner = tk.Frame(w, bg="#0c0d0b")
    inner.pack(padx=1, pady=1)
    top = tk.Frame(inner, bg="#0c0d0b")
    top.pack(fill="x", padx=18, pady=(14, 4))
    try:
        img = tk.PhotoImage(file=ICON)
        tk.Label(top, image=img, bg="#0c0d0b").pack(side="left")
        w._img = img
    except Exception:
        pass
    tk.Label(top, text="  Feather", fg="#8e9686", bg="#0c0d0b", font=("Consolas", 10)).pack(side="left")
    tk.Label(inner, text=title, fg="#e8ecdf", bg="#0c0d0b", font=("Consolas", 12, "bold"), anchor="w").pack(fill="x", padx=18)
    tk.Label(inner, text="\n".join(lines), fg="#a7af9e", bg="#0c0d0b", font=("Consolas", 9), justify="left", anchor="w").pack(fill="x", padx=18, pady=(6, 8))
    row = tk.Frame(inner, bg="#0c0d0b")
    row.pack(fill="x", padx=18, pady=(0, 14))

    res = {"eject": False}

    def eject():
        res["eject"] = True
        w.destroy()
    if extra:  # (label, function) e.g. save drawings to this PC
        def run_extra():
            try:
                msg = extra[1]()
            except Exception as e:
                msg = "couldn't: " + str(e)[:40]
            xb.config(text=msg or "done ✓", state="disabled")
        xb = tk.Button(row, text=extra[0], command=run_extra, bg="#c6f432", fg="#0c0d0b", relief="flat", font=("Consolas", 10, "bold"), padx=12, pady=4)
        xb.pack(side="left", padx=(0, 8))
    if drive:
        tk.Button(row, text="eject", command=eject, bg="#c6f432", fg="#0c0d0b", relief="flat", font=("Consolas", 10, "bold"), padx=12, pady=4).pack(side="left")
    tk.Button(row, text="close", command=w.destroy, bg="#0c0d0b", fg="#c9d0bf", relief="flat", font=("Consolas", 10), padx=12, pady=4).pack(side="left", padx=8)
    w.update_idletasks()
    ww, hh = max(380, w.winfo_reqwidth()), w.winfo_reqheight()
    w.geometry(f"{ww}x{hh}+{w.winfo_screenwidth() - ww - 24}+{w.winfo_screenheight() - hh - 64}")
    w.after(25000, w.destroy)
    w.mainloop()
    if res["eject"]:
        eject_drive(drive)


def eject_drive(drive):
    """Eject through Windows, then say so: Windows itself stays quiet when a program ejects a stick."""
    for _attempt in range(3):
        subprocess.run(["powershell", "-NoProfile", "-Command",
                        f"(New-Object -comObject Shell.Application).Namespace(17).ParseName('{drive}:').InvokeVerb('Eject'); Start-Sleep -Seconds 4"],
                       creationflags=0x08000000, timeout=40)  # stay alive while Windows finishes the eject
        for _ in range(12):
            if not os.path.exists(f"{drive}:\\"):
                log("ejected", drive)
                return notify("Safe to unplug", ["Feather is ejected. Toss it in your bag."])
            time.sleep(0.5)
    log("eject failed", drive)
    notify("Couldn't eject Feather", ["Something on the stick is still open", "(a File Explorer window or the Feather app).", "Close it and try again."], drive)


# ---------- Obsidian export / import ----------
def safe(name):
    return re.sub(r'[\\/:*?"<>|]+', "-", name).strip() or "untitled"


def export(data, vault, folder):
    out = os.path.join(vault, folder)
    os.makedirs(os.path.join(out, "Books"), exist_ok=True)
    n = 0
    for b in data["books"].values():
        pr = b.get("progress", {})
        md = ["---", f"author: {b.get('author', '')}", f"pages: {b.get('pages') or ''}", f"page: {pr.get('page') or ''}",
              f"started: {time.strftime('%Y-%m-%d', time.localtime(b.get('started', 0)))}",
              f"finished: {time.strftime('%Y-%m-%d', time.localtime(b['finished'])) if b.get('finished') else ''}", "source: Feather", "---",
              f"# {b.get('title', '')}", ""]
        if b.get("review", {}).get("text"):
            md += ["## Review", b["review"]["text"], ""]
        if b.get("people"):
            md += ["## People", ", ".join(f"[[{p}]]" for p in b["people"]), ""]
        md += ["## Notes"]
        for ch, v in sorted(b.get("chapters", {}).items(), key=lambda x: x[1].get("t", 0)):
            md += [f"### {ch}" + (f"  · {' · '.join(v.get('tags', []))}" if v.get("tags") else ""), v.get("notes", ""), ""]
        if b.get("quotes"):
            md += ["## Quotes"] + [f"> {q['text']}" + (f" ({q['chapter']})" if q.get("chapter") else f" (p. {q['page']})" if q.get("page") else "") + "\n" for q in b["quotes"]]
        hl = sorted(data.get("marks", {}).get(b.get("digital") or "", []), key=lambda m: (m["ch"], m["a"], m["oa"]))
        if hl:  # highlights and notes from the reader
            md += ["## Highlights"]
            for m in hl:
                md += [f"> {m['text']}", f"> — chapter {m['ch'] + 1}" + (f"\n\n{m['note']}" if m.get("note") else ""), ""]
        open(os.path.join(out, "Books", safe(b.get("title", "")) + ".md"), "w", encoding="utf-8").write("\n".join(md))
        n += 1
    decks = {}
    for c in data["cards"].values():
        decks.setdefault(c.get("deck", "General"), []).append(c)
    fc = ["# Feather flashcards", "Written by Feather at each sync. Edit cards in Feather; changes here are overwritten.", ""]
    for d, cs in sorted(decks.items()):
        fc += [f"## {d}"] + [f"{c['front'].replace(chr(10), ' ')}::{c['back'].replace(chr(10), ' ')}" for c in cs] + [""]
    open(os.path.join(out, "Flashcards.md"), "w", encoding="utf-8").write("\n".join(fc))
    ex = ["# Feather exams", "", "| date | exam | score | weak spots |", "|---|---|---|---|"]
    ex += [f"| {time.strftime('%Y-%m-%d', time.localtime(e['t']))} | {e['title']} | {e['score']}% | {', '.join(e.get('weak', []))} |" for e in reversed(data["exams"])]
    open(os.path.join(out, "Exams.md"), "w", encoding="utf-8").write("\n".join(ex))
    return n, len(data["cards"])


# ---------- Paper: handwritten pages -> PNGs in Obsidian ----------
PAPER_TH = {
    "dark": {"bg": "#141612", "line": "#262a22", "line2": "#3a4033", "margin": (255, 122, 107, 56), "ink": ["#f0eee6", "#c6f432", "#ff7a6b", "#7fb4ff"]},
    "sepia": {"bg": "#f1e7d0", "line": "#ddcfb2", "line2": "#c4b28c", "margin": (200, 60, 40, 64), "ink": ["#3b2f22", "#5b7a12", "#c0432f", "#2f5fae"]},
    "paper": {"bg": "#fbfaf6", "line": "#e4e1d7", "line2": "#cbc6b6", "margin": (214, 64, 47, 64), "ink": ["#1d1d1b", "#4f7d00", "#d6402f", "#2f6fd6"]},
}
PAPER_HL = [(255, 214, 0, 92), (198, 244, 50, 77), (255, 122, 107, 77), (127, 180, 255, 82)]


def render_paper(strokes, tpl, theme, k=1.5, h=1400, bg=None, kind="pages", load=None):
    """Draw one page (1000 wide, h tall) or a whole canvas (cropped to what's drawn) the same way Feather does.
    bg / pictures come from load(asset_id) -> PIL image."""
    from PIL import Image, ImageDraw
    import io
    T = PAPER_TH.get(theme, PAPER_TH["dark"])
    ox = oy = 0
    if kind == "canvas":  # crop to the drawing, 60 units of margin, no more than ~6000 px
        xs, ys = [], []
        for s in strokes:
            if s.get("k") in ("i", "t"):
                xs += [s["x"], s["x"] + s["w"]]; ys += [s["y"], s["y"] + s["h"]]
            else:
                xs += s.get("p", [])[0::3]; ys += s.get("p", [])[1::3]
        if not xs:
            xs, ys = [0, 1000], [0, 700]
        ox, oy = min(xs) - 60, min(ys) - 60
        w0, h = max(xs) + 60 - ox, max(ys) + 60 - oy
        k = min(k, 6000 / max(w0, h))
        W, H = int(w0 * k), int(h * k)
    else:
        W, H = int(1000 * k), int(h * k)
    im = Image.new("RGB", (W, H), "#fbfaf6" if bg else T["bg"])
    if bg and load:
        try:
            im.paste(load(bg).convert("RGB").resize((W, H)), (0, 0))
        except Exception as e:
            log("paper bg:", repr(e))
        tpl, T = "blank", PAPER_TH["paper"]
    d = ImageDraw.Draw(im, "RGBA")
    S = lambda v: v * k
    hl = lambda y, a=0, b=1000, c=T["line"], w=1.2: d.line([(S(a), S(y)), (S(b), S(y))], fill=c, width=max(1, round(w * k)))
    vl = lambda x, a=0, b=h, c=T["line"], w=1.2: d.line([(S(x), S(a)), (S(x), S(b))], fill=c, width=max(1, round(w * k)))
    if kind == "canvas":  # the endless board's pattern, lined up with Feather's
        g = 40
        x0, y0 = int(ox // g) * g, int(oy // g) * g
        for X in range(x0, int(ox + W / k) + g, g):
            for Y in range(y0, int(oy + H / k) + g, g):
                px, py = (X - ox) * k, (Y - oy) * k
                if tpl == "dot":
                    d.rectangle([px - 1, py - 1, px + 1, py + 1], fill=T["line2"])
            if tpl == "grid":
                d.line([((X - ox) * k, 0), ((X - ox) * k, H)], fill=T["line"], width=1)
        if tpl == "grid":
            for Y in range(y0, int(oy + H / k) + g, g):
                d.line([(0, (Y - oy) * k), (W, (Y - oy) * k)], fill=T["line"], width=1)
        tpl = None
    if tpl in ("grid", "graph"):
        for x in range(40, 1000, 40):
            vl(x)
        for y in range(40, int(h), 40):
            hl(y)
        if tpl == "graph":
            hl(round(h / 80) * 40, c=T["line2"], w=2.4)
            vl(500, c=T["line2"], w=2.4)
    elif tpl == "lined":
        for y in range(140, int(h) - 20, 44):
            hl(y)
        vl(90, c=T["margin"])
    elif tpl == "dot":
        for x in range(40, 1000, 40):
            for y in range(40, int(h), 40):
                d.ellipse([S(x - 2), S(y - 2), S(x + 2), S(y + 2)], fill=T["line2"])
    elif tpl == "cornell":
        end = h - 220
        for y in range(174, int(end), 44):
            hl(y, 290)
        hl(130, c=T["line2"], w=2.4)
        vl(280, 130, end, c=T["line2"], w=2.4)
        hl(end, c=T["line2"], w=2.4)
    elif tpl == "story":
        for r in range(int((h - 440) // 445) + 1):
            for c in range(2):
                X, Y = 50 + c * 470, 60 + r * 445
                d.rectangle([S(X), S(Y), S(X + 430), S(Y + 280)], outline=T["line2"], width=round(2.4 * k))
                hl(Y + 325, X, X + 430)
                hl(Y + 370, X, X + 300)
    hi = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dh = ImageDraw.Draw(hi)
    S = lambda v: v * k  # from here on, world -> picture (canvas boards are shifted by their crop)
    STICKY = ["#f2d46b", "#c6f432", "#ff9ab0", "#8fc1ff"]
    for s in strokes:
        if s.get("k") == "t":  # a sticky note or a text box
            from PIL import ImageFont
            fs = max(8, round(s.get("fs", 22) * k))
            try:
                font = ImageFont.truetype("georgia.ttf", fs)
            except Exception:
                try:
                    font = ImageFont.load_default(size=fs)
                except Exception:
                    font = ImageFont.load_default()
            x0, y0 = (s["x"] - ox) * k, (s["y"] - oy) * k
            pad = (16 if s.get("sticky") else 4) * k
            if s.get("sticky"):
                d.rectangle([x0, y0, x0 + s["w"] * k, y0 + s["h"] * k], fill=STICKY[s.get("c", 0) % 4])
            col = "#1d1d1b" if s.get("sticky") else T["ink"][s.get("c", 0) % 4]
            lines, maxw = [], s["w"] * k - 2 * pad
            for para in (s.get("text") or "").split("\n"):
                line = ""
                for word in para.split():
                    t = (line + " " + word).strip()
                    if d.textlength(t, font=font) > maxw and line:
                        lines.append(line)
                        line = word
                    else:
                        line = t
                lines.append(line)
            for i, ln in enumerate(lines):
                d.text((x0 + pad, y0 + pad + i * fs * 1.3), ln, fill=col, font=font)
            continue
        if s.get("k") == "i":  # a picture placed on the page
            if load:
                try:
                    pic = load(s["a"]).convert("RGBA").resize((max(1, round(s["w"] * k)), max(1, round(s["h"] * k))))
                    im.paste(pic, (round((s["x"] - ox) * k), round((s["y"] - oy) * k)), pic)
                except Exception as e:
                    log("paper picture:", repr(e))
            continue
        p = s.get("p") or []
        pts = [((p[i] - ox) * k, (p[i + 1] - oy) * k, p[i + 2]) for i in range(0, len(p) - 2, 3)]
        if not pts:
            continue
        if s.get("k") == "h":
            w = (14 + s.get("w", 3) * 4) * k
            col = PAPER_HL[s.get("c", 0) % 4]
            xy = [(x, y) for x, y, _ in pts] or []
            if len(xy) > 1:
                dh.line(xy, fill=col, width=round(w), joint="curve")
            for x, y in (xy[0], xy[-1]):
                dh.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=col)
            continue
        col = T["ink"][s.get("c", 0) % 4]
        base = (1.1 + s.get("w", 3) * 0.85) * k
        for i, (x, y, pr) in enumerate(pts):
            w = base * (0.35 + 0.9 * pr)
            if i:
                x0, y0, _ = pts[i - 1]
                d.line([(x0, y0), (x, y)], fill=col, width=max(1, round(w)))
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=col)
    im = Image.alpha_composite(im.convert("RGBA"), hi).convert("RGB")
    return im


def export_paper(P, root, vault, folder):
    """Every notebook page -> <vault>/<folder>/Paper/<notebook>/page-01.png (+ a note per notebook). Returns (new pages, folder)."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nbs = (P.data or {}).get("paper", {}).get("nbs", {})
    out = os.path.join(vault, folder, "Paper")
    if not nbs:
        return 0, out
    new, used = 0, {}
    for nb in sorted(nbs.values(), key=lambda n: n.get("t", 0)):
        title = safe(nb.get("title") or "Untitled")
        used[title.lower()] = used.get(title.lower(), 0) + 1
        if used[title.lower()] > 1:  # two notebooks with the same name stay apart
            title += f" ({used[title.lower()]})"
        d = os.path.join(out, title)
        os.makedirs(d, exist_ok=True)
        names = []
        for i, pg in enumerate(nb.get("pages", [])):
            name = f"page-{i + 1:02}.png"
            names.append(name)
            enc = os.path.join(root, "data", "paper", re.sub(r"[^0-9a-f]", "", pg["id"]) + ".enc")
            png = os.path.join(d, name)
            stamp = os.path.getmtime(enc) if os.path.exists(enc) else nb.get("t", 0)
            if os.path.exists(png) and os.path.getmtime(png) >= stamp:
                continue
            strokes = []
            if os.path.exists(enc):
                raw = open(enc, "rb").read()
                strokes = json.loads(AESGCM(P.key).decrypt(raw[:12], raw[12:], b"feather-paper")).get("strokes", [])
            def load(aid):
                from PIL import Image
                import io
                raw = open(os.path.join(root, "data", "paper", "a" + re.sub(r"[^0-9a-f]", "", aid) + ".enc"), "rb").read()
                return Image.open(io.BytesIO(AESGCM(P.key).decrypt(raw[:12], raw[12:], b"feather-asset")))
            render_paper(strokes, pg.get("tpl", "lined"), nb.get("theme", "dark"), h=pg.get("h", 1400), bg=pg.get("bg"), kind=nb.get("kind", "pages"), load=load).save(png, optimize=True)
            if strokes:
                new += 1
        if nb.get("kind") == "flip" and names:  # a flipbook also becomes one animated GIF
            gif = os.path.join(d, "animation.gif")
            if new or not os.path.exists(gif) or any(os.path.getmtime(os.path.join(d, n)) > os.path.getmtime(gif) for n in names if os.path.exists(os.path.join(d, n))):
                from PIL import Image
                frames = [Image.open(os.path.join(d, n)).convert("RGB").resize((500, round(500 * Image.open(os.path.join(d, n)).height / Image.open(os.path.join(d, n)).width))) for n in names]
                frames[0].save(gif, save_all=True, append_images=frames[1:], duration=83, loop=0, optimize=True)
        for f in os.listdir(d):  # pages you deleted
            if re.fullmatch(r"page-\d+\.png", f) and f not in names:
                os.remove(os.path.join(d, f))
        rel = "/".join([folder, "Paper", title])
        body = f"# {nb.get('title')}\n\nHandwritten in Feather · {len(names)} {'frame' if nb.get('kind') == 'flip' else 'page'}{'s' if len(names) != 1 else ''} · synced {time.strftime('%b %d, %Y %H:%M')}\n\n"
        texts = (P.data or {}).get("paper", {}).get("text", {})
        parts = [f"![[{rel}/animation.gif]]"] if nb.get("kind") == "flip" else []
        for n, pg in zip(names, nb.get("pages", [])):
            t = (texts.get(pg["id"]) or "").strip()
            parts.append(f"![[{rel}/{n}]]" + ("\n\n> [!quote]- Handwriting (read by Windows)\n" + "\n".join("> " + ln for ln in t.splitlines()) if t else ""))
        body += "\n\n".join(parts) + "\n"
        open(os.path.join(out, title + ".md"), "w", encoding="utf-8").write(body)
    return new, out


def save_paper_to_pc(src):
    """The popup's pen button: copy the page pictures to Pictures\\Feather Paper and open it."""
    dst = os.path.join(os.path.expanduser("~"), "Pictures", "Feather Paper")
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src):
        a = os.path.join(src, name)
        if os.path.isdir(a):
            shutil.copytree(a, os.path.join(dst, name), dirs_exist_ok=True)
    os.startfile(dst)
    return "saved ✓ folder opened"


def notes_dir(cfg, vault, folder):
    """Feather's own notes folder in Obsidian (vault\\Feather\\Notes). Only what's in here goes onto the stick:
    .md files as notes, PDFs and .txt files as Documents. Nothing else in the vault (daily notes, Archie's World) is copied."""
    d = cfg.get("notes_folder") or os.path.join(vault, folder, "Notes")
    os.makedirs(d, exist_ok=True)
    return d


def import_notes(src, max_kb, cap_mb=40):
    notes, total = {}, 0
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src).replace("\\", "/")
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for fn in files:
            if not fn.endswith(".md"):
                continue
            p = os.path.join(root, fn)
            sz = os.path.getsize(p)
            if sz > max_kb * 1024 or total + sz > cap_mb * 1e6:
                continue
            key = (fn if rel == "." else f"{rel}/{fn}")
            notes[key] = {"text": open(p, encoding="utf-8", errors="ignore").read(), "mtime": int(os.path.getmtime(p))}
            total += sz
    return notes


# ---------- log (sync\\sync.log) ----------
LOG = os.path.join(HERE, "sync.log")


def log(*a):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + " ".join(str(x) for x in a) + "\n")
    except OSError:
        pass


# ---------- the model engine (llama.cpp) on the stick ----------
def pick_engine(assets):
    """The Windows CPU build of llama.cpp, whatever this release calls it."""
    for pref in ("cpu-x64", "avx2-x64", "x64"):
        for a in assets:
            n = a["name"].lower()
            if n.endswith(".zip") and "win" in n and pref in n and not any(b in n for b in ("cuda", "vulkan", "hip", "sycl", "opencl", "kompute", "arm64")):
                return a
    return None


VC_DLLS = ("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll", "msvcp140_1.dll", "msvcp140_2.dll",
           "msvcp140_atomic_wait.dll", "msvcp140_codecvt_ids.dll", "concrt140.dll", "vcomp140.dll")


def ensure_runtime(llm):
    """The Microsoft C++ runtime the engine needs. Laptops without it show 'VCRUNTIME140.dll was not found',
    so a copy from this PC goes next to the engine (Microsoft allows shipping these app-locally)."""
    sysdir = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32")
    n = 0
    for f in VC_DLLS:
        a, b = os.path.join(BASE, "runtime", f), os.path.join(llm, f)  # the copy that ships with Feather
        if not os.path.exists(a):
            a = os.path.join(sysdir, f)
        if os.path.exists(a) and not os.path.exists(b):
            shutil.copy2(a, b)
            n += 1
    if n:
        log("runtime: copied", n, "Microsoft C++ files to", llm)
    return n


def ensure_engine(root):
    llm = os.path.join(root, "llm")
    if os.path.exists(os.path.join(llm, "llama-server.exe")):
        return "Model runtime added" if ensure_runtime(llm) else None
    os.makedirs(llm, exist_ok=True)
    req = urllib.request.Request("https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=40",
                                 headers={"User-Agent": "Feather", "Accept": "application/vnd.github+json"})
    rels = json.load(urllib.request.urlopen(req, timeout=30))
    rel, a = {}, None
    for r in rels:  # newest release that actually has the Windows CPU build (some are placeholders)
        if r.get("draft"):
            continue
        a = pick_engine(r.get("assets", []))
        if a:
            rel = r
            break
    if not a:
        log("no Windows CPU llama.cpp build in the last", len(rels), "releases; newest:", rels[0].get("tag_name") if rels else "-",
            "assets:", ", ".join(x["name"] for x in (rels[0].get("assets", []) if rels else [])))
        return "Model engine not found (details in sync\\sync.log)"
    tmp = os.path.join(tempfile.gettempdir(), "archie-llama.zip")
    log("downloading", a["name"])
    with urllib.request.urlopen(urllib.request.Request(a["browser_download_url"], headers={"User-Agent": "Feather"}), timeout=120) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)
    with zipfile.ZipFile(tmp) as z:
        for m in z.infolist():
            if m.is_dir():
                continue
            out = os.path.join(llm, os.path.basename(m.filename))  # flatten any subfolder
            with z.open(m) as src, open(out, "wb") as dst:
                shutil.copyfileobj(src, dst)
    os.remove(tmp)
    ok = os.path.exists(os.path.join(llm, "llama-server.exe"))
    ensure_runtime(llm)
    log("engine", "installed" if ok else "zip had no llama-server.exe", rel.get("tag_name"))
    return "Model engine installed (" + rel.get("tag_name", "") + ")" if ok else "Model engine download didn't contain llama-server.exe"


# ---------- readings: PDFs and text files from vault\\Feather\\Notes (text for study, the file itself encrypted) ----------
READ_EXT = (".pdf", ".txt", ".epub")
BOOK_V = 1  # bump to re-read every book with a newer parser
READ_CACHE = os.path.join(HERE, "cache", "readings")


def pdf_pages(path):
    try:
        from pypdf import PdfReader
    except ImportError:
        lib = os.path.join(HERE, "lib")
        sys.path.insert(0, lib)
        try:
            from pypdf import PdfReader
        except ImportError:
            py = sys.executable.replace("pythonw.exe", "python.exe")
            subprocess.run([py, "-m", "pip", "install", "pypdf", "--target", lib, "--quiet"], creationflags=0x08000000, timeout=600, check=True)
            from pypdf import PdfReader
    r = PdfReader(path)
    out = []
    for pg in r.pages:
        try:
            out.append(pg.extract_text() or "")
        except Exception:
            out.append("")
    return out


def reading_book(path, rid, stamp):
    """The book in chapters (books.py), cached on this PC so each file is only read once."""
    import books
    os.makedirs(READ_CACHE, exist_ok=True)
    cache = os.path.join(READ_CACHE, rid + ".book.json")
    try:
        c = json.load(open(cache, encoding="utf-8"))
        if c.get("stamp") == stamp and c.get("v") == BOOK_V:
            return c["book"]
    except (OSError, ValueError, KeyError):
        pass
    book = books.parse(path, pdf_pages)
    json.dump({"stamp": stamp, "v": BOOK_V, "book": book}, open(cache, "w", encoding="utf-8"))
    return book


def sync_readings(P, root, folder, cfg, max_file_mb=60, max_total_mb=1500):
    """PDFs, plain-text books and EPUBs from the notes folder go onto the stick, encrypted:
    <id>.book.enc  the whole book in chapters, for the reader, search, Ask and exams
    <id>.enc       the original PDF, for the PDF viewer
    Only the opening of each book goes into the main store, so it stays small and quick to save."""
    import hashlib, books
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    out = os.path.join(P.data_dir, "readings")
    os.makedirs(out, exist_ok=True)
    old = P.data.get("readings", {})
    new, total, n_new = {}, 0, 0

    def put(dest, blob_plain, aad):
        nonce = os.urandom(12)
        with open(dest + ".tmp", "wb") as f:
            f.write(nonce + AESGCM(P.key).encrypt(nonce, blob_plain, aad))
        os.replace(dest + ".tmp", dest)

    for r, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for fn in sorted(files):
            if not fn.lower().endswith(READ_EXT):
                continue
            path = os.path.join(r, fn)
            rel = os.path.relpath(path, folder).replace("\\", "/")
            rid = hashlib.sha1(rel.encode()).hexdigest()[:12]
            size, mtime = os.path.getsize(path), int(os.path.getmtime(path))
            stamp = f"{size}:{mtime}:{BOOK_V}"
            try:
                book = reading_book(path, rid, stamp)
            except Exception as e:
                log("reading skipped", rel, repr(e))
                continue
            kind = book["kind"]
            flat = books.flat(book)
            P.data["notes"]["Readings/" + rel] = {"text": flat[:60000], "mtime": mtime, "reading": rid, "book": True}
            fresh = old.get(rid, {}).get("stamp") != stamp
            bfile = os.path.join(out, rid + ".book.enc")
            if fresh or not os.path.exists(bfile):
                put(bfile, json.dumps(book, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), b"feather-book")
                n_new += 1
            has_file = kind == "pdf" and size <= max_file_mb * 1024 ** 2 and total + size <= max_total_mb * 1024 ** 2
            enc = os.path.join(out, rid + ".enc")
            if has_file:
                total += size
                if fresh or not os.path.exists(enc):
                    put(enc, open(path, "rb").read(), b"feather-file")
            new[rid] = {"id": rid, "name": book.get("title") if kind != "pdf" else os.path.splitext(fn)[0], "author": book.get("author", ""), "rel": rel,
                        "kind": kind, "size": size, "pages": len(book["ch"]), "chars": len(flat), "stamp": stamp, "file": has_file, "t": mtime}
    for fn in os.listdir(out):  # files taken out of the folder
        rid = fn.split(".")[0]
        if fn.endswith(".enc") and rid not in new or (fn.endswith(".enc") and fn == rid + ".enc" and not new.get(rid, {}).get("file")):
            os.remove(os.path.join(out, fn))
    P.data["readings"] = new
    return len(new), n_new


# ---------- deadlines and calendar from Archie (shown on the start screen) ----------
CAL_KINDS = ("exam", "test", "quiz", "due", "lab", "class", "event")  # Archie's calendar kinds; "deadline" lives in deadlines.txt


def _dl_id(date, what):
    import hashlib
    return "dl-" + hashlib.sha1(f"{date}|{what}".encode()).hexdigest()[:10]


def archie_deadlines(archie):
    """Archie's countdowns (deadlines.txt) and calendar events (calendar.json) for the next 60 days,
    each with an id so Feather can change it and send the change back."""
    import datetime
    out, today = [], datetime.date.today()
    try:
        for line in open(os.path.join(archie, "deadlines.txt"), encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "|" not in line:
                continue
            d, what = [x.strip() for x in line.split("|", 1)]
            try:
                if datetime.date.fromisoformat(d) >= today:
                    out.append({"id": _dl_id(d, what), "src": "dl", "date": d, "what": what, "kind": "deadline", "orig": {"date": d, "what": what}})
            except ValueError:
                continue
    except OSError:
        pass
    try:
        for e in json.load(open(os.path.join(archie, "calendar.json"), encoding="utf-8")).get("events", []):
            try:
                d = datetime.date.fromisoformat(e.get("date", ""))
            except ValueError:
                continue
            if e.get("repeat") == "weekly" and d < today:  # a weekly class: its next time
                d = d + datetime.timedelta(days=((today - d).days + 6) // 7 * 7)
                if e.get("until") and d > datetime.date.fromisoformat(e["until"]):
                    continue
            if today <= d <= today + datetime.timedelta(days=60):
                out.append({"id": e.get("id"), "src": "cal", "date": d.isoformat(), "what": e.get("title", ""), "kind": e.get("kind", "event"),
                            "time": e.get("time"), "repeat": e.get("repeat")})
    except (OSError, ValueError):
        pass
    return sorted(out, key=lambda x: (x["date"], x.get("time") or "99"))


def apply_calendar_changes(archie, changes):
    """Feather's edits (made on a laptop) go into Archie's own files, the way Archie writes them."""
    import uuid
    if not changes:
        return 0
    cal_p, dl_p = os.path.join(archie, "calendar.json"), os.path.join(archie, "deadlines.txt")
    try:
        events = json.load(open(cal_p, encoding="utf-8")).get("events", [])
    except (OSError, ValueError):
        events = []
    try:
        lines = open(dl_p, encoding="utf-8").read().split("\n")
    except OSError:
        lines = ["# DEADLINES - Archie counts down to these in the morning brief.", "# Format:  YYYY-MM-DD | what it is", ""]
    n = 0
    for c in changes:
        op, it = c.get("op"), c.get("item", {})
        old_ev = None
        if op in ("edit", "del"):
            if it.get("src") in ("cal", "calt"):  # calt: an event Feather only knows by its title and date
                o = it.get("orig") or {}
                same = (lambda e: e.get("id") == it.get("id")) if it.get("src") == "cal" else (lambda e: e.get("title") == o.get("what") and e.get("date") == o.get("date"))
                old_ev = next((e for e in events if same(e)), None)
                events = [e for e in events if e is not old_ev]
            elif it.get("src") == "dl":
                o = it.get("orig") or {}
                for k, ln in enumerate(lines):
                    if "|" in ln and not ln.strip().startswith("#"):
                        d, w = [x.strip() for x in ln.split("|", 1)]
                        if d == o.get("date") and w == o.get("what"):
                            del lines[k]
                            break
        if op in ("add", "edit"):
            what = " ".join(str(it.get("what", "")).split())[:200]
            date = str(it.get("date", ""))[:10]
            if not what or not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
                continue
            if it.get("kind") == "deadline":
                lines.append(f"{date} | {what}")
            else:
                ev = dict(old_ev or {"id": uuid.uuid4().hex[:10], "notes": "", "repeat": None, "until": None})
                ev.update({"title": what, "date": date, "time": it.get("time") or None, "kind": it.get("kind") if it.get("kind") in CAL_KINDS else "event"})
                events.append(ev)
        n += 1
    tmp = cal_p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"events": sorted(events, key=lambda e: (e["date"], e.get("time") or ""))}, f, indent=1, ensure_ascii=False)
    os.replace(tmp, cal_p)
    while len(lines) > 1 and lines[-1] == "" and lines[-2] == "":
        lines.pop()
    with open(dl_p + ".tmp", "w", encoding="utf-8") as f:
        f.write("\n".join(lines).rstrip("\n") + "\n")
    os.replace(dl_p + ".tmp", dl_p)
    log("calendar:", n, "changes from Feather written to Archie")
    return n


# ---------- World snapshot (news + governments from Archie World) ----------
def find_archie(cfg):
    d = cfg.get("archie_dir")
    if d and os.path.exists(os.path.join(d, "World", "world.db")):
        return d
    for L in string.ascii_uppercase[2:]:
        r = f"{L}:\\"
        if not os.path.exists(r) or ctypes.windll.kernel32.GetDriveTypeW(r) != 3:  # fixed disks only
            continue
        try:
            subs = [r] + [os.path.join(r, x) for x in os.listdir(r)]
        except OSError:
            continue
        for s in subs:
            if os.path.exists(os.path.join(s, "archie_world.py")) and os.path.exists(os.path.join(s, "World", "world.db")):
                cfg["archie_dir"] = s
                json.dump(cfg, open(SETTINGS, "w"), indent=1)
                return s
    return None


def world_snapshot(archie, dest):
    W_ = os.path.join(archie, "World")
    db = sqlite3.connect(f"file:{os.path.join(W_, 'world.db')}?mode=ro", uri=True, timeout=15)
    db.row_factory = sqlite3.Row

    def kv(k):
        r = db.execute("SELECT value FROM kv WHERE key=?", (k,)).fetchone()
        try:
            return json.loads(r[0]) if r else None
        except ValueError:
            return None
    stories = []
    for c in db.execute("SELECT * FROM clusters WHERE last>? ORDER BY n_sources DESC, last DESC LIMIT 300", (time.time() - 72 * 3600,)):
        its = db.execute("SELECT source,title,title_en,summary,url,published FROM items WHERE cluster=? ORDER BY published DESC LIMIT 8", (c["id"],)).fetchall()
        seen, items = set(), []
        for i in its:
            if i["source"] in seen:
                continue
            seen.add(i["source"])
            items.append({"source": i["source"], "title": i["title_en"] or i["title"], "summary": (i["summary"] or "")[:300], "url": i["url"], "t": i["published"]})
        stories.append({"title": c["title"], "place": c["place"], "cc": c["cc"], "region": c["region"], "etype": c["etype"], "topic": c["topic"],
                        "first": c["first"], "last": c["last"], "n": max(c["n_sources"] or 1, len(items)), "items": items})
    live, cia, us = kv("govs_live") or {}, kv("cia_leaders") or {}, kv("us_cabinet") or {}
    db.close()
    govs = []
    try:
        static = json.load(open(os.path.join(W_, "web", "data", "govs.json"), encoding="utf-8"))
    except Exception:
        static = []
    for g in static:
        iso, L = g.get("iso2"), live.get(g.get("iso2")) or {}
        cab = us if iso == "US" else cia.get(g.get("gec")) or {}
        name = g.get("name") if (g.get("name") or "none").lower() != "none" else (g.get("long") or iso)
        govs.append({"iso2": iso, "name": name, "long": g.get("long"), "label": g.get("label"), "capital": g.get("capital"),
                     "intro": (g.get("intro") or "")[:1800], "hos": L.get("hos") or [], "hog": L.get("hog") or [],
                     "hosOffice": L.get("hosOffice"), "hogOffice": L.get("hogOffice"),
                     "cabinet": [{"label": gr.get("label", ""), "people": [{"title": p.get("title"), "name": p.get("name")} for p in (gr.get("people") or [])[:80]]}
                                 for gr in (cab.get("groups") or [])],
                     "cabinet_source": cab.get("source"), "cabinet_updated": cab.get("updated")})
    try:
        rss = json.load(open(os.path.join(W_, "sources.json"), encoding="utf-8")).get("rss") or []
    except Exception:
        rss = []
    snap = {"at": int(time.time()), "stories": stories, "govs": govs,
            "sources": [{"name": r.get("name"), "url": r.get("url")} for r in rss if r.get("url") and not r.get("off")]}
    os.makedirs(dest, exist_ok=True)
    tmp = os.path.join(dest, "snapshot.tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump(snap, f)
    os.replace(tmp, os.path.join(dest, "snapshot.json.gz"))
    flags = os.path.join(W_, "web", "flags")
    if os.path.isdir(flags) and not os.path.isdir(os.path.join(dest, "flags")):
        shutil.copytree(flags, os.path.join(dest, "flags"))
    return len(stories), len(govs)


def update_app(root):
    """Keep the app on the stick the same as D:\\Feather\\app, so updates land just by plugging in."""
    src, dst = os.path.join(BASE, "app"), os.path.join(root, "app")
    changed, want = 0, set()
    for r, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for fn in files:
            a = os.path.join(r, fn)
            rel = os.path.relpath(a, src)
            want.add(os.path.normcase(rel))
            b = os.path.join(dst, rel)
            if not os.path.exists(b) or os.path.getsize(a) != os.path.getsize(b) or os.path.getmtime(a) > os.path.getmtime(b) + 2:
                os.makedirs(os.path.dirname(b), exist_ok=True)
                shutil.copy2(a, b)
                changed += 1
    for r, dirs, files in os.walk(dst):  # files the PC copy no longer has (old names like pocket.py)
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for fn in files:
            b = os.path.join(r, fn)
            if os.path.normcase(os.path.relpath(b, dst)) not in want:
                try:
                    os.remove(b)
                except OSError:
                    pass
    top = os.path.dirname(root)  # the top of the stick: one clear start file, named Feather
    name = os.path.basename(root)
    start = f'@echo off\r\ncd /d "%~dp0{name}"\r\nstart "" python\\pythonw.exe app\\feather.py\r\n'
    for fn, body in [(os.path.join(top, "Start Feather.bat"), start),
                     (os.path.join(root, "Feather Demo.bat"), '@echo off\r\ncd /d "%~dp0"\r\nstart "" python\\pythonw.exe app\\feather.py --demo\r\n')]:
        try:
            old = open(fn, newline="").read() if os.path.exists(fn) else None
        except OSError:
            old = None
        if old != body:
            with open(fn, "w", newline="") as f:
                f.write(body)
            changed += 1
    for old in [os.path.join(top, "Start Archie Pocket.bat"), os.path.join(root, "Laptop Autostart.bat")]:
        if os.path.exists(old):
            os.remove(old)
    a, b = os.path.join(BASE, "sync", "Autostart on this laptop.bat"), os.path.join(root, "Autostart on this laptop.bat")
    if os.path.exists(a) and (not os.path.exists(b) or os.path.getmtime(a) > os.path.getmtime(b) + 2):
        shutil.copy2(a, b)
        changed += 1
    return changed


# ---------- the stick's Vault (copied from Archie's Vault on this PC) ----------
DEVDOCS = ("python", "javascript", "html", "css", "c", "cpp", "godot", "git", "numpy", "pandas", "bash", "typescript",
           "sqlite", "node", "dom", "http", "markdown", "pygame", "lua", "rust")
VAULT_FAMILIES = ["wikipedia_en_all_mini", "wiktionary_en-simple_all_nopic", "theworldfactbook_en_all",
                  "libretexts.org_en_math", "libretexts.org_en_phys", "libretexts.org_en_eng", "libretexts.org_en_stats",
                  "wikipedia_en_computer_maxi", "opendatastructures.org_en_all", "freecodecamp_en_all",
                  "robotics.stackexchange.com_en_all", "arduino.stackexchange.com_en_all", "raspberrypi.stackexchange.com_en_all",
                  "wikipedia_en_medicine_nopic", "nhs.uk_en_medicines", "wikem_en_all_nopic"] + ["devdocs_en_" + d for d in DEVDOCS]


def vault_source(archie):
    try:
        d = open(os.path.join(archie, "Vault", "vault-folder.txt"), encoding="utf-8").read().strip()
        if os.path.isdir(os.path.join(d, "zim")):
            return os.path.join(d, "zim")
    except OSError:
        pass
    return os.path.join(archie, "Vault", "zim")


def vault_pick(src, families):
    """Newest file of each family on the list: {family: (filename, size)}."""
    best = {}
    try:
        names = os.listdir(src)
    except OSError:
        return {}
    for fn in names:
        if not fn.endswith(".zim"):
            continue
        fam = fn[:-4].rsplit("_", 1)[0]
        if fam in families and (fam not in best or fn > best[fam][0]):
            best[fam] = (fn, os.path.getsize(os.path.join(src, fn)))
    return best


def drive_fs(drive):
    buf = ctypes.create_unicode_buffer(32)
    ctypes.windll.kernel32.GetVolumeInformationW(f"{drive}:\\", None, 0, None, None, None, buf, 32)
    return buf.value


def free_bytes(path):
    free = ctypes.c_ulonglong(0)
    ctypes.windll.kernel32.GetDiskFreeSpaceExW(path, None, None, ctypes.byref(free))
    return free.value


def ensure_wheels(root):
    """Pure-Python packages that ship with Feather (D:\\Feather\\runtime\\wheels), e.g. the math engine."""
    lib, n = os.path.join(root, "lib"), 0
    wd = os.path.join(BASE, "runtime", "wheels")
    for w in sorted(os.listdir(wd)) if os.path.isdir(wd) else []:
        if not w.endswith(".whl"):
            continue
        pkg = w.split("-")[0]
        if not os.path.isdir(os.path.join(lib, pkg)):
            zipfile.ZipFile(os.path.join(wd, w)).extractall(lib)
            n += 1
    if n:
        log("wheels added:", n)
    py = os.path.join(root, "python", "python.exe")  # pre-compile with the stick's own Python, so the first use on a laptop is quick
    mark = os.path.join(lib, ".compiled")
    if os.path.exists(py) and (n or not os.path.exists(mark)):
        try:
            subprocess.run([py, "-m", "compileall", "-q", "-j", "0", os.path.join(lib, "sympy"), os.path.join(lib, "mpmath")],
                           creationflags=0x08000000, timeout=1800, cwd=root)
            open(mark, "w").write(time.strftime("%Y-%m-%d %H:%M"))
            log("math engine pre-compiled")
            n = n or 1
        except Exception as e:
            log("compile failed:", repr(e))
    return n


def ensure_libzim(root, archie):
    """The .zim reader for the stick's Python 3.12: from Archie's folder if it has the wheel, else pip."""
    lib = os.path.join(root, "lib")
    if os.path.isdir(os.path.join(lib, "libzim")):
        return False
    whl = sorted(f for f in os.listdir(archie) if f.startswith("libzim-") and "cp312" in f and f.endswith("win_amd64.whl")) if archie else []
    if whl:
        zipfile.ZipFile(os.path.join(archie, whl[-1])).extractall(lib)
    else:
        subprocess.run([sys.executable.replace("pythonw.exe", "python.exe"), "-m", "pip", "install", "libzim", "--target", lib, "--platform", "win_amd64",
                        "--python-version", "3.12", "--implementation", "cp", "--only-binary=:all:", "--upgrade", "--quiet"],
                       creationflags=0x08000000, timeout=600, check=True)
    log("libzim added to the stick")
    return True


def copy_window(jobs, total):
    """Copy [(src, dst, size)] with a small progress window. Resumable: partial files are kept as .part."""
    import tkinter as tk
    st = {"done": 0, "cur": "", "stop": False, "err": None, "copied": 0, "fin": False}

    def work():
        try:
            for src, dst, size in jobs:
                if st["stop"]:
                    break
                st["cur"] = os.path.basename(dst)
                part = dst + ".part"
                have = os.path.getsize(part) if os.path.exists(part) else 0
                if have > size:
                    os.remove(part)
                    have = 0
                st["done"] += have
                with open(src, "rb") as f, open(part, "ab") as g:
                    f.seek(have)
                    while not st["stop"]:
                        b = f.read(8 << 20)
                        if not b:
                            break
                        g.write(b)
                        st["done"] += len(b)
                if not st["stop"]:
                    os.replace(part, dst)
                    st["copied"] += 1
        except Exception as e:
            st["err"] = e
            log("vault copy failed:", repr(e))
        st["fin"] = True

    w = tk.Tk()
    w.overrideredirect(True)
    w.attributes("-topmost", True)
    w.configure(bg="#c6f432")
    inner = tk.Frame(w, bg="#0c0d0b")
    inner.pack(padx=1, pady=1)
    tk.Label(inner, text="Feather · copying the Vault onto the stick", fg="#8e9686", bg="#0c0d0b", font=("Consolas", 10)).pack(anchor="w", padx=18, pady=(14, 4))
    lab = tk.Label(inner, text="", fg="#e8ecdf", bg="#0c0d0b", font=("Consolas", 11, "bold"), anchor="w", width=46)
    lab.pack(fill="x", padx=18)
    cv = tk.Canvas(inner, width=380, height=6, bg="#262a22", highlightthickness=0)
    cv.pack(padx=18, pady=10)
    bar = cv.create_rectangle(0, 0, 0, 6, fill="#c6f432", width=0)
    sub = tk.Label(inner, text="", fg="#a7af9e", bg="#0c0d0b", font=("Consolas", 9), anchor="w")
    sub.pack(fill="x", padx=18)

    def later():
        st["stop"] = True
        btn.configure(text="stopping…", state="disabled")
    btn = tk.Button(inner, text="finish later", command=later, bg="#0c0d0b", fg="#c9d0bf", relief="flat", font=("Consolas", 10), padx=12, pady=4)
    btn.pack(anchor="w", padx=18, pady=(8, 14))
    w.update_idletasks()
    ww, hh = w.winfo_reqwidth(), w.winfo_reqheight()
    w.geometry(f"+{w.winfo_screenwidth() - ww - 24}+{w.winfo_screenheight() - hh - 64}")
    t0 = time.time()

    def tick():
        frac = min(1, st["done"] / max(1, total))
        cv.coords(bar, 0, 0, 380 * frac, 6)
        el = time.time() - t0
        rate = st["done"] / el if el > 3 else 0
        eta = f" · about {int((total - st['done']) / rate / 60) + 1} min left" if rate > 1e6 else ""
        lab.configure(text=f"{st['done'] / 1e9:.1f} of {total / 1e9:.1f} GB{eta}")
        sub.configure(text=st["cur"][:52])
        if st["fin"]:
            w.destroy()
            return
        w.after(400, tick)
    threading.Thread(target=work, daemon=True).start()
    tick()
    w.mainloop()
    return st


def sync_vault(drive, root, archie, cfg):
    src = vault_source(archie)
    want = vault_pick(src, cfg.get("vault_families") or VAULT_FAMILIES)
    if not want:
        return None
    vdir = os.path.join(root, "vault")
    os.makedirs(vdir, exist_ok=True)
    keep = {fn for fn, _ in want.values()}
    for fn in os.listdir(vdir):  # older versions and things taken off the list
        if fn.endswith(".zim") and fn not in keep or (fn.endswith(".zim.part") and fn[:-5] not in keep):
            os.remove(os.path.join(vdir, fn))
    fat = drive_fs(drive).upper().startswith("FAT")
    jobs, skipped_fat = [], []
    for fn, size in sorted(want.values(), key=lambda x: x[1]):  # small ones first: useful sooner
        dst = os.path.join(vdir, fn)
        if os.path.exists(dst) and os.path.getsize(dst) == size:
            continue
        if fat and size >= 4 * 1024 ** 3:
            skipped_fat.append(fn)
            continue
        jobs.append((os.path.join(src, fn), dst, size))
    msgs = []
    if skipped_fat:
        msgs.append(f"Stick is FAT32: can't hold {len(skipped_fat)} big file(s) (Wikipedia). Ask Claude about reformatting.")
        log("FAT32, skipped:", skipped_fat)
    if not jobs:
        return " · ".join(msgs) or None
    need = sum(sz - (os.path.getsize(d + ".part") if os.path.exists(d + ".part") else 0) for _, d, sz in jobs)
    free = free_bytes(root) - 300 * 1024 ** 2
    while jobs and need > free:  # not enough room: leave the biggest off, say so
        big = max(jobs, key=lambda j: j[2])
        jobs.remove(big)
        need -= big[2]
        msgs.append(f"Not enough room for {os.path.basename(big[1])}")
    if jobs:
        st = copy_window(jobs, sum(j[2] for j in jobs))
        if st["err"]:
            msgs.insert(0, "Vault copy stopped (unplugged?): it resumes next time")
        elif st["stop"]:
            msgs.insert(0, f"Vault: {st['copied']} of {len(jobs)} copied, the rest next time")
        else:
            msgs.insert(0, f"Vault: {len(jobs)} libraries copied")
    return " · ".join(msgs)


# ---------- banner pictures (Archie's Banners folder, shrunk for the stick) ----------
BANNER_EXT = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


def sync_banners(root, archie):
    src = os.path.join(archie, "Banners")
    if not os.path.isdir(src):
        return 0
    dst = os.path.join(root, "banners")
    os.makedirs(dst, exist_ok=True)
    try:
        from PIL import Image
    except ImportError:
        Image = None
    want, n = set(), 0
    for fn in os.listdir(src):
        if not fn.lower().endswith(BANNER_EXT):
            continue
        out = os.path.splitext(fn)[0] + ".jpg"
        want.add(out)
        a, b = os.path.join(src, fn), os.path.join(dst, out)
        if os.path.exists(b) and os.path.getmtime(b) >= os.path.getmtime(a):
            continue
        try:
            if Image:
                with Image.open(a) as im:
                    im = im.convert("RGB")
                    if im.width > 1800:
                        im = im.resize((1800, round(im.height * 1800 / im.width)), Image.LANCZOS)
                    im.save(b, "JPEG", quality=82, optimize=True)
            elif fn.lower().endswith((".jpg", ".jpeg")):
                shutil.copy2(a, b)
            else:
                continue
            n += 1
        except Exception as e:
            log("banner skipped", fn, repr(e))
    for fn in os.listdir(dst):  # pictures removed from the folder go too
        if fn.endswith(".jpg") and fn not in want:
            os.remove(os.path.join(dst, fn))
    try:  # where to aim the crop, keyed by the stick's file names
        focus = json.load(open(os.path.join(src, "banners.json"), encoding="utf-8"))
        json.dump({os.path.splitext(k)[0].lower() + ".jpg": v for k, v in focus.items()}, open(os.path.join(dst, "banners.json"), "w"))
    except (OSError, ValueError):
        pass
    if n:
        log("banners:", n, "pictures copied")
    return n


# ---------- the sync ----------
def stick_root(drive):
    """The Feather folder on a stick. Old sticks (ArchiePocket) are renamed to Feather the first time they sync."""
    new, old = f"{drive}:\\Feather", f"{drive}:\\ArchiePocket"
    if os.path.isdir(old) and not os.path.exists(new):
        try:
            os.rename(old, new)
            log("renamed", old, "→", new)
        except OSError as e:  # something on the stick is still open: try again next time
            log("rename skipped:", repr(e))
            return old
    return new if os.path.isdir(new) else old


def export_folder(cfg, vault):
    """Feather's folder inside Obsidian. The old 'Pocket' folder becomes 'Feather' once."""
    name = cfg.get("export_folder") or "Feather"
    if name == "Pocket":
        a, b = os.path.join(vault, "Pocket"), os.path.join(vault, "Feather")
        try:
            if os.path.isdir(a) and not os.path.exists(b):
                os.rename(a, b)
            if os.path.isdir(b) or not os.path.isdir(a):
                name = "Feather"
                cfg["export_folder"] = name
                json.dump(cfg, open(SETTINGS, "w"), indent=2)
        except OSError as e:
            log("obsidian rename skipped:", repr(e))
    return name


def backup(P, root, keep=10):
    """Copy the stick's encrypted files to D:\\Feather\\backups\\<stick>\\<time>. Still encrypted: useless without the password.
    Keeps the last `keep` plus the newest one from each month."""
    sid = P.meta["id"]
    dest_root = os.path.join(BASE, "backups", sid)
    stamp = time.strftime("%Y-%m-%d %H%M%S")
    dest = os.path.join(dest_root, stamp)
    data = os.path.join(root, "data")
    os.makedirs(dest, exist_ok=True)
    for src in (P.file, P.id_file):
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dest, os.path.basename(src)))
    pdir = os.path.join(data, "paper")
    if os.path.isdir(pdir):
        os.makedirs(os.path.join(dest, "paper"), exist_ok=True)
        for fn in os.listdir(pdir):
            if fn.endswith(".enc"):
                shutil.copy2(os.path.join(pdir, fn), os.path.join(dest, "paper", fn))
    snaps = sorted(d for d in os.listdir(dest_root) if os.path.isdir(os.path.join(dest_root, d)))
    months = {}
    for d in snaps:
        months[d[:7]] = d  # newest of each month
    for d in snaps[:-keep]:
        if d not in months.values():
            shutil.rmtree(os.path.join(dest_root, d), ignore_errors=True)
    return dest


def check_stick(root, key):
    """Open every encrypted file on the stick with its key. -> {"store": ok?, "ok": n, "bad": [paths relative to data]}"""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    P = store.Stick(root)
    out = {"store": P.exists and P.unlock(key=key), "ok": 0, "bad": [], "id": P.meta.get("id")}
    if out["store"]:
        out["ok"] += 1
    elif P.exists:
        out["bad"].append(os.path.relpath(P.file, P.data_dir))
    for r, dirs, files in os.walk(P.data_dir):
        dirs[:] = [d for d in dirs if d != "damaged"]  # files already set aside by a repair
        for fn in files:
            p = os.path.join(r, fn)
            aad = P._aad(p) if fn.endswith(".enc") else None
            if not aad:
                continue
            try:
                raw = open(p, "rb").read()
                AESGCM(key).decrypt(raw[:12], raw[12:], aad)
                out["ok"] += 1
            except Exception:
                out["bad"].append(os.path.relpath(p, P.data_dir))
    P.lock()
    return out


def repair_stick(root, key, sid, bad):
    """Damaged files are moved aside (data\\damaged\\<time>), then:
    the store and Paper come back from the newest backup that opens; books are rebuilt at the next sync."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    P = store.Stick(root)
    aside = os.path.join(P.data_dir, "damaged", time.strftime("%Y-%m-%d %H%M%S"))
    snaps = sorted((os.path.join(BASE, "backups", sid, d) for d in os.listdir(os.path.join(BASE, "backups", sid))), reverse=True) \
        if os.path.isdir(os.path.join(BASE, "backups", sid)) else []
    fixed, rebuilt, lost = [], [], []
    for rel in bad:
        p = os.path.join(P.data_dir, rel)
        aad = P._aad(p) or store.AAD
        os.makedirs(os.path.dirname(os.path.join(aside, rel)), exist_ok=True)
        if os.path.exists(p):
            shutil.move(p, os.path.join(aside, rel))
        if rel.replace("\\", "/").startswith("readings/"):
            rebuilt.append(rel)  # made again from your notes folder at the next sync
            continue
        for snap in snaps:
            cand = os.path.join(snap, rel)
            if not os.path.isfile(cand):
                continue
            raw = open(cand, "rb").read()
            try:
                AESGCM(key).decrypt(raw[:12], raw[12:], aad)
            except Exception:
                continue
            shutil.copy2(cand, p)
            fixed.append((rel, os.path.basename(snap)))
            break
        else:
            lost.append(rel)
    log("repair:", len(fixed), "restored,", len(rebuilt), "to rebuild,", len(lost), "not in any backup")
    return {"fixed": fixed, "rebuilt": rebuilt, "lost": lost, "aside": aside}


def sync(drive):
    inuse = os.path.join(f"{drive}:\\Feather", "data", "in-use")
    if not os.path.exists(inuse):
        inuse = os.path.join(f"{drive}:\\ArchiePocket", "data", "in-use")
    if os.path.exists(inuse) and time.time() - os.path.getmtime(inuse) < 60:
        return notify("Feather is open", ["Close the Feather window first,", "then unplug and plug it back in to sync."])
    root = stick_root(drive)
    cfg = load(SETTINGS, {})
    vault = cfg.get("obsidian_vault")
    if not vault or not os.path.isdir(vault):
        return notify("Feather sync isn't set up", ["Open 'Feather Setup' in D:\\Feather", "and pick your Obsidian vault folder."])
    P = store.Stick(root)
    if not P.exists:
        return notify("New Feather", ["Open Feather once on a laptop to make", "your password, then plug it in here again."], drive)
    paired = load(PAIRED, {})
    key = unprotect(base64.b64decode(paired[P.meta["id"]])) if P.meta["id"] in paired else None
    if not key or not P.unlock(key=key):
        pw = ask_password("Pair this PC with Feather.\nType the Feather password once; this PC remembers it (protected by your Windows login).")
        if not pw or not P.unlock(pw):
            return notify("Feather not synced", ["Wrong password or cancelled.", "Unplug and plug it in to try again."], drive)
        paired[P.meta["id"]] = base64.b64encode(protect(P.key)).decode()
        json.dump(paired, open(PAIRED, "w"))
    try:
        backup(P, root)
    except Exception as e:
        log("backup failed:", repr(e))
    ef = export_folder(cfg, vault)
    st = P.data.setdefault("settings", {})
    if cfg.get("name") and not st.get("name"):
        st["name"] = cfg["name"]
    books, cards = export(P.data, vault, ef)
    nd = notes_dir(cfg, vault, ef)
    P.data["notes"] = import_notes(nd, cfg.get("max_note_kb", 200))
    n_read = 0
    try:
        n_read, n_files = sync_readings(P, root, nd, cfg)
    except Exception as e:
        log("readings failed:", repr(e))
    archie_dir, n_cal = find_archie(cfg), 0
    if archie_dir:
        try:
            n_cal = apply_calendar_changes(archie_dir, P.data.get("calq", []))
        except Exception as e:
            log("calendar changes failed:", repr(e))
        else:
            P.data["calq"] = []
        P.data["deadlines"] = archie_deadlines(archie_dir)
    P.data.setdefault("settings", {})["synced"] = store.now()
    n_notes = len(P.data["notes"]) - n_read
    n_paper, paper_dir = 0, None
    try:
        n_paper, paper_dir = export_paper(P, root, vault, ef)
    except Exception as e:
        log("paper failed:", repr(e))
    P.save()
    P.lock()
    lines = [f"{books} book logs, {cards} flashcards, exams → Obsidian",
             *([f"✎ {n_paper} new page{'s' if n_paper != 1 else ''} → Obsidian (Paper)"] if n_paper else []), *([f"Calendar: {n_cal} change{'s' if n_cal != 1 else ''} → Archie"] if n_cal else []), f"{n_notes} notes" + (f" + {n_read} readings" if n_read else "") + " → Feather"]
    archie = find_archie(cfg)
    if archie:
        try:
            ns, ng = world_snapshot(archie, os.path.join(root, "world"))
            lines.append(f"World: {ns} stories, {ng} governments → Feather")
        except Exception as e:
            lines.append(f"World snapshot skipped ({str(e)[:60]})")
    if archie:
        try:
            if ensure_libzim(root, archie):
                lines.append("Vault reader added")
            if ensure_wheels(root):
                lines.append("Math engine added")
            vmsg = sync_vault(drive, root, archie, cfg)
            if vmsg:
                lines.append(vmsg)
        except Exception as e:
            log("vault failed:", repr(e))
            lines.append("Vault copy skipped (sync\\sync.log)")
    if archie:
        try:
            nb = sync_banners(root, archie)
            if nb:
                lines.append(f"Banner: {nb} pictures")
        except Exception as e:
            log("banners failed:", repr(e))
    try:  # Python on the stick needs the C++ runtime too (the Vault reader is C++); the app folder is always searched
        if ensure_runtime(os.path.join(root, "python")):
            lines.append("Vault runtime added")
    except Exception as e:
        log("python runtime failed:", repr(e))
    n_up = update_app(root)
    if n_up:
        lines.append(f"Feather app updated ({n_up} files)")
    try:
        eng = ensure_engine(root)
        if eng:
            lines.append(eng)
    except Exception as e:
        log("engine failed:", repr(e))
        lines.append("Model engine download failed (sync\\sync.log)")
    log("synced", drive, "|", " | ".join(lines))
    has_paper = paper_dir and os.path.isdir(paper_dir) and any(os.path.isdir(os.path.join(paper_dir, f)) for f in os.listdir(paper_dir))
    notify("Feather updated · safe to eject", lines, drive, ("✎ save drawings to PC", lambda: save_paper_to_pc(paper_dir)) if has_paper else None)


def feather_drives():
    mask = ctypes.windll.kernel32.GetLogicalDrives()
    ids = ["Feather\\data\\feather.id", "Feather\\data\\pocket.id", "ArchiePocket\\data\\pocket.id", "ArchiePocket\\data\\feather.id",
           "Feather\\pocket.id", "ArchiePocket\\pocket.id", "Feather\\feather.id"]
    return {L for i, L in enumerate(string.ascii_uppercase) if mask >> i & 1 and any(os.path.exists(f"{L}:\\{p}") for p in ids)}


def main():
    log("sync started from", HERE)
    seen = feather_drives()  # sticks already plugged in when the PC started: sync them once too
    for d in seen:
        try:
            sync(d)
        except Exception as e:
            notify("Feather sync hit a problem", [str(e)[:120]], d)
    while True:
        time.sleep(4)
        now_ = feather_drives()
        for d in now_ - seen:
            time.sleep(2)  # let Windows finish mounting it
            try:
                sync(d)
            except Exception as e:
                import traceback
                log("sync failed:", traceback.format_exc())
                notify("Feather sync hit a problem", [str(e)[:120]], d)
        seen = now_


if __name__ == "__main__":
    main()
