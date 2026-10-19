"""Feather. Runs from the USB stick: a small local server (only this laptop can reach it)
plus an app window (Edge in app mode). Close the window and everything shuts down and locks.

  feather.py           your Feather
  feather.py --demo    the same app with made-up sample data (for showing it off or recording); your data is never opened
"""
import base64, json, os, re, subprocess, sys, tempfile, threading, time, webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

APP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(APP)  # <stick>\Feather
DEMO = "--demo" in sys.argv
FEATHER_VERSION = "1.0"


def demo_pw():
    import demo
    return demo.PASSWORD
sys.path.insert(0, os.path.join(ROOT, "lib"))
sys.path.insert(0, APP)
import store, ai, world, vault, mathtutor, searchidx  # noqa: E402
import traceback  # noqa: E402

LOG = os.path.join(ROOT, "feather.log")  # errors only, never your notes or password


def log(*a):
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 512 * 1024:
            os.replace(LOG, LOG + ".old")
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + " ".join(str(x) for x in a) + "\n")
    except OSError:
        pass


sys.excepthook = lambda t, v, tb: log("CRASH", "".join(traceback.format_exception(t, v, tb)))
threading.excepthook = lambda a: log("THREAD CRASH", "".join(traceback.format_exception(a.exc_type, a.exc_value, a.exc_traceback)))
bye_at = [0.0]

P = store.Stick(ROOT, "demo" if DEMO else "data")
EXAMS = {}  # exam id -> questions (answers stay here, never sent to the page)
MATHQ = {}  # math problem id -> problem (the answer stays here until you check)
MATHPL = {}  # the placement quiz in progress
last_ping = [time.time()]
last_action = [time.time()]
IDLE_LOCK = 15 * 60
INUSE = os.path.join(P.data_dir, "in-use")


BANNERS = os.path.join(ROOT, "banners")


def banners():
    try:
        names = sorted(f for f in os.listdir(BANNERS) if f.lower().endswith(".jpg"))
    except OSError:
        names = []
    try:
        focus = json.load(open(os.path.join(BANNERS, "banners.json"), encoding="utf-8"))
    except (OSError, ValueError):
        focus = {}
    return {"pictures": names, "focus": focus}


def review_week(D):
    """Flashcard reviews for the last 7 days (oldest first) and the current daily streak."""
    rv = D.get("stats", {}).get("reviews", {})
    days = [time.strftime("%Y-%m-%d", time.localtime(time.time() - 86400 * i)) for i in range(6, -1, -1)]
    streak, i = 0, 0
    if not rv.get(days[-1]):
        i = 1  # nothing yet today: the streak still counts from yesterday
    while True:
        day = time.strftime("%Y-%m-%d", time.localtime(time.time() - 86400 * (i + streak)))
        if not rv.get(day):
            break
        streak += 1
    return {"days": [rv.get(d, 0) for d in days], "streak": streak}


def day_streak(*logs):
    """Consecutive days (ending today, or yesterday if nothing yet today) with activity in any of the logs."""
    hit = lambda day: any(lg.get(day) for lg in logs)
    day = lambda i: time.strftime("%Y-%m-%d", time.localtime(time.time() - 86400 * i))
    i = 0 if hit(day(0)) else 1
    n = 0
    while hit(day(i + n)):
        n += 1
    return n


def bump(D, key):
    lg = D.setdefault("stats", {}).setdefault(key, {})
    today = time.strftime("%Y-%m-%d")
    lg[today] = lg.get(today, 0) + 1
    for k in sorted(lg)[:-60]:  # keep two months
        del lg[k]


def today_strip(D):
    st = D.get("stats", {})
    rv, mth = st.get("reviews", {}), st.get("math", {})
    return {"study": day_streak(rv, mth), "math": day_streak(mth)}


FOLLOW = re.compile(r"(?i)\b(him|her|he|she|it|its|they|them|their|that|this|those|these|his)\b|^\s*(and|so|but|why|how come|expand|more|tell me more|go on|what else|explain)\b")


def followup_query(q, hist):
    """'expand on him' means nothing to a search: add what the last answer was about."""
    if not hist or not FOLLOW.search(q) or len(q.split()) > 14:
        return q
    last = hist[-1]
    names = re.findall(r"\b(?:[A-Z][a-z]+(?:\s+(?:[A-Z]\.\s*)?[A-Z][a-z]+)+)", last.get("a", ""))  # 'Franklin D. Roosevelt', 'Millard Fillmore'
    names = [n for n in dict.fromkeys(names) if not n.startswith(("The ", "United States", "Vault", "World"))]
    subject = names[0] if names else last.get("q", "")
    return f"{subject} {q}".strip()


def mastery(D):
    """How strong everything is, 0..1: math topics, flashcard decks, notes you've been tested on."""
    out = {"math": [], "decks": [], "notes": []}
    try:
        for o in mathtutor.state(D.get("math", {})):
            s = 1.0 if o["mastered"] else min(0.9, 0.15 * o.get("streak", 0) + (0.1 if o.get("open") else 0))
            out["math"].append({"id": o["id"], "name": o["name"], "track": o.get("track", ""), "s": round(s, 2), "open": o.get("open", False), "mastered": o["mastered"]})
    except Exception as e:
        log("mastery math:", repr(e))
    decks = {}
    for c in D.get("cards", {}).values():
        g = decks.setdefault(c["deck"], [0, 0.0, 0])
        g[0] += 1
        g[1] += min(1.0, c.get("interval", 0) / 21) * 0.8 + (0.2 if c.get("reps", 0) else 0)  # three weeks between reviews counts as solid
        g[2] += 1 if c.get("due", 0) <= store.now() else 0
    out["decks"] = sorted(({"name": k, "n": v[0], "s": round(v[1] / v[0], 2), "due": v[2]} for k, v in decks.items()), key=lambda x: x["s"])
    scores = {}
    for ex in D.get("exams", []):
        for r in ex.get("results", []) if isinstance(ex.get("results"), list) else []:
            src = r.get("src") or r.get("path")
            if src:
                g = scores.setdefault(src, [0, 0])
                g[0] += 1 if r.get("ok") else 0
                g[1] += 1
    for t in D.get("teach", []):
        if t.get("path") and t.get("score") is not None:
            g = scores.setdefault(t["path"], [0, 0])
            g[0] += max(0, min(10, t["score"])) / 10
            g[1] += 1
    out["notes"] = sorted(({"path": k, "name": os.path.splitext(os.path.basename(k))[0], "s": round(v[0] / v[1], 2), "n": v[1]} for k, v in scores.items() if v[1]), key=lambda x: x["s"])[:40]
    return out


# ---------- the Ctrl+K word index (searchidx.py): built in the background, rebuilt when notes, books or Paper change ----------
IDX = searchidx.Index()
_idx_busy = threading.Lock()


def index_sig(D):
    notes = D.get("notes", {})
    PP = D.get("paper", {})
    return (len(notes), sum(int(n.get("mtime") or 0) for n in notes.values()),
            tuple(sorted(r.get("stamp", "") for r in D.get("readings", {}).values())),
            tuple(sorted((k, nb.get("title", "")) for k, nb in PP.get("nbs", {}).items())),
            sum(len(t) for t in PP.get("text", {}).values()))


def index_build(D):
    if not _idx_busy.acquire(blocking=False):
        return
    try:
        sig, docs = index_sig(D), []
        for path, n in list(D.get("notes", {}).items()):
            if not n.get("reading"):
                docs.append(("note", path, os.path.splitext(os.path.basename(path))[0], n.get("text", "")[:200000]))
        for rid, r in list(D.get("readings", {}).items()):
            n = D.get("notes", {}).get("Readings/" + r.get("rel", ""), {})
            docs.append(("doc", rid, r.get("name", ""), book_text(rid, n.get("text", ""))))
        PP = D.get("paper", {})
        for k, nb in list(PP.get("nbs", {}).items()):
            docs.append(("nb", k, nb.get("title", ""), ""))
            for i, pg in enumerate(nb.get("pages", [])):
                t = PP.get("text", {}).get(pg["id"], "")
                if t:
                    docs.append(("page", (k, pg["id"], i + 1), nb.get("title", ""), t))
        if P.data is not None:
            IDX.build(docs, sig)
    except Exception as e:
        log("index:", repr(e))
    finally:
        _idx_busy.release()


def search_all(D, q, d_vault=True):
    """Ctrl+K: notes, documents, Paper, flashcards, math topics and the Vault, a few of each."""
    q = (q or "").strip()
    if len(q) < 2:
        return {}
    ql = q.lower()
    words = [w for w in re.findall(r"\w+", ql) if len(w) > 1]
    hit = lambda text: all(w in text for w in words)
    def snip(text):
        t = text.replace("\n", " ")
        i = max(0, t.lower().find(words[0]) - 50) if words else 0
        return ("…" if i else "") + t[i:i + 140].strip() + "…"
    out = {"notes": [], "docs": [], "paper": [], "cards": [], "math": [], "vault": []}
    if IDX.ready and IDX.sig == index_sig(D) and words:  # the quick way: look the words up
        PP, seen_nb = D.get("paper", {}), set()
        for i, (kind, key, title, text), at in IDX.find(words):
            if kind == "note" and len(out["notes"]) < 12:
                out["notes"].append({"path": key, "name": title, "snip": searchidx.snippet(text, words[0], at=at), "rank": 0 if all(w in title.lower() for w in words) else 1})
            elif kind == "doc" and len(out["docs"]) < 5:
                r = D.get("readings", {}).get(key, {})
                out["docs"].append({"id": key, "name": title, "book": r.get("kind") in ("txt", "epub"), "snip": searchidx.snippet(text, words[0], at=at) if text else ""})
            elif kind == "nb" and key not in seen_nb and len(out["paper"]) < 5:
                seen_nb.add(key)
                out["paper"].append({"nb": key, "title": title, "kind": PP.get("nbs", {}).get(key, {}).get("kind", "pages")})
            elif kind == "page" and key[0] not in seen_nb and len(out["paper"]) < 5:
                seen_nb.add(key[0])
                out["paper"].append({"nb": key[0], "pid": key[1], "title": title, "page": key[2], "snip": searchidx.snippet(text, words[0], at=at), "kind": PP.get("nbs", {}).get(key[0], {}).get("kind", "pages")})
        out["notes"] = sorted(out["notes"], key=lambda x: x["rank"])[:6]
        return search_rest(D, q, hit, out, d_vault)
    threading.Thread(target=index_build, args=(D,), daemon=True).start()  # not ready yet: look the slow way this once
    for path, n in D.get("notes", {}).items():
        if n.get("reading"):
            continue
        name = os.path.splitext(os.path.basename(path))[0]
        low = (name + " " + n.get("text", "")[:50000]).lower()
        if hit(low):
            out["notes"].append({"path": path, "name": name, "snip": snip(n.get("text", "")), "rank": 0 if hit(name.lower()) else 1})
    out["notes"] = sorted(out["notes"], key=lambda x: x["rank"])[:6]
    for rid, r in D.get("readings", {}).items():
        n = D.get("notes", {}).get("Readings/" + r.get("rel", ""), {})
        txt = book_text(rid, n.get("text", ""))
        if hit((r.get("name", "") + " " + txt).lower()):
            out["docs"].append({"id": rid, "name": r.get("name", ""), "book": r.get("kind") in ("txt", "epub"), "snip": snip(txt) if txt else ""})
    out["docs"] = out["docs"][:5]
    PP = D.get("paper", {})
    for k, nb in PP.get("nbs", {}).items():
        texts = [(pg["id"], PP.get("text", {}).get(pg["id"], "")) for pg in nb.get("pages", [])]
        if hit(nb.get("title", "").lower()):
            out["paper"].append({"nb": k, "title": nb["title"], "kind": nb.get("kind", "pages")})
        else:
            for i, (pid, t) in enumerate(texts):
                if t and hit(t.lower()):
                    out["paper"].append({"nb": k, "pid": pid, "title": nb["title"], "page": i + 1, "snip": snip(t), "kind": nb.get("kind", "pages")})
                    break
    out["paper"] = out["paper"][:5]
    return search_rest(D, q, hit, out, d_vault)


def search_rest(D, q, hit, out, d_vault):
    """Flashcards, math topics and the Vault: small enough to look through every time."""
    for c in D.get("cards", {}).values():
        if hit((c.get("front", "") + " " + c.get("back", "") + " " + c.get("deck", "")).lower()):
            out["cards"].append({"id": c["id"], "front": c.get("front", "")[:120] or "(picture card)", "deck": c["deck"]})
            if len(out["cards"]) >= 5:
                break
    try:
        for t in mathtutor.TOPICS.values():
            tid, name = t["id"], t["name"]
            if hit(name.lower()):
                out["math"].append({"id": tid, "name": name})
        out["math"] = out["math"][:4]
    except Exception as e:
        log("search math:", repr(e))
    try:
        if vault.available():
            out["vault"] = vault.quick_titles(q) if d_vault else []
    except Exception as e:
        log("search vault:", repr(e))
    return out


def math_summary(D):
    try:
        st = mathtutor.state(D.get("math", {}))
    except Exception:
        return None
    done = [o for o in st if o["mastered"]]
    nxt = sorted((o for o in st if o["open"] and not o["mastered"]), key=lambda o: o["level"])
    return {"mastered": len(done), "total": len(st), "next": nxt[0]["name"] if nxt else None, "next_id": nxt[0]["id"] if nxt else None}


def J(h, obj, code=200):
    b = json.dumps(obj).encode()
    h.send_response(code)
    h.send_header("Content-Type", "application/json")
    h.send_header("Content-Length", str(len(b)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(b)


def need(h):
    if P.data is None:
        J(h, {"error": "locked"}, 401)
        return False
    return True


def book(bid):
    return P.data["books"].get(bid)


def paper_notes(D):
    """Your handwriting (and typed text) from Paper, as notes: one per notebook, in a 'Paper' folder."""
    PP = D.get("paper", {}) if D else {}
    texts, out = PP.get("text", {}), {}
    for nb in PP.get("nbs", {}).values():
        if nb.get("kind") == "flip":
            continue
        parts = [f"Page {i + 1}:\n{texts[pg['id']].strip()}" for i, pg in enumerate(nb.get("pages", [])) if (texts.get(pg["id"]) or "").strip()]
        if parts:
            name = re.sub(r'[\\/:*?"<>|]+', "-", nb.get("title") or "Untitled")
            out[f"Paper/{name}.md"] = {"text": "\n\n".join(parts), "paper": True}
    return out


# ---------- books: each one lives in its own encrypted file (data/readings/<id>.book.enc), opened only when needed ----------
BOOKS = {}  # id -> (stamp, book, flat text); emptied whenever Feather locks


def load_book(rid):
    if P.data is None:
        BOOKS.clear()
        IDX.clear()
        return None
    r = P.data.get("readings", {}).get(rid)
    if not r:
        return None
    hit = BOOKS.get(rid)
    if hit and hit[0] == r.get("stamp"):
        return hit[1]
    f = os.path.join(P.data_dir, "readings", rid + ".book.enc")
    if not os.path.isfile(f):
        return None
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    raw = open(f, "rb").read()
    book = json.loads(AESGCM(P.key).decrypt(raw[:12], raw[12:], b"feather-book"))
    mark = "p" if book.get("kind") == "pdf" else "ch"
    flat = "\n\n".join(f"[{mark}. {i + 1}] {c['t']}\n" + "\n\n".join(c["p"]) for i, c in enumerate(book["ch"]))
    BOOKS[rid] = (r.get("stamp"), book, flat)
    return book


def book_text(rid, fallback=""):
    return BOOKS[rid][2] if load_book(rid) and rid in BOOKS else fallback


def all_notes(D):
    notes = dict(D.get("notes", {}))
    for path, n in notes.items():  # a book's note only holds its opening: Ask and exams get the whole book
        if n.get("book") and n.get("reading"):
            full = book_text(n["reading"])
            if full:
                notes[path] = {**n, "text": full}
    return {**notes, **paper_notes(D)}


def notes_list():
    out = []
    for path, n in sorted(all_notes(P.data).items()):
        out.append({"path": path, "title": os.path.splitext(os.path.basename(path))[0], "folder": os.path.dirname(path), "size": len(n.get("text", ""))})
    return out


def pick_notes(paths, folder):
    notes = all_notes(P.data)
    sel = [p for p in notes if (paths and p in paths) or (folder is not None and (p.startswith(folder + "/") or (folder == "" )))]
    return [(os.path.splitext(os.path.basename(p))[0], notes[p]["text"]) for p in sel]


def add_card(front, back, deck, hint="", fimg=None, bimg=None):
    cid = store.new_id()
    c = {"id": cid, "front": front, "back": back, "deck": deck, "due": store.now(), "interval": 0, "ease": 2.5, "reps": 0, "t": store.now()}
    if hint:
        c["hint"] = hint[:400]
    if fimg:
        c["fimg"] = re.sub(r"[^0-9a-f]", "", fimg)[:16]
    if bimg:
        c["bimg"] = re.sub(r"[^0-9a-f]", "", bimg)[:16]
    P.data["cards"][cid] = c
    return c


def ink_text(strokes, img_b64=None):
    """Handwriting -> text: Windows' handwriting recognizer on the strokes, or its text reader on a picture of the page."""
    if sys.platform != "win32":
        return ""
    text = ""
    fd, path = tempfile.mkstemp(suffix=".json")
    os.write(fd, json.dumps([[round(v, 1) for i, v in enumerate(s["p"]) if i % 3 != 2] for s in strokes if s.get("k") == "p" and len(s.get("p", [])) >= 6]).encode())
    os.close(fd)
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(APP, "ink.ps1"), path],
                             capture_output=True, text=True, timeout=90, creationflags=0x08000000, encoding="utf-8")
        text = out.stdout.strip()
        if out.returncode and out.stderr:
            log("ink recognizer:", out.stderr[-300:])
    except Exception as e:
        log("ink recognizer failed:", repr(e))
    finally:
        os.remove(path)
    if not text and img_b64:
        try:
            text = ocr(img_b64)
        except Exception as e:
            log("page OCR failed:", repr(e))
    return text


def ocr(img_b64):
    if sys.platform != "win32":
        return ""
    fd, path = tempfile.mkstemp(suffix=".png")
    os.write(fd, base64.b64decode(img_b64.split(",")[-1]))
    os.close(fd)
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(APP, "ocr.ps1"), path],
                             capture_output=True, text=True, timeout=60, creationflags=0x08000000, encoding="utf-8")
        return out.stdout.strip()
    finally:
        os.remove(path)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    def trusted(self, post=False):
        """Only Feather's own window may talk to this server: the Host must be this machine (stops DNS rebinding),
        and a POST must come from Feather's own page (stops other websites and the sandboxed Vault pages)."""
        port = self.server.server_address[1]
        if self.headers.get("Host", "") not in (f"127.0.0.1:{port}", f"localhost:{port}"):
            return False
        o = self.headers.get("Origin")
        return not post or o is None or o in (f"http://127.0.0.1:{port}", f"http://localhost:{port}")

    def do_GET(self):
        if not self.trusted():
            return self.send_error(403)
        p = self.path.split("?")[0]
        if p.startswith("/api/"):
            return self.api("GET", p, {})
        if p.startswith("/paper-asset/"):  # a picture or PDF page placed in Paper, decrypted in memory
            aid = re.sub(r"[^0-9a-f]", "", p[len("/paper-asset/"):])[:16]
            f = os.path.join(P.data_dir, "paper", "a" + aid + ".enc")
            if P.data is None or not aid or not os.path.isfile(f):
                return self.send_error(404)
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            raw = open(f, "rb").read()
            b = AESGCM(P.key).decrypt(raw[:12], raw[12:], b"feather-asset")
            self.send_response(200)
            self.send_header("Content-Type", "image/png" if b[:4] == b"\x89PNG" else "image/jpeg")
            self.send_header("Content-Length", str(len(b)))
            self.send_header("Cache-Control", "private, max-age=3600")
            self.end_headers()
            return self.wfile.write(b)
        if p.startswith("/reading/"):  # one of your PDFs, decrypted in memory, only while Feather is unlocked
            rid = re.sub(r"[^0-9a-f]", "", p[len("/reading/"):])[:12]
            r = (P.data or {}).get("readings", {}).get(rid)
            f = os.path.join(P.data_dir, "readings", rid + ".enc")
            if P.data is None or not r or not os.path.isfile(f):
                return self.send_error(404)
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            raw = open(f, "rb").read()
            b = AESGCM(P.key).decrypt(raw[:12], raw[12:], b"feather-file")
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf" if r["kind"] == "pdf" else "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return self.wfile.write(b)
        if p == "/banners":  # the banner pictures copied from Archie
            return J(self, banners())
        if p.startswith("/banners/"):
            import urllib.parse
            f = os.path.join(BANNERS, os.path.basename(urllib.parse.unquote(p[len("/banners/"):])))
            if not os.path.isfile(f):
                return self.send_error(404)
            b = open(f, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(b)))
            self.send_header("Cache-Control", "max-age=86400")
            self.end_headers()
            return self.wfile.write(b)
        if p.startswith("/vault/"):  # a page (or picture) from the Vault on the stick
            return self.vault_get(p)
        base = os.path.join(APP, "web")
        if p.startswith("/flags/"):  # country flags copied from Archie World
            base, p = world.FLAGS, p[len("/flags"):]
        f = os.path.join(base, "index.html" if p == "/" else p.lstrip("/"))
        if not os.path.abspath(f).startswith(base) or not os.path.isfile(f):
            self.send_error(404)
            return
        ct = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2"}.get(os.path.splitext(f)[1], "application/octet-stream")
        b = open(f, "rb").read()
        if f.endswith("index.html"):  # stamp the app files so the window can never use an old copy after an update
            w = os.path.join(APP, "web")
            v = str(int(max(os.path.getmtime(os.path.join(w, n)) for n in ("app.js", "style.css", "paper.js", "extras.js", "reader.js"))))
            b = b.replace(b'src="app.js"', b'src="app.js?v=' + v.encode() + b'"').replace(b'href="style.css"', b'href="style.css?v=' + v.encode() + b'"').replace(b'src="paper.js"', b'src="paper.js?v=' + v.encode() + b'"').replace(b'src="extras.js"', b'src="extras.js?v=' + v.encode() + b'"').replace(b'src="reader.js"', b'src="reader.js?v=' + v.encode() + b'"')
        self.send_response(200)
        self.send_header("Content-Type", ct + ("; charset=utf-8" if ct.startswith("text") else ""))
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")  # always show the newest version after an update
        self.end_headers()
        self.wfile.write(b)

    def vault_get(self, p):
        import urllib.parse
        parts = p[len("/vault/"):].split("/", 1)
        book, path = parts[0], urllib.parse.unquote(parts[1] if len(parts) > 1 else "")
        try:
            r = vault.page(book, path) if vault.available() else None
        except Exception:
            r = None
        if r is None:
            return self.send_error(404)
        mt, body = r
        if mt == "redirect":
            self.send_response(302)
            self.send_header("Location", f"/vault/{book}/" + urllib.parse.quote(body))
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", mt + ("; charset=utf-8" if mt.startswith("text/") and "charset" not in mt else ""))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "max-age=3600")
        self.end_headers()
        self.wfile.write(body)

    def paper(self, what, d, D):
        """Notebooks live in the store; each page's strokes are their own encrypted file (data/paper/<pid>.enc)."""
        import secrets
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        PP = D.setdefault("paper", {})
        nbs = PP.setdefault("nbs", {})
        folder = os.path.join(P.data_dir, "paper")
        os.makedirs(folder, exist_ok=True)
        clean = lambda s: re.sub(r"[^0-9a-f]", "", str(s or ""))[:16]
        pfile = lambda pid: os.path.join(folder, clean(pid) + ".enc")
        TPLS = ("blank", "lined", "grid", "dot", "cornell", "graph", "story")
        newpage = lambda tpl: {"id": secrets.token_hex(6), "tpl": tpl if tpl in TPLS else "lined"}
        nb = nbs.get(clean(d.get("nb")))
        if what == "recognize":  # read the handwriting on a page (in the background), for search and Ask
            pid = clean(d.get("pid"))
            f = pfile(pid)
            if not os.path.exists(f):
                return J(self, {"ok": False})
            raw = open(f, "rb").read()
            strokes = json.loads(AESGCM(P.key).decrypt(raw[:12], raw[12:], b"feather-paper")).get("strokes", [])
            img = d.get("img")
            typed = "\n".join(s.get("text", "") for s in strokes if s.get("k") == "t" and s.get("text"))
            def work():
                t = "\n".join(x for x in (ink_text(strokes, img) if any(s.get("k") == "p" for s in strokes) else "", typed) if x)
                PP.setdefault("text", {})[pid] = t
                try:
                    P.save()
                except Exception as e:
                    log("save after ink:", repr(e))
            threading.Thread(target=work, daemon=True).start()
            return J(self, {"ok": True})
        if what == "text":
            return J(self, {"text": PP.get("text", {}).get(clean(d.get("pid")), "")})
        if what == "asset":  # store a picture (base64) encrypted; returns its id
            data = base64.b64decode(d.get("data", "").split(",")[-1])
            if not data or len(data) > 25_000_000:
                return J(self, {"error": "That file is too big (25 MB max per page)."}, 400)
            aid = secrets.token_hex(6)
            nonce = secrets.token_bytes(12)
            open(os.path.join(folder, "a" + aid + ".enc"), "wb").write(nonce + AESGCM(P.key).encrypt(nonce, data, b"feather-asset"))
            return J(self, {"id": aid})
        if what == "list":
            out = []
            for k, n in nbs.items():
                t = max([n.get("t", 0)] + [os.path.getmtime(pfile(pg["id"])) for pg in n["pages"] if os.path.exists(pfile(pg["id"]))])
                out.append({"id": k, "title": n["title"], "pages": n["pages"], "theme": n.get("theme", "dark"), "kind": n.get("kind", "pages"), "t": t})
            return J(self, sorted(out, key=lambda x: -x["t"]))
        if what == "new":
            k = secrets.token_hex(5)
            kind = d.get("kind") if d.get("kind") in ("canvas", "flip") else "pages"
            pages = []
            for pg in d.get("pages") or []:  # an imported PDF: one page per PDF page, with the page picture behind
                q = newpage("blank")
                q["bg"] = clean(pg.get("bg"))
                q["h"] = max(200, min(6000, int(pg.get("h") or 1400)))
                pages.append(q)
            nbs[k] = {"title": (d.get("title") or "Untitled").strip()[:60] or "Untitled", "t": time.time(), "theme": d.get("theme") if d.get("theme") in ("dark", "sepia", "paper") else "dark",
                      "kind": kind, "pages": pages or [newpage(d.get("tpl") or ("dot" if kind == "canvas" else "lined"))]}
            P.save()
            return J(self, {"id": k})
        if not nb:
            return J(self, {"error": "That notebook is gone."}, 404)
        if what == "get":
            return J(self, {"id": clean(d.get("nb")), "title": nb["title"], "pages": nb["pages"], "theme": nb.get("theme", "dark"), "kind": nb.get("kind", "pages")})
        if what == "page":  # one page's strokes
            f = pfile(d.get("pid"))
            if not os.path.exists(f):
                return J(self, {"strokes": []})
            raw = open(f, "rb").read()
            return J(self, json.loads(AESGCM(P.key).decrypt(raw[:12], raw[12:], b"feather-paper")))
        if what == "save":  # strokes for one page (called a moment after you stop drawing)
            pid = clean(d.get("pid"))
            if not any(pg["id"] == pid for pg in nb["pages"]):
                return J(self, {"error": "No such page."}, 404)
            body = json.dumps({"strokes": d.get("strokes", [])}, separators=(",", ":")).encode()
            nonce = secrets.token_bytes(12)
            tmp = pfile(pid) + ".tmp"
            open(tmp, "wb").write(nonce + AESGCM(P.key).encrypt(nonce, body, b"feather-paper"))
            os.replace(tmp, pfile(pid))
            return J(self, {"ok": True})
        if what == "addpage":
            pg = newpage(d.get("tpl"))
            at = int(d.get("after", len(nb["pages"]) - 1)) + 1
            nb["pages"].insert(max(0, min(at, len(nb["pages"]))), pg)
            nb["t"] = time.time()
            P.save()
            return J(self, pg)
        if what == "delpage":
            pid = clean(d.get("pid"))
            nb["pages"] = [pg for pg in nb["pages"] if pg["id"] != pid] or [newpage("lined")]
            if os.path.exists(pfile(pid)):
                os.remove(pfile(pid))
            PP.get("text", {}).pop(pid, None)
            P.save()
            return J(self, {"pages": nb["pages"]})
        if what == "set":  # rename, theme, or a page's paper
            if d.get("title"):
                nb["title"] = d["title"].strip()[:60]
            if d.get("theme") in ("dark", "sepia", "paper"):
                nb["theme"] = d["theme"]
            for pg in nb["pages"]:
                if pg["id"] == clean(d.get("pid")):
                    if d.get("tpl") in TPLS:
                        pg["tpl"] = d["tpl"]
                    if d.get("h"):  # the page grew
                        pg["h"] = max(200, min(20000, int(d["h"])))
            nb["t"] = time.time()
            P.save()
            return J(self, {"ok": True})
        if what == "delete":
            for pg in nb["pages"]:
                for f in (pfile(pg["id"]), os.path.join(folder, "a" + clean(pg.get("bg")) + ".enc")):
                    if os.path.exists(f):
                        os.remove(f)
            txt = PP.get("text", {})
            for pg in nb["pages"]:  # its handwriting stops showing up in search
                txt.pop(pg["id"], None)
            del nbs[clean(d.get("nb"))]
            P.save()
            return J(self, {"ok": True})
        return J(self, {"error": "?"}, 404)

    def reader(self, what, d, D):
        rid = re.sub(r"[^0-9a-f]", "", str(d.get("id", "")))[:12]
        r = D.get("readings", {}).get(rid)
        if not r:
            return J(self, {"error": "That book isn't on the stick any more."}, 404)
        book = load_book(rid)
        if not book:
            return J(self, {"error": "This one needs a sync first: plug Feather into your PC once and it opens in the reader."}, 409)
        marks = D.setdefault("marks", {}).setdefault(rid, [])
        pos = D.setdefault("readpos", {})
        bk = next((b for b in D["books"].values() if b.get("digital") == rid), None)
        nch = len(book["ch"])
        if what == "open":
            if not bk:  # the Reading tab tracks it like a paper book: place, chapter notes, quotes
                bid = store.new_id()
                bk = D["books"][bid] = {"id": bid, "title": book.get("title") or r["name"], "author": book.get("author", ""), "pages": nch, "digital": rid,
                                        "started": store.now(), "t": store.now(), "chapters": {}, "quotes": [], "people": [], "log": [], "progress": {"page": 1, "chapter": book["ch"][0]["t"]}}
                P.save()
            return J(self, {"id": rid, "title": book.get("title") or r["name"], "author": book.get("author", ""), "kind": book.get("kind"),
                            "toc": [c["t"] for c in book["ch"]], "lens": [sum(len(x) for x in c["p"]) for c in book["ch"]],
                            "pos": pos.get(rid, {"ch": 0, "p": 0}), "marks": marks, "book": bk["id"]})
        if what == "chapter":
            ch = max(0, min(nch - 1, int(d.get("ch", 0))))
            return J(self, {"ch": ch, "t": book["ch"][ch]["t"], "p": book["ch"][ch]["p"]})
        if what == "pos":
            ch = max(0, min(nch - 1, int(d.get("ch", 0))))
            pos[rid] = {"ch": ch, "p": max(0, int(d.get("p", 0))), "t": store.now()}
            if bk:
                pr = bk.setdefault("progress", {})
                if pr.get("page") != ch + 1:
                    pr.update({"page": ch + 1, "chapter": book["ch"][ch]["t"]})
                    day = time.strftime("%Y-%m-%d")
                    log_ = bk.setdefault("log", [])
                    if log_ and time.strftime("%Y-%m-%d", time.localtime(log_[-1]["t"])) == day:
                        log_[-1].update({"page": ch + 1, "chapter": book["ch"][ch]["t"], "t": store.now()})
                    else:
                        log_.append({"t": store.now(), "page": ch + 1, "chapter": book["ch"][ch]["t"]})
                bk["t"] = store.now()
            P.save()
            return J(self, {"ok": True})
        if what == "mark":  # add, change or delete a highlight
            op, m = d.get("op"), d.get("mark") or {}
            if op == "add":
                m = {"id": store.new_id(), "ch": int(m.get("ch", 0)), "a": int(m.get("a", 0)), "oa": int(m.get("oa", 0)), "b": int(m.get("b", 0)), "ob": int(m.get("ob", 0)),
                     "c": int(m.get("c", 0)) % 4, "note": str(m.get("note", ""))[:4000], "text": str(m.get("text", ""))[:4000], "t": store.now()}
                marks.append(m)
            elif op == "edit":
                for x in marks:
                    if x["id"] == m.get("id"):
                        for k in ("c", "note"):
                            if k in m:
                                x[k] = int(m[k]) % 4 if k == "c" else str(m[k])[:4000]
            elif op == "del":
                marks[:] = [x for x in marks if x["id"] != m.get("id")]
            P.save()
            return J(self, {"marks": marks, "id": m.get("id")})
        if what == "quote":  # a highlight saved to the book's quotes (Reading tab, and Obsidian)
            if bk:
                ch = int(d.get("ch", 0))
                bk.setdefault("quotes", []).append({"id": store.new_id(), "text": str(d.get("text", ""))[:2000], "page": ch + 1, "chapter": book["ch"][min(ch, nch - 1)]["t"], "t": store.now()})
                P.save()
            return J(self, {"ok": True})
        if what == "find":
            q = (d.get("q") or "").strip().lower()
            out = []
            if len(q) >= 2:
                for i, c in enumerate(book["ch"]):
                    for j, para in enumerate(c["p"]):
                        k = para.lower().find(q)
                        if k >= 0:
                            out.append({"ch": i, "t": c["t"], "p": j, "snip": ("…" if k > 60 else "") + para[max(0, k - 60): k + 120] + "…"})
                            if len(out) >= 80:
                                break
                    if len(out) >= 80:
                        break
            return J(self, out)
        return J(self, {"error": "?"}, 404)

    def math(self, what, d, D):
        mt = mathtutor
        if not mt.available():
            return J(self, {"ok": False, "error": "The math engine isn't on the stick yet: plug Feather into your PC once."})
        prog = D.setdefault("math", {})

        def show(pr):
            pid = store.new_id()
            MATHQ[pid] = pr
            if len(MATHQ) > 200:
                MATHQ.pop(next(iter(MATHQ)))
            return {"pid": pid, "q": pr["q"], "topic": pr["topic"], "topic_name": pr["topic_name"], "hint": pr.get("hint", "")}

        def ans_tex(pr):
            try:
                if pr["kind"] == "set":
                    return ",\\ ".join(mt.lx(mt.parse(x)) for x in pr["ans"].split(","))
                if pr["kind"] == "ineq":
                    return pr["ans"].replace("<=", "\\le").replace(">=", "\\ge")
                return mt.lx(mt.parse(pr["ans"])) if pr["kind"] not in ("str", "matrix", "point") else pr["ans"]
            except Exception:
                return pr["ans"]
        if what == "state":
            return J(self, {"ok": True, "topics": mt.state(prog), "tracks": mt.TRACKS, "placement_done": prog.get("placement_done", False)})
        if what == "lesson":
            return J(self, mt.lesson(d["id"]))
        if what == "new":
            tid = d.get("id") or "mixed"
            return J(self, show(mt.new_problem(mt.pick_mixed(prog) if tid == "mixed" else tid)))
        if what in ("check", "reveal"):
            pr = MATHQ.get(d.get("pid"))
            if not pr:
                return J(self, {"error": "That problem expired. Try a new one."}, 404)
            ok, note = mt.check(pr, d.get("answer", "")) if what == "check" else (False, "")
            if not pr.get("done"):
                mt.record(prog, pr["topic"], ok)
                bump(D, "math")
                pr["done"] = True
                P.save()
            st = next(o for o in mt.state(prog) if o["id"] == pr["topic"])
            return J(self, {"ok": ok, "note": note, "ans": ans_tex(pr), "steps": pr["steps"], "streak": st["streak"], "mastered": st["mastered"]})
        if what == "placement":  # start, or answer and get the next checkpoint
            pl = MATHPL.setdefault("run", {"i": 0, "miss": 0, "best": None, "n": 0})
            if d.get("start"):
                MATHPL["run"] = pl = {"i": 0, "miss": 0, "best": None, "n": 0}
            elif d.get("pid") in MATHQ:
                pr = MATHQ[d["pid"]]
                ok = False if d.get("skip") else mt.check(pr, d.get("answer", ""))[0]
                pl["n"] += 1
                if ok:
                    pl["best"], pl["miss"] = pr["topic"], 0
                else:
                    pl["miss"] += 1
                pl["i"] += 1
            if pl["miss"] >= 2 or pl["i"] >= len(mt.PLACEMENT):
                lvl = mt.place(prog, pl["best"])
                P.save()
                n = sum(1 for o in mt.state(prog) if o["mastered"])
                return J(self, {"done": True, "level": lvl, "known": n, "best": mt.TOPICS[pl["best"]]["name"] if pl["best"] else None})
            return J(self, {"done": False, "step": pl["i"] + 1, "of": len(mt.PLACEMENT), **show(mt.new_problem(mt.PLACEMENT[pl["i"]]))})
        if what == "skip_placement":
            prog["placement_done"] = True
            prog.setdefault("placed", [])
            P.save()
            return J(self, {"ok": True})
        if what == "reset":
            D["math"] = {}
            P.save()
            return J(self, {"ok": True})
        return J(self, {"error": "Unknown."}, 404)

    def do_POST(self):
        if not self.trusted(post=True):
            return self.send_error(403)
        self.api("POST", self.path.split("?")[0], self.body())

    def api(self, m, p, d):
        last_ping[0] = time.time()
        if p != "/api/ping":
            last_action[0] = time.time()
        try:
            return self.route(p, d)
        except Exception as e:
            log("error on", p, traceback.format_exc())
            return J(self, {"error": str(e)}, 500)

    def route(self, p, d):
        if p == "/api/version":
            return J(self, {"v": VERSION})
        if p == "/api/ping":
            bye_at[0] = 0
            return J(self, {"ok": True, "locked": P.data is None, "model": ai.status()})
        if p == "/api/bye":  # the window is closing (or reloading: then a ping follows within seconds)
            bye_at[0] = time.time()
            return J(self, {"ok": True})
        if p == "/api/state":
            w = os.path.join(APP, "web")
            build = time.strftime("%m.%d %H:%M", time.localtime(int(VERSION)))
            return J(self, {"exists": P.exists or DEMO, "unlocked": P.data is not None, "model": ai.status(), "llm_log": ai.log_tail(), "build": build,
                            "version": FEATHER_VERSION, "demo": DEMO})
        if p in ("/api/quotes/hidden", "/api/quotes/hide"):  # quotes you never want to see again (not secret: a plain list on the stick)
            hf = os.path.join(P.data_dir, "quotes-hidden.json")
            try:
                hid = json.load(open(hf, encoding="utf-8"))
            except (OSError, ValueError):
                hid = {"q": [], "who": []}
            if p == "/api/quotes/hide":
                if d.get("reset"):
                    hid = {"q": [], "who": []}
                for k in ("q", "who"):
                    v = (d.get(k) or "").strip()[:600]
                    if v and v not in hid[k]:
                        hid[k].append(v)
                json.dump(hid, open(hf, "w", encoding="utf-8"), ensure_ascii=False)
            return J(self, hid)
        if p == "/api/model/restart":
            ai.stop()
            threading.Thread(target=ai.start, daemon=True).start()
            return J(self, {"ok": True})
        if p == "/api/unlock":
            if DEMO and not P.exists:  # first demo run: make the made-up student's Feather
                import demo
                P.unlock(demo.PASSWORD)
                demo.seed(P)
            if DEMO:
                d["password"] = demo_pw()
            if not P.exists and len(d.get("password", "")) < 6:
                return J(self, {"error": "Use at least 6 characters."}, 400)
            ok = P.unlock(d.get("password", ""))
            if ok:
                threading.Thread(target=ai.start, daemon=True).start()  # warm the model up in the background
                threading.Thread(target=mathtutor.available, daemon=True).start()  # and load the math engine
                threading.Thread(target=index_build, args=(P.data,), daemon=True).start()  # and the search index
            return J(self, {"ok": ok} if ok else {"error": "Wrong password."}, 200 if ok else 403)
        if p == "/api/lock":
            P.save()
            P.lock()
            BOOKS.clear()
            IDX.clear()
            return J(self, {"ok": True})
        if p == "/api/eject":
            J(self, {"ok": True})
            threading.Thread(target=eject, daemon=True).start()
            return
        if not need(self):
            return
        D = P.data
        if p == "/api/home":
            books = sorted(D["books"].values(), key=lambda b: -b.get("t", 0))
            reading = next((b for b in books if not b.get("finished")), None)
            due = store.due_cards(D["cards"])
            decks = {}
            for c in due:
                decks[c.get("deck", "General")] = decks.get(c.get("deck", "General"), 0) + 1
            return J(self, {"reading": reading, "due": len(due), "decks": decks, "exams": D["exams"][-3:], "notes": len(D["notes"]),
                            "synced": D.get("settings", {}).get("synced"), "model": ai.status(), "books": len(books),
                            "name": D.get("settings", {}).get("name") or "", "toured": bool(D.get("settings", {}).get("toured")), "deadlines": [x for x in D.get("deadlines", []) if x.get("date", "") >= time.strftime("%Y-%m-%d")][:5], "calq": len(D.get("calq", [])),
                            "world": [{k: s.get(k) for k in ("title", "n", "place", "region", "last")} for s in world.news().get("pc", [])[:4]],
                            "docs": len(D.get("readings", {})), "reviews": review_week(D), "math": math_summary(D), "today": today_strip(D),
                            "libs": len(vault._files()) if os.path.isdir(vault.VDIR) else 0})
        # ---- books ----
        if p == "/api/books":
            return J(self, sorted(D["books"].values(), key=lambda b: -b.get("t", 0)))
        if p == "/api/book/save":
            bid = d.get("id") or store.new_id()
            b = D["books"].setdefault(bid, {"id": bid, "started": store.now(), "chapters": {}, "quotes": [], "people": [], "log": [], "progress": {}})
            for k in ("title", "author", "publisher", "year", "translator", "pages", "finished"):
                if k in d:
                    b[k] = d[k]
            b["t"] = store.now()
            P.save()
            return J(self, b)
        if p == "/api/book/delete":
            D["books"].pop(d["id"], None)
            P.save()
            return J(self, {"ok": True})
        b = book(d.get("id", "")) if p.startswith("/api/book/") else None
        if p.startswith("/api/book/") and not b:
            return J(self, {"error": "No such book."}, 404)
        if p == "/api/book/progress":
            b["progress"] = {"page": d.get("page"), "chapter": d.get("chapter", b.get("progress", {}).get("chapter", ""))}
            b["log"].append({"t": store.now(), **b["progress"]})
            b["t"] = store.now()
            P.save()
            return J(self, b)
        if p == "/api/book/chapter":
            ch = d.get("chapter") or "Notes"
            b["chapters"][ch] = {"notes": d.get("notes", ""), "tags": d.get("tags", []), "t": store.now()}
            b["t"] = store.now()
            P.save()
            return J(self, b)
        if p == "/api/book/quote":
            if d.get("remove"):
                b["quotes"] = [q for q in b["quotes"] if q["id"] != d["remove"]]
            else:
                b["quotes"].append({"id": store.new_id(), "text": d.get("text", "").strip(), "page": d.get("page"), "t": store.now()})
            P.save()
            return J(self, b)
        if p == "/api/book/ocr":
            return J(self, {"text": ocr(d.get("image", ""))})
        if p == "/api/book/people":
            b["people"] = [x.strip() for x in d.get("people", []) if x.strip()]
            P.save()
            return J(self, b)
        if p == "/api/book/ask":
            return J(self, {"answer": ai.ask_book(b, d.get("question", ""))})
        if p == "/api/book/review":
            text = ai.build_review(b, d.get("answers", []))
            b["review"] = {"answers": d.get("answers", []), "text": text, "t": store.now()}
            P.save()
            return J(self, b["review"])
        if p == "/api/book/review/save":
            b.setdefault("review", {})["text"] = d.get("text", "")
            b["finished"] = b.get("finished") or store.now()
            P.save()
            return J(self, b)
        if p == "/api/book/cite":
            return J(self, {"mla": store.cite(b, "mla"), "apa": store.cite(b, "apa")})
        if p == "/api/review/questions":
            return J(self, ai.REVIEW_QUESTIONS)
        # ---- notes, exams, study, teach ----
        if p == "/api/notes":
            return J(self, notes_list())
        if p == "/api/note":
            return J(self, all_notes(D).get(d.get("path"), {}))
        if p == "/api/exam/new":
            if d.get("vault"):  # an exam on a Vault article or textbook chapter
                vb, vpath = d["vault"]["book"], d["vault"]["path"]
                notes = [(vault.title_of(vb, vpath), vault.article_text(vb, vpath, 20000))]
            else:
                notes = pick_notes(d.get("paths"), d.get("folder"))
            qs = ai.make_exam(notes, int(d.get("n", 10)), use_model=ai.status() != "missing")
            eid = store.new_id()
            EXAMS[eid] = {"qs": qs, "title": d.get("title") or (notes[0][0] if len(notes) == 1 else (d.get("folder") or "Mixed notes")), "minutes": d.get("minutes")}
            return J(self, {"id": eid, "title": EXAMS[eid]["title"], "questions": [{k: q[k] for k in ("kind", "q", "options", "source")} for q in qs]})
        if p == "/api/exam/grade":
            ex = EXAMS.get(d["id"])
            if not ex:
                return J(self, {"error": "That exam expired. Start a new one."}, 404)
            res, total, weak = [], 0.0, {}
            for q, a in zip(ex["qs"], d.get("answers", [])):
                g = ai.grade_answer(q, a or "")
                total += g["score"]
                res.append({**g, "answer": q["answer"], "source": q["source"]})
                if g["score"] < 0.6:
                    weak[q["source"]] = weak.get(q["source"], 0) + 1
                    if d.get("cards", True):
                        add_card(q["q"], q["answer"], "Exam · " + ex["title"])
            score = round(100 * total / max(1, len(ex["qs"])))
            rec = {"id": d["id"], "title": ex["title"], "score": score, "weak": sorted(weak, key=lambda k: -weak[k])[:3], "t": store.now(), "n": len(ex["qs"])}
            if d.get("save", True):
                D["exams"].append(rec)
            P.save()
            return J(self, {"score": score, "results": res, "weak": rec["weak"]})
        if p == "/api/teach":
            n = all_notes(D).get(d.get("path"), {})
            fb = ai.teach_back(os.path.basename(d.get("path", "")), n.get("text", ""), d.get("explanation", ""))
            D["teach"].append({"path": d.get("path"), "score": fb.get("score"), "t": store.now()})
            P.save()
            return J(self, fb)
        # ---- math tutor ----
        if p.startswith("/api/math/"):
            return self.math(p[len("/api/math/"):], d, D)
        # ---- paper: handwritten notebooks ----
        if p.startswith("/api/paper/"):
            return self.paper(p[len("/api/paper/"):], d, D)
        # ---- documents: your PDFs and readings ----
        if p == "/api/readings":
            return J(self, sorted(D.get("readings", {}).values(), key=lambda r: -r.get("t", 0)))
        if p == "/api/readings/search":
            q = (d.get("q") or "").strip().lower()
            out = []
            if q:
                for path, n in D["notes"].items():
                    if not n.get("reading"):
                        continue
                    txt = book_text(n["reading"], n.get("text", "")) if n.get("book") else n.get("text", "")
                    low = txt.lower()
                    i = low.find(q)
                    if i < 0:
                        continue
                    pg = re.findall(r"\[(p|ch)\. (\d+)\]", txt[:i])
                    out.append({"id": n["reading"], "path": path, "name": D.get("readings", {}).get(n["reading"], {}).get("name", ""), "page": int(pg[-1][1]) if pg and pg[-1][0] == "p" else None,
                                "ch": int(pg[-1][1]) if pg and pg[-1][0] == "ch" else None, "book": bool(n.get("book")) and not (pg and pg[-1][0] == "p"),
                                "snippet": re.sub(r"\s+", " ", txt[max(0, i - 120): i + 180]), "hits": low.count(q)})
            return J(self, sorted(out, key=lambda r: -r["hits"])[:40])
        # ---- the reader: books in chapters, your place, highlights and notes ----
        if p.startswith("/api/reader/"):
            return self.reader(p[len("/api/reader/"):], d, D)
        if p == "/api/readings/one":
            r = D.get("readings", {}).get(d.get("id"))
            if not r:
                return J(self, {"error": "Not on the stick."}, 404)
            path = "Readings/" + r["rel"]
            txt = D["notes"].get(path, {}).get("text", "")
            return J(self, {**r, "path": path, "text": txt[:200000] if r["kind"] == "txt" or not r.get("file") else ""})
        if p == "/api/cards/make":  # flashcards from a note or a document
            path = d.get("path", "")
            n = all_notes(D).get(path)
            if not n:
                return J(self, {"error": "Not found."}, 404)
            title = os.path.splitext(os.path.basename(path))[0]
            made = ai.make_cards(title, n.get("text", ""), int(d.get("n", 10)))
            deck = ("Doc · " if n.get("reading") else "Notes · ") + title
            for c in made:
                add_card(c["front"], c["back"], deck)
            P.save()
            return J(self, {"made": len(made), "deck": deck, "model": ai.status() == "ready"})
        # ---- saved quotes (from the lock screen), plain text ----
        if p == "/api/quotes":
            return J(self, {"text": D.setdefault("settings", {}).get("quotes", "")})
        if p == "/api/quotes/add":
            cur = D.setdefault("settings", {}).get("quotes", "")
            line = (d.get("text") or "").strip()
            if line and line not in cur.splitlines():
                D["settings"]["quotes"] = (cur.rstrip("\n") + "\n" + line).strip("\n")
                P.save()
            return J(self, {"ok": True})
        if p == "/api/quotes/set":
            D.setdefault("settings", {})["quotes"] = (d.get("text") or "").strip("\n")
            P.save()
            return J(self, {"ok": True})
        # ---- the Vault on the stick ----
        if p == "/api/vault/isapp":
            return J(self, {"app": vault.available() and vault.is_app(re.sub(r"[^\w.\-]", "", d.get("book", "")))})
        if p == "/api/vault/books":
            ok = vault.available()
            if not ok and vault.ERROR[0]:
                log("vault reader:", vault.ERROR[0])
            return J(self, {"ok": ok, "books": vault.books() if ok else [], "error": vault.ERROR[0], "files": len(vault._files())})
        if p == "/api/vault/search":
            q = d.get("q", "")
            res = vault.search(q, only=[d["book"]] if d.get("book") else None, n=int(d.get("n", 8)), mode=d.get("mode", "text"))
            for r in res[:15]:
                r["snippet"] = vault.snippet(r["book"], r["path"], q)
            return J(self, res)
        if p == "/api/vault/cite":
            return J(self, {"mla": vault.cite(d["book"], d["path"], "mla"), "apa": vault.cite(d["book"], d["path"], "apa"),
                            "title": vault.title_of(d["book"], d["path"])})
        # ---- ask Archie ----
        if p == "/api/ask/history":
            return J(self, D.get("chats", [])[-40:])
        if p == "/api/ask/clear":
            D["chats"] = []
            P.save()
            return J(self, {"ok": True})
        if p == "/api/ask":
            q = (d.get("q") or "").strip()[:2000]
            hist = D.setdefault("chats", [])
            stories, countries = world.related(q) if d.get("world", True) else ([], [])
            if d.get("doc") and d["doc"] in D["notes"]:  # asking about one document or note
                vp, stories, countries = [], [], []
                mine = [(os.path.splitext(os.path.basename(d["doc"]))[0], D["notes"][d["doc"]].get("text", ""))]
            else:
                sq = followup_query(q, hist)
                vp = vault.for_question(sq) if d.get("vault", True) else []
                mine = ai.find_notes(all_notes(D), sq) if d.get("notes", True) else []
            a, src, used = ai.ask(q, hist, mine, stories, countries, vp)
            rec = {"q": q, "a": a, "sources": src, "model": used, "t": store.now()}
            if used:
                hist.append(rec)
                del hist[:-200]
                P.save()
            return J(self, rec)
        # ---- World ----
        if p == "/api/world/news":
            return J(self, world.news(d.get("region", "")))
        if p == "/api/world/refresh":
            return J(self, {"started": world.refresh()})
        if p == "/api/world/govs":
            return J(self, world.govs())
        if p == "/api/world/country":
            return J(self, world.country(d.get("iso", "")) or {"error": "not found"})
        # ---- flashcards ----
        if p == "/api/cards/due":
            due = sorted(store.due_cards(D["cards"]), key=lambda c: c.get("due", 0))
            return J(self, due[:50])
        if p == "/api/cards/grade":
            c = D["cards"].get(d["id"])
            if c:
                store.grade_card(c, int(d.get("q", 2)))
                rv = D.setdefault("stats", {}).setdefault("reviews", {})
                day = time.strftime("%Y-%m-%d")
                rv[day] = rv.get(day, 0) + 1
                for k in sorted(rv)[:-60]:  # keep two months
                    del rv[k]
                P.save()
            return J(self, {"ok": True})
        if p == "/api/cards/add":
            add_card(d.get("front", ""), d.get("back", ""), d.get("deck") or "General", d.get("hint", ""), d.get("fimg"), d.get("bimg"))
            P.save()
            return J(self, {"ok": True})
        if p == "/api/cards/addmany":  # a set made with the Q / A bar
            n = 0
            for c in d.get("cards", [])[:200]:
                if (c.get("front") or c.get("fimg")) and (c.get("back") or c.get("bimg")):
                    add_card((c.get("front") or "").strip()[:2000], (c.get("back") or "").strip()[:4000], (c.get("deck") or d.get("name") or "General").strip()[:60], (c.get("hint") or "").strip(), c.get("fimg"), c.get("bimg"))
                    n += 1
            P.save()
            return J(self, {"made": n})
        if p == "/api/cards/all":  # every card, for editing and deleting
            return J(self, sorted(({k: c.get(k) for k in ("id", "front", "back", "hint", "deck", "due", "reps", "fimg", "bimg")} for c in D["cards"].values()),
                                  key=lambda c: ((c["deck"] or "").lower(), c.get("front") or "")))
        if p == "/api/cards/edit":
            c = D["cards"].get(d.get("id", ""))
            if not c:
                return J(self, {"error": "That card is gone."}, 404)
            for k, n in (("front", 2000), ("back", 4000), ("hint", 400), ("deck", 60)):
                if k in d:
                    v = (d.get(k) or "").strip()[:n]
                    if k == "hint" and not v:
                        c.pop("hint", None)
                    elif v or k == "front" and c.get("fimg") or k == "back" and c.get("bimg"):
                        c[k] = v
            P.save()
            return J(self, {"ok": True})
        if p == "/api/cards/delete":  # one card, a few, or a whole deck
            ids = set(d.get("ids") or [])
            if d.get("deck"):
                ids |= {k for k, c in D["cards"].items() if c.get("deck") == d["deck"]}
            gone = [D["cards"].pop(k) for k in list(ids) if k in D["cards"]]
            P.save()
            return J(self, {"deleted": len(gone)})
        if p == "/api/cards/rename":
            to = (d.get("to") or "").strip()[:60]
            if not to:
                return J(self, {"error": "Give the deck a name."}, 400)
            n = 0
            for c in D["cards"].values():
                if c.get("deck") == d.get("deck"):
                    c["deck"] = to
                    n += 1
            P.save()
            return J(self, {"renamed": n})
        if p == "/api/cards/decks":
            ds = {}
            for c in D["cards"].values():
                ds[c["deck"]] = ds.get(c["deck"], 0) + 1
            return J(self, sorted(ds.items(), key=lambda x: x[0].lower()))
        if p == "/api/define":
            try:
                r = vault.define(d.get("word", ""))
            except Exception as e:
                log("define failed:", repr(e))
                r = None
            return J(self, r or {"error": "No entry for that word." if vault.available() else "The dictionary is in the Vault: plug into your PC to add it."}, 200 if r else 404)
        if p == "/api/curious":
            day = time.strftime("%Y-%m-%d")
            cq = D.get("curious") or {}
            if cq.get("day") != day:
                try:
                    art = vault.curious(day)
                except Exception as e:
                    log("curious failed:", repr(e))
                    art = None
                cq = D["curious"] = {"day": day, "art": art}
                P.save()
            return J(self, cq.get("art") or {})
        if p == "/api/mastery":
            return J(self, mastery(D))
        if p == "/api/search":
            return J(self, search_all(D, d.get("q", ""), d.get("vault", True)))
        # ---- calendar: Archie's countdowns and events, changed here, written back to Archie at the next PC sync ----
        if p in ("/api/cal/list", "/api/cal/save", "/api/cal/del"):  # dates from before this version have no id yet: give them one
            import hashlib
            for x in D.get("deadlines", []):
                if not x.get("id"):
                    dl = x.get("kind") == "deadline"
                    x.update({"id": ("dl-" if dl else "ct-") + hashlib.sha1(f"{x.get('date')}|{x.get('what')}".encode()).hexdigest()[:10],
                              "src": "dl" if dl else "calt", "orig": {"date": x.get("date"), "what": x.get("what")}})
        if p == "/api/cal/list":
            return J(self, {"items": D.get("deadlines", []), "pending": len(D.get("calq", []))})
        if p in ("/api/cal/save", "/api/cal/del"):
            items, q = D.setdefault("deadlines", []), D.setdefault("calq", [])
            it = d.get("item") or {}
            old = next((x for x in items if x.get("id") == it.get("id")), None) if it.get("id") else None
            if p == "/api/cal/del":
                if old:
                    items.remove(old)
                    if old.get("src") == "new":  # never reached Archie: just forget the add
                        q[:] = [c for c in q if c["item"].get("id") != old["id"]]
                    else:
                        q[:] = [c for c in q if c["item"].get("id") != old["id"]]  # an earlier edit is replaced by the delete
                        q.append({"op": "del", "item": old, "t": store.now()})
                P.save()
                return J(self, {"items": items, "pending": len(q)})
            what = " ".join(str(it.get("what", "")).split())[:200]
            date = str(it.get("date", ""))[:10]
            if not what or not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
                return J(self, {"error": "Give it a name and a date."}, 400)
            kind = it.get("kind") if it.get("kind") in ("deadline", "exam", "test", "quiz", "due", "lab", "class", "event") else "event"
            tm = it.get("time") if re.match(r"^\d{2}:\d{2}$", str(it.get("time") or "")) else None
            if old:
                new = {**old, "what": what, "date": date, "kind": kind, "time": tm}
                items[items.index(old)] = new
                if old.get("src") == "new":
                    for c in q:
                        if c["item"].get("id") == old["id"]:
                            c["item"] = new
                else:
                    ch = {"op": "edit", "item": {**new, "orig": old.get("orig"), "src": old.get("src")}, "t": store.now()}
                    prev = next((c for c in q if c["op"] == "edit" and c["item"].get("id") == old["id"]), None)
                    if prev:  # changed twice before a sync: one change, still pointing at Archie's original
                        prev.update(ch)
                    else:
                        q.append(ch)
            else:
                new = {"id": "new-" + store.new_id(), "src": "new", "what": what, "date": date, "kind": kind, "time": tm}
                items.append(new)
                q.append({"op": "add", "item": new, "t": store.now()})
            items.sort(key=lambda x: (x["date"], x.get("time") or "99"))
            P.save()
            return J(self, {"items": items, "pending": len(q), "id": new["id"]})
        if p == "/api/settings/set":  # your name for the greeting, the first-run tour being done
            S_ = D.setdefault("settings", {})
            if "name" in d:
                S_["name"] = (d.get("name") or "").strip()[:40]
            if d.get("toured"):
                S_["toured"] = True
            P.save()
            return J(self, {"ok": True})
        if p == "/api/settings/get":
            S_ = D.get("settings", {})
            return J(self, {"name": S_.get("name", ""), "toured": bool(S_.get("toured")), "version": FEATHER_VERSION, "demo": DEMO})
        if p == "/api/password":
            if P.derive(d.get("old", "")) != P.key:
                return J(self, {"error": "Current password is wrong."}, 403)
            if len(d.get("new", "")) < 6:
                return J(self, {"error": "Use at least 6 characters."}, 400)
            P.change_password(d["new"])
            return J(self, {"ok": True, "note": "Changed. Plug into your PC once so it can re-pair."})
        return J(self, {"error": "Unknown request."}, 404)


def no_password_saving(prof):
    """Feather's window has its own little Edge profile: tell it never to offer to save the password."""
    pref = os.path.join(prof, "Default", "Preferences")
    try:
        os.makedirs(os.path.dirname(pref), exist_ok=True)
        try:
            d = json.load(open(pref, encoding="utf-8"))
        except (OSError, ValueError):
            d = {}
        d["credentials_enable_service"] = False
        d["credentials_enable_autosignin"] = False
        d.setdefault("profile", {})["password_manager_enabled"] = False
        d.setdefault("autofill", {})["profile_enabled"] = False
        d["autofill"]["credit_card_enabled"] = False
        json.dump(d, open(pref, "w", encoding="utf-8"))
    except Exception as e:
        log("password prefs:", repr(e))


def open_window(url):
    for exe in [os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
                os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe")]:
        if os.path.exists(exe):
            prof = os.path.join(os.environ.get("LOCALAPPDATA", tempfile.gettempdir()), "Feather", "Window")
            no_password_saving(prof)
            subprocess.Popen([exe, f"--app={url}", f"--user-data-dir={prof}", "--window-size=1280,820", "--no-first-run",
                              "--disable-features=msEdgePasswordManager,PasswordManagerOnboarding,AutofillServerCommunication"])
            return
    webbrowser.open(url)


EJECT_PS = r"""
Wait-Process -Id __PID__ -Timeout 30 -ErrorAction SilentlyContinue
Get-Process llama-server -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
function Say($title, $text, $kind) {
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information
    $n.Visible = $true
    $n.ShowBalloonTip(8000, $title, $text, $kind)
    Start-Sleep -Seconds 8
    $n.Dispose()
}
$gone = $false
for ($try = 0; $try -lt 3 -and -not $gone; $try++) {
    (New-Object -ComObject Shell.Application).Namespace(17).ParseName('__DRIVE__').InvokeVerb('Eject')
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        if (-not (Test-Path '__DRIVE__\')) { $gone = $true; break }
    }
}
if ($gone) { Say 'Feather' 'Safe to unplug. Toss it in your bag.' 'Info' }
else { Say 'Feather' 'Could not eject. Close any File Explorer window open on the stick, then use the eject button in the taskbar.' 'Warning' }
"""


def eject():
    """Save, lock, stop everything running off the stick, then have Windows eject it once this app has exited."""
    time.sleep(0.5)  # let the page get its answer first
    if P.data is not None:
        P.save()
        P.lock()
        BOOKS.clear()
        IDX.clear()
    ai.stop()
    try:
        os.remove(INUSE)
    except OSError:
        pass
    drive = os.path.splitdrive(ROOT)[0]
    if sys.platform == "win32" and drive:
        # the helper runs from the laptop's temp folder (not the stick), waits for this app to close, ejects,
        # waits until the stick is really gone, then shows a Windows notification either way
        ps = EJECT_PS.replace("__PID__", str(os.getpid())).replace("__DRIVE__", drive)
        path = os.path.join(tempfile.gettempdir(), "feather-eject.ps1")
        open(path, "w", encoding="utf-8-sig").write(ps)
        subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", path],
                         cwd=tempfile.gettempdir(), creationflags=0x08000000)
    os._exit(0)


def watchdog(server):
    while True:
        time.sleep(5)
        try:
            os.utime(INUSE)  # tells the PC sync Feather is open right now
        except OSError:
            pass
        if P.data is not None and time.time() - last_action[0] > IDLE_LOCK:
            P.save()
            P.lock()
            BOOKS.clear()
            IDX.clear()
        if bye_at[0] and time.time() - bye_at[0] > 8:  # the window was closed
            log("window closed, shutting down")
            break
        if time.time() - last_ping[0] > 900:  # no sign of the window for 15 min (Windows slows hidden windows, so be patient)
            log("no window for 15 min, shutting down")
            break
    if P.data is not None:
        P.save()
        P.lock()
        BOOKS.clear()
        IDX.clear()
    ai.stop()
    try:
        os.remove(INUSE)
    except OSError:
        pass
    server.shutdown()


def refresh_autostart():
    """If this laptop has autostart on, keep its watcher current: newest version, Feather names (an Archie Pocket one is replaced)."""
    if sys.platform != "win32" or DEMO:
        return
    import shutil
    local = os.environ.get("LOCALAPPDATA", "")
    startup = os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs\Startup")
    mine, vbs = os.path.join(local, "Feather", "watch.ps1"), os.path.join(startup, "Feather Autostart.vbs")
    old_vbs = os.path.join(startup, "Archie Pocket Autostart.vbs")
    new = os.path.join(APP, "watch.ps1")
    kill = ("Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*ArchiePocket\\watch.ps1*' -or $_.CommandLine -like '*Feather\\watch.ps1*' }"
            " | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }")
    try:
        moved = False
        if os.path.exists(old_vbs):  # autostart was on under the old name: carry it over
            os.remove(old_vbs)
            moved = True
        if not (moved or os.path.exists(vbs)):
            return
        if not moved and os.path.exists(mine) and open(mine, "rb").read() == open(new, "rb").read():
            return
        os.makedirs(os.path.dirname(mine), exist_ok=True)
        shutil.copy(new, mine)
        with open(vbs, "w") as f:
            f.write(f'CreateObject("WScript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{mine}""", 0\r\n')
        subprocess.run(["powershell", "-NoProfile", "-Command", kill], creationflags=0x08000000, timeout=30, cwd=tempfile.gettempdir())
        subprocess.Popen(["wscript", vbs], cwd=tempfile.gettempdir())
        shutil.rmtree(os.path.join(local, "ArchiePocket"), ignore_errors=True)
        shutil.rmtree(os.path.join(local, "ArchiePocketWindow"), ignore_errors=True)
        log("autostart watcher updated" + (" (moved from Archie Pocket)" if moved else ""))
    except Exception as e:
        log("autostart refresh failed:", repr(e))


def app_version():
    m = 0
    for r, _, files in os.walk(APP):
        for f in files:
            if f.endswith((".py", ".js", ".css", ".html", ".ps1")):
                m = max(m, os.path.getmtime(os.path.join(r, f)))
    return str(int(m))


VERSION = app_version()


def stop_other_copies():
    """Any other Feather running from this stick (an old version left open) is closed, and its model with it."""
    if sys.platform != "win32":
        return
    demo_match = "-like '*--demo*'" if DEMO else "-notlike '*--demo*'"  # the demo and your Feather leave each other alone
    ps = (f"Get-CimInstance Win32_Process | Where-Object {{ $_.ProcessId -ne {os.getpid()} -and ($_.CommandLine -like '*app\\feather.py*' -or $_.CommandLine -like '*app\\pocket.py*') -and $_.CommandLine {demo_match} }}"
          " | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; "
          f"Get-Process llama-server -ErrorAction SilentlyContinue | Where-Object {{ $_.Path -like '{ROOT}*' }} | Stop-Process -Force")
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps], creationflags=0x08000000, timeout=30, cwd=tempfile.gettempdir())
    except Exception as e:
        log("stop old copies:", repr(e))


def main():
    log("start", sys.version.split()[0], "model:", ai.status())
    threading.Thread(target=refresh_autostart, daemon=True).start()
    try:  # already open and up to date? -> just show that window again. An older copy still running gets replaced.
        if time.time() - os.path.getmtime(INUSE) < 15:
            port = int(open(INUSE).read().split()[1])
            import urllib.request
            try:
                v = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/api/version", timeout=3).read()).get("v")
            except Exception:
                v = None
            if v == VERSION:
                open_window(f"http://127.0.0.1:{port}/")
                return
            log("an older Feather was still running (", v, "), replacing it with", VERSION)
    except (OSError, IndexError, ValueError):
        pass
    stop_other_copies()
    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    port = srv.server_address[1]
    open(INUSE, "w").write(f"{os.getpid()} {port}")
    threading.Thread(target=watchdog, args=(srv,), daemon=True).start()
    if "--no-window" not in sys.argv:
        open_window(f"http://127.0.0.1:{port}/")
    print(f"Feather on http://127.0.0.1:{port}/", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
