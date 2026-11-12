"""Feather hub: the PC keeps the master copy of Feather so every laptop (and the stick) stays the same.

Archie answers the laptops (the same sealed connection Archie Lite uses, port 47321) and hands Feather's
requests to this file. The stick's sync (feather_sync.py) uses it directly when the stick is plugged in.

D:\\Feather\\hub\\<feather id>\\
    data\\feather.enc, data\\paper, data\\ideas, data\\readings   the master copy, encrypted like the stick
    versions\\<hash>.enc                                          recent versions, so each laptop's changes merge three-way
    hist\\<page>\\<hash>.enc                                       recent versions of each Paper page, for stroke merges
    hub.enc                                                        who synced when, and what changed (for "From the Surface")
Everything here is encrypted with the Feather key; the PC opens it with the key it keeps for the stick (Windows DPAPI).
"""
import base64, json, os, re, socket, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)
APP = os.path.join(BASE, "app")
ROOT = os.path.join(BASE, "hub")


def _mods():
    """Feather's own modules, without letting their folder shadow Archie's (this file also runs inside Archie)."""
    for d in (HERE, APP):
        if d not in sys.path:
            sys.path.append(d)
    import store as st, fsync as fs, feather_sync as fsy
    nc = os.path.normcase
    sys.path[:] = [p for p in sys.path if nc(p) not in (nc(HERE), nc(APP))] + [HERE, APP]  # feather_sync put app\ first: back to the end
    return st, fs, fsy


store, fsync, fsy = _mods()
from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # noqa: E402

PAGE = re.compile(r"^paper/[0-9a-f]{12}\.enc$")
KEEP_VERSIONS = 40
KEEP_PAGE = 8
REFRESH_EVERY = 20 * 60   # notes and books from Obsidian
VOICE_OK = re.compile(r"en-(GB|IE|AU|US)-[A-Za-z]+Neural|accent:[a-z_]{2,30}")   # Microsoft's voices, or an accent voice (made overnight)
ACC_NAMES = {"irish_woman": "Irish woman", "irish_man": "Irish man", "londoner": "Londoner"}


def _talking():
    """Talk is open in Archie: it gets the graphics card to itself."""
    m = sys.modules.get("archie_cool")
    try:
        return bool(m and m.STATE.get("talk"))
    except Exception:
        return False


def _gaming():
    """A game has the screen (Archie's archie_cool says so): accent chapters, which use the graphics card, wait."""
    m = sys.modules.get("archie_cool")
    try:
        return bool(m and m.game())
    except Exception:
        return False


def night_now():
    """The overnight window, when accent voices may use the graphics card (Archie's model is asleep then)."""
    h = time.localtime().tm_hour
    return 1 <= h < 7
SONIA_IN = os.path.join(BASE, "sonia_in")   # Sonia audio asked for in Archie on the PC (one .json each)
NOTES_IN = os.path.join(BASE, "notes_in")   # notes Archie sends to Feather's quick notes (one .json each)
INCOMING = os.path.join(BASE, "incoming")   # files Archie (or the phone) sends to Feather's Reading: moved into the notes folder at the next refresh
EXPORT_EVERY = 5 * 60     # Feather's folder in Obsidian


def log(*a):
    try:
        fsy.log("hub:", *a)
    except Exception:
        pass


class FileLock:
    """One hub, two processes (Archie for the laptops, the stick sync): one at a time."""

    def __init__(self, path):
        self.path = path

    def __enter__(self):
        end = time.time() + 90
        while True:
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, str(os.getpid()).encode())
                os.close(fd)
                return self
            except FileExistsError:
                try:
                    if time.time() - os.path.getmtime(self.path) > 120:  # left behind by a crash
                        os.remove(self.path)
                        continue
                except OSError:
                    pass
                if time.time() > end:
                    raise TimeoutError("the hub is busy")
                time.sleep(0.2)

    def __exit__(self, *a):
        try:
            os.remove(self.path)
        except OSError:
            pass


class Hub:
    def __init__(self, root=ROOT):
        self.root = root
        self.tlock = threading.RLock()
        self.uploads = {}
        self._exporting = False
        self._ph_t, self._ph_busy = 0.0, False
        self._sq, self._sbusy, self._scur, self._serr = [], False, None, ""   # Sonia audio being made
        self._nq, self._nbusy = [], False                                       # accent-voice chapters waiting for the night

    # ----- keys -----
    def key(self, sid):
        paired = fsy.load(fsy.PAIRED, {})
        if sid not in paired:
            return None
        try:
            return fsy.unprotect(base64.b64decode(paired[sid]))
        except Exception:
            return None

    # ----- from Archie (a laptop) -----
    def hello(self):
        """For the phone, before it has the key: which Feather this is and the salt its key is made with (not a secret)."""
        out = []
        try:
            names = os.listdir(self.root)
        except OSError:
            names = []
        for n in names:
            try:
                m = json.load(open(os.path.join(self.root, n, "open.json"), encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if m.get("id") == n and self.key(n):
                out.append({"sid": n, "salt": m.get("salt"), "seen": os.path.getmtime(os.path.join(self.root, n, "hub.enc")) if os.path.exists(os.path.join(self.root, n, "hub.enc")) else 0})
        return {"ok": True, "feathers": sorted(out, key=lambda x: -x["seen"]), "pc": socket.gethostname()}

    def handle(self, msg):
        if msg.get("act") == "hello":
            return self.hello()
        sid = re.sub(r"[^0-9a-f]", "", str(msg.get("sid") or ""))[:64]
        key = self.key(sid) if sid else None
        if not key:
            return {"ok": False, "why": "nohub"}
        try:
            inner = fsync.unbox(key, msg.get("box") or "")
        except Exception:
            return {"ok": False, "why": "key"}
        try:
            out = self.inner(sid, key, inner)
        except TimeoutError:
            out = {"why": "busy"}
        return {"ok": True, "box": fsync.box(key, out)}

    # ----- the requests -----
    def inner(self, sid, key, req):
        act = req.get("act")
        if act == "ask":  # answered by Archie, outside the lock so syncs keep going while it thinks
            return self._ask(req)
        d = os.path.join(self.root, sid)
        os.makedirs(d, exist_ok=True)
        with self.tlock, FileLock(os.path.join(d, ".lock")):
            if act == "sync":
                return self._sync(sid, key, d, req)
            if act == "drop":
                return self._drop(d, req)
            if act == "put":
                return self._put(key, d, req)
            if act == "get":
                return self._get(key, d, req)
            if act == "appget":
                return self._appget(req)
            if act == "audio":
                return self._audio(d, req)
        return {"why": "unknown request"}

    # ----- pieces -----
    def _open(self, key, d):
        P = store.Stick(d)
        if not P.exists:
            P.unlock(key=key)  # an empty master: the first device to sync fills it
        elif not P.unlock(key=key):
            raise PermissionError("key")
        return P

    def _meta(self, key, d):
        try:
            raw = open(os.path.join(d, "hub.enc"), "rb").read()
            return json.loads(AESGCM(key).decrypt(raw[:12], raw[12:], b"feather-hub"))
        except (OSError, ValueError, Exception):
            return {"clients": {}, "log": [], "holders": {}}

    def _save_meta(self, key, d, meta):
        nonce = os.urandom(12)
        tmp = os.path.join(d, "hub.enc.tmp")
        open(tmp, "wb").write(nonce + AESGCM(key).encrypt(nonce, json.dumps(meta, ensure_ascii=False).encode("utf-8"), b"feather-hub"))
        os.replace(tmp, os.path.join(d, "hub.enc"))

    def _version(self, key, d, h):
        if not h or not re.fullmatch(r"[0-9a-f]{32}", str(h)):
            return None
        try:
            return fsync.unbox(key, open(os.path.join(d, "versions", h + ".enc"), encoding="ascii").read(), b"feather-version")
        except (OSError, ValueError, Exception):
            return None

    def _keep_version(self, key, d, h, data, meta):
        vd = os.path.join(d, "versions")
        os.makedirs(vd, exist_ok=True)
        f = os.path.join(vd, h + ".enc")
        if not os.path.exists(f):
            open(f, "w", encoding="ascii").write(fsync.box(key, data, b"feather-version"))
        inuse = {c.get("base") for c in meta.get("clients", {}).values()} | {h}
        olds = sorted((os.path.getmtime(os.path.join(vd, x)), x) for x in os.listdir(vd) if x.endswith(".enc"))
        for _, x in olds[:-KEEP_VERSIONS]:
            if x[:-4] not in inuse:
                try:
                    os.remove(os.path.join(vd, x))
                except OSError:
                    pass

    def _files(self, d):
        out = {}
        for sc in ("paper", "ideas", "readings"):
            p = os.path.join(d, "data", sc)
            if not os.path.isdir(p):
                continue
            for fn in os.listdir(p):
                rel = f"{sc}/{fn}"
                if fsync.REL_OK.match(rel):
                    out[rel] = fsync.sha(open(os.path.join(p, fn), "rb").read())
        return out

    def _gc(self, d, data):
        """Pages of deleted notebooks and files taken off the idea board."""
        pages = {pg.get("id") for nb in (data.get("paper") or {}).get("nbs", {}).values() for pg in nb.get("pages", [])}
        fids = set((data.get("ideafiles") or {}).keys())
        for sc, keep in (("paper", lambda fn: fn.startswith("a") and len(fn) == 17 or fn[:-4] in pages), ("ideas", lambda fn: fn[:-4] in fids)):
            p = os.path.join(d, "data", sc)
            if not os.path.isdir(p):
                continue
            for fn in os.listdir(p):
                if fn.endswith(".enc") and not keep(fn):
                    try:
                        os.remove(os.path.join(p, fn))
                    except OSError:
                        pass

    def _cards(self, D, key, d):
        """Flashcard sets you asked to move between Archie and Feather (send / get / request), and what each side
        shows about the other's sets. Returns True when D changed."""
        archie = self._archie()
        if not archie:
            return False
        try:
            import cardlink
        except ImportError:
            return False

        def save_backup(name, cards):
            bd = os.path.join(d, "card-backups")
            os.makedirs(bd, exist_ok=True)
            fn = time.strftime("%Y%m%d-%H%M%S") + "-" + re.sub(r"[^A-Za-z0-9]+", "-", name)[:40] + ".enc"
            open(os.path.join(bd, fn), "w", encoding="ascii").write(fsync.box(key, {"deck": name, "cards": cards}, b"feather-cardbak"))
            olds = sorted(os.listdir(bd))
            for x in olds[:-80]:
                try:
                    os.remove(os.path.join(bd, x))
                except OSError:
                    pass
            return fn

        def load_backup(fn):
            p = os.path.join(d, "card-backups", os.path.basename(fn))
            return fsync.unbox(key, open(p, encoding="ascii").read(), b"feather-cardbak")
        try:
            return cardlink.Link(archie, log).run(D, save_backup, load_backup)
        except Exception as e:
            log("cards failed:", repr(e))
            return False

    def _pc_side(self, meta, M, H, key=None, d=None):
        """What only the PC can do: calendar changes into Archie and fresh dates. Notes and books are the PC's."""
        if meta.get("rready"):
            for k in fsync.PC_OWNED:
                if k in H:
                    M[k] = H[k]
        archie = self._archie()
        if archie:
            self._phone_extras(archie)
            if M.get("calq"):
                try:
                    fsy.apply_calendar_changes(archie, M["calq"])
                    M["calq"] = []
                except Exception as e:
                    log("calendar changes failed:", repr(e))
            try:
                M["deadlines"] = fsy.archie_deadlines(archie)
            except Exception as e:
                log("deadlines failed:", repr(e))
            try:
                w = self._world_top(archie)
                if w is not None:
                    M["world"] = w
            except Exception as e:
                log("world failed:", repr(e))
            if key is not None:
                self._cards(M, key, d)
                self._notes(M, archie, d)
        if key is not None:
            self._jots_in(M)
            try:
                self._sonia(M, key, d, archie)
            except Exception as e:
                log("sonia failed:", repr(e))
        return M

    # ----- Sonia audio: chapters read by Sonia, made here, played offline on the phone and laptops -----
    def _sonia(self, M, key, d, archie):
        S = M.get("sonia") if isinstance(M.get("sonia"), dict) else {}
        before = json.dumps(S, sort_keys=True)
        reqs = S.get("reqs") if isinstance(S.get("reqs"), dict) else {}
        R = M.get("readings") or {}
        try:                                    # asked for in Archie on the PC
            fs = sorted(f for f in os.listdir(SONIA_IN) if f.endswith(".json"))
        except OSError:
            fs = []
        for f in fs:
            p = os.path.join(SONIA_IN, f)
            try:
                q = json.load(open(p, encoding="utf-8"))
                if isinstance(q.get("set"), dict):
                    st = S.get("set") if isinstance(S.get("set"), dict) else {}
                    for k2 in ("speed", "vol"):
                        if isinstance(q["set"].get(k2), (int, float)):
                            st[k2] = float(q["set"][k2])
                    if VOICE_OK.fullmatch(str(q["set"].get("voice") or "")):
                        st["voice"] = q["set"]["voice"]
                    if isinstance(q["set"].get("night"), bool):
                        st["night"] = q["set"]["night"]
                    S["set"] = st
                if q.get("book") or q.get("rid"):
                    rid = q.get("rid") if q.get("rid") in R else None
                    if not rid:
                        w = " ".join(str(q.get("book") or "").lower().split())
                        names = [(k2, " ".join(str(r.get("name") or "").lower().split())) for k2, r in R.items()]
                        rid = next((k2 for k2, n in names if n == w), None) or next((k2 for k2, n in names if w and w in n), None)
                    if rid:
                        reqs[str(q.get("id") or f[:-5])] = {"rid": rid, "from": int(q.get("from") or 0), "to": int(q.get("to") if q.get("to") is not None else 9999),
                                                           "for": [x for x in (q.get("for") or ["phone", "laptops"]) if x in ("phone", "laptops")], "t": time.time(), "by": "pc"}
                        log("sonia: Archie asked for", R[rid].get("name"), q.get("from"), q.get("to"))
                    else:
                        S["err"] = f"No book called “{q.get('book')}” in Feather's Reading."
                os.makedirs(os.path.join(SONIA_IN, "added"), exist_ok=True)
                os.replace(p, os.path.join(SONIA_IN, "added", f))
            except (OSError, ValueError, TypeError) as e:
                log("sonia request failed:", f, repr(e))
        S["reqs"] = reqs
        if archie:
            S["accents"] = self._accents(archie)
            self._night_reqs(S, R, d, M.get("readpos") or {})
        made, want, now_ok = self._audio_made(d), [], set()
        for q in sorted(reqs.values(), key=lambda q: q.get("t", 0)):
            rid = q.get("rid")
            if rid not in R:
                continue
            n = int(R[rid].get("pages") or 0)
            asked = q.get("by") != "night" and not q.get("ahead")      # you asked for it (not the overnight reader / keep-ahead)
            for ch in range(max(0, int(q.get("from") or 0)), min(n - 1, int(q.get("to") if q.get("to") is not None else n - 1)) + 1):
                if ch not in made.get(rid, []) and (rid, ch) not in want:
                    want.append((rid, ch))
                    if asked:
                        now_ok.add((rid, ch))
        st = S.get("set") if isinstance(S.get("set"), dict) else {}
        if want and archie:
            vname = str(st.get("voice") or "en-GB-SoniaNeural")
            vname = vname if VOICE_OK.fullmatch(vname) else "en-GB-SoniaNeural"
            if vname.startswith("accent:") and not any(a["v"] == vname for a in S["accents"]):
                vname = "en-GB-SoniaNeural"           # that accent voice isn't set up on the PC
            with self.tlock:
                have = {(x[2], x[3]) for x in self._sq + self._nq}
                new = [(key, d, rid, ch, archie, vname) for rid, ch in want if (rid, ch) not in have and (rid, ch) != (self._scur or (None, None))[:2]]
                if vname.startswith("accent:"):        # accent voices: what you asked for now, the automatic ones overnight
                    self._sq += [x + (True,) for x in new if (x[2], x[3]) in now_ok]
                    self._nq += [x for x in new if (x[2], x[3]) not in now_ok]
                else:
                    self._sq += new
            self._night_start()
            self._sonia_start()
        S["night_left"] = len(self._nq)
        S["accent_now"] = bool(self._scur and str(getattr(self, "_svoice", "")).startswith("accent:"))
        S["made"] = {rid: chs for rid, chs in made.items() if rid in R}
        if archie:   # for Archie's Sonia window: the books in Feather's Reading and how the audio is going
            try:
                body = json.dumps({"books": {k2: {"name": r.get("name") or k2, "pages": r.get("pages", 0)} for k2, r in R.items() if r.get("kind") != "pdf"},
                                   "made": S["made"], "left": len(self._sq) + (1 if self._scur else 0), "err": self._serr,
                                   "set": S.get("set") or {}, "accents": S.get("accents") or [], "night_left": len(self._nq),
                                   "accent_now": bool(self._scur and str(getattr(self, "_svoice", "")).startswith("accent:"))}, sort_keys=True)
                fb = os.path.join(archie, "feather_books.json")
                if not os.path.exists(fb) or open(fb, encoding="utf-8").read() != body:
                    open(fb + ".tmp", "w", encoding="utf-8").write(body)
                    os.replace(fb + ".tmp", fb)
            except OSError:
                pass
        S["left"] = len(self._sq) + (1 if self._scur else 0)
        if self._serr:
            S["err"] = self._serr
        elif not S["left"]:
            S.pop("err", None)
        if json.dumps(S, sort_keys=True) != before:
            M["sonia"] = S

    def _accents(self, archie):
        """The accent voices picked in Archie's audition, offered as Feather chapter voices."""
        out = []
        try:
            cands = json.load(open(os.path.join(archie, "Voice", "accents", "accents.json"), encoding="utf-8")).get("candidates") or {}
            pick = json.load(open(os.path.join(archie, "archie_config.json"), encoding="utf-8")).get("accent_pick") or {}
        except (OSError, ValueError):
            return out
        for vid, sp in pick.items():
            c = next((c for c in cands.get(vid, []) if c.get("sp") == sp), None)
            if c:
                place = (c.get("region") or "").split()[0] if c.get("region") else ""
                out.append({"v": "accent:" + vid, "name": f"{ACC_NAMES.get(vid, vid)}{' (' + place + ')' if place else ''} · offline, made overnight",
                            "ref": os.path.join(archie, "Voice", "accents", c["ref"])})
        return [{"v": a["v"], "name": a["name"]} for a in out] if out else out

    def _accent_ref(self, archie, vname):
        vid = vname.split(":", 1)[1]
        try:
            cands = json.load(open(os.path.join(archie, "Voice", "accents", "accents.json"), encoding="utf-8")).get("candidates") or {}
            sp = (json.load(open(os.path.join(archie, "archie_config.json"), encoding="utf-8")).get("accent_pick") or {}).get(vid)
            c = next(c for c in cands.get(vid, []) if c.get("sp") == sp)
            return os.path.join(archie, "Voice", "accents", c["ref"])
        except (OSError, ValueError, StopIteration):
            return None

    def _night_reqs(self, S, R, d, pos):
        """Overnight reader: from the evening on, the next 3 chapters of each book read in the last 4 days get queued
        (once a night), so they're on the phone and laptops by morning."""
        st = S.get("set") or {}
        if st.get("night") is False:
            return
        lt = time.localtime()
        if not (lt.tm_hour >= 20 or lt.tm_hour < 7):
            return
        night = time.strftime("%Y-%m-%d", time.localtime(time.time() - 8 * 3600))
        mark = os.path.join(d, "night_done.txt")
        try:
            if open(mark).read().strip() == night:
                return
        except OSError:
            pass
        recent = sorted(((p.get("t", 0), rid, int(p.get("ch") or 0)) for rid, p in pos.items()
                         if rid in R and isinstance(p, dict) and time.time() - float(p.get("t") or 0) < 4 * 86400), reverse=True)[:3]
        reqs = S.setdefault("reqs", {})
        for _, rid, ch in recent:
            n = int(R[rid].get("pages") or 0)
            if ch < n:
                reqs["n" + night.replace("-", "") + rid] = {"rid": rid, "from": ch, "to": min(n - 1, ch + 2), "for": ["phone", "laptops"],
                                                          "t": time.time(), "by": "night"}
                log("sonia: overnight reader queued", R[rid].get("name"), "from chapter", ch + 1)
        try:
            open(mark, "w").write(night)
        except OSError:
            pass

    def _night_start(self):
        """At night, the accent-voice chapters move into the queue (one timer, checking every 5 minutes)."""
        if self._nbusy or not self._nq:
            return
        self._nbusy = True

        def run():
            try:
                while self._nq:
                    if night_now():
                        with self.tlock:
                            self._sq += self._nq
                            self._nq = []
                        self._sonia_start()
                        return
                    time.sleep(300)
            finally:
                self._nbusy = False
        threading.Thread(target=run, daemon=True).start()

    def _accent_run(self, cmd, inp, cwd):
        """One accent chapter on the graphics card. Talk (or a game) comes first: the moment it starts, the chapter is
        stopped, which frees the card, and once talk is closed it's made again from the start. Returns its output."""
        start = time.time()
        while True:
            while _talking() or _gaming():
                time.sleep(5)
            self._free_gpu()                     # Ollama lets go of Archie's model first (talk may have loaded it)
            p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                 encoding="utf-8", cwd=cwd, creationflags=0x08004000 if os.name == "nt" else 0)   # no window, below normal
            box = {}
            th = threading.Thread(target=lambda: box.update(out=p.communicate(inp)[0]), daemon=True)
            th.start()
            stopped = False
            while th.is_alive():
                th.join(2)
                if th.is_alive() and (_talking() or _gaming()):
                    p.kill()
                    th.join(10)
                    stopped = True
                    log("sonia: accent chapter paused for talk; it starts again when talk is closed")
                    break
                if time.time() - start > 7200:
                    p.kill()
                    raise subprocess.TimeoutExpired(cmd, 7200)
            if not stopped:
                return box.get("out") or ""

    def _free_gpu(self):
        """Before an accent voice uses the graphics card: Ollama lets go of Archie's model (it reloads when needed)."""
        import urllib.request
        try:
            ps = json.load(urllib.request.urlopen("http://127.0.0.1:11434/api/ps", timeout=5)).get("models") or []
            for m in ps:
                req = urllib.request.Request("http://127.0.0.1:11434/api/generate", data=json.dumps({"model": m["name"], "keep_alive": 0}).encode(),
                                             headers={"Content-Type": "application/json"})
                urllib.request.urlopen(req, timeout=30).read()
        except Exception:
            pass

    def _audio_made(self, d):
        out, base = {}, os.path.join(d, "audio")
        try:
            for rid in os.listdir(base):
                for f in os.listdir(os.path.join(base, rid)):
                    m = re.fullmatch(r"(\d+)\.t\.enc", f)
                    if m and os.path.exists(os.path.join(base, rid, m.group(1) + ".a.enc")):
                        out.setdefault(rid, []).append(int(m.group(1)))
        except OSError:
            pass
        return {k: sorted(v) for k, v in out.items()}

    def _sonia_start(self):
        if self._sbusy:
            return
        self._sbusy = True

        def run():
            import subprocess
            freed = [False]
            try:
                while True:
                    with self.tlock:
                        if not self._sq:
                            self._scur = None
                            return
                        item = self._sq.pop(0)
                        key, d, rid, ch, archie, vname = item[:6]
                        asked = len(item) > 6 and item[6]
                        self._scur, self._svoice = (rid, ch), vname
                    try:
                        raw = open(os.path.join(d, "data", "readings", rid + ".book.enc"), "rb").read()
                        book = json.loads(AESGCM(key).decrypt(raw[:12], raw[12:], b"feather-book"))
                        paras = (book.get("ch") or [])[ch].get("p") or []
                    except (OSError, ValueError, IndexError, Exception) as e:
                        log("sonia: no text for", rid, ch, repr(e))
                        continue
                    if vname.startswith("accent:"):
                        ref = self._accent_ref(archie, vname)
                        py = os.path.join(archie, "Voice", "clone", "env", "Scripts" if os.name == "nt" else "bin", "python.exe" if os.name == "nt" else "python")
                        if not ref or not os.path.exists(py):
                            log("sonia: accent voice not set up, using Sonia for", rid, ch)
                            vname = "en-GB-SoniaNeural"
                        else:
                            if (not night_now() and not asked) or _gaming():   # morning came (or a game is on): tonight
                                with self.tlock:
                                    self._nq.append((key, d, rid, ch, archie, vname))
                                self._night_start()
                                continue
                            try:
                                out = self._accent_run([py, "-s", os.path.join(archie, "archie_accents.py"), "chapter"],
                                                       json.dumps({"paras": paras, "ref": ref}), archie)
                                res = json.loads((out or "").strip().splitlines()[-1])
                            except (OSError, ValueError, IndexError, subprocess.TimeoutExpired) as e:
                                res = {"ok": False, "why": f"accent voice: {type(e).__name__}"}
                            if not res.get("ok"):
                                log("sonia:", rid, ch, res.get("why"), "- making it with Sonia instead")
                                vname = "en-GB-SoniaNeural"
                    py = os.path.join(archie, "Voice", "kokoro", "env", "Scripts" if os.name == "nt" else "bin", "python.exe" if os.name == "nt" else "python")
                    if vname.startswith("accent:"):
                        pass
                    elif not os.path.exists(py):
                        self._serr = "Sonia isn't set up on your PC yet: run Archie\\Tools\\Get Sonia Voice.bat."
                        with self.tlock:
                            self._sq.clear()
                        continue
                    if not vname.startswith("accent:"):
                        try:
                            pr = subprocess.run([py, "-s", os.path.join(HERE, "sonia_render.py")], input=json.dumps({"paras": paras, "voice": vname}),
                                                capture_output=True, text=True, encoding="utf-8", timeout=3600,
                                                creationflags=0x08004000 if os.name == "nt" else 0)   # no window, below-normal priority
                            res = json.loads((pr.stdout or "").strip().splitlines()[-1])
                        except (OSError, ValueError, IndexError, subprocess.TimeoutExpired) as e:
                            res = {"ok": False, "why": f"{type(e).__name__}"}
                    if not res.get("ok"):
                        self._serr = res.get("why") or "Sonia couldn't make that chapter."
                        log("sonia:", rid, ch, self._serr)
                        with self.tlock:          # most likely offline: try again at a later sync
                            self._sq.clear()
                        continue
                    self._serr = ""
                    folder = os.path.join(d, "audio", rid)
                    os.makedirs(folder, exist_ok=True)

                    def put(name, data, aad):
                        nonce = os.urandom(12)
                        open(os.path.join(folder, name + ".tmp"), "wb").write(nonce + AESGCM(key).encrypt(nonce, data, aad))
                        os.replace(os.path.join(folder, name + ".tmp"), os.path.join(folder, name))
                    put(f"{ch}.a.enc", base64.b64decode(res["mp3"]), b"feather-audio")
                    put(f"{ch}.t.enc", json.dumps({"paras": res["paras"], "voice": vname}).encode("utf-8"), b"feather-audiot")
                    log("sonia: made", rid, "chapter", ch + 1)
            finally:
                self._sbusy = False
                self._scur = None
        threading.Thread(target=run, daemon=True).start()

    def _audio(self, d, req):
        """Sonia audio for a device: what's made ("list"), then each file in pieces ("get"). Already encrypted with the key."""
        base = os.path.join(d, "audio")
        if req.get("op") == "list":
            items = {}
            for rid, chs in self._audio_made(d).items():
                for ch in chs:
                    p = os.path.join(base, rid, f"{ch}.a.enc")
                    try:
                        items[f"{rid}/{ch}"] = int(os.path.getmtime(p))
                    except OSError:
                        pass
            return {"items": items}
        m = re.fullmatch(r"([0-9a-f]{6,40})/(\d+)", str(req.get("k") or ""))
        part = "t" if req.get("part") == "t" else "a"
        if not m:
            return {"why": "bad request"}
        p = os.path.join(base, m.group(1), f"{m.group(2)}.{part}.enc")
        try:
            size = os.path.getsize(p)
            off = max(0, int(req.get("off") or 0))
            with open(p, "rb") as f:
                f.seek(off)
                data = f.read(1536 * 1024)
        except OSError:
            return {"why": "gone"}
        return {"data": base64.b64encode(data).decode("ascii"), "total": size, "v": int(os.path.getmtime(p))}

    def _jots_in(self, M):
        """Notes Archie sent (note to feather / Send to Feather on a .md) become quick notes. Each file is used once."""
        try:
            fs = sorted(f for f in os.listdir(NOTES_IN) if f.endswith(".json"))
        except OSError:
            return
        if not fs:
            return
        J = M.get("jots")
        if not isinstance(J, dict):
            J = M["jots"] = {}
        done = os.path.join(NOTES_IN, "added")
        os.makedirs(done, exist_ok=True)
        for f in fs:
            p = os.path.join(NOTES_IN, f)
            try:
                n = json.load(open(p, encoding="utf-8"))
                jid, t = str(n["id"]), float(n.get("t") or time.time())
                if jid not in J and str(n.get("text") or "").strip():
                    J[jid] = {"id": jid, "t": t, "text": str(n["text"]), "link": "", "edited": t, "from": "archie"}
                os.replace(p, os.path.join(done, f))
                log("quick note from Archie:", jid)
            except (OSError, ValueError, KeyError, TypeError) as e:
                log("note from Archie failed:", f, repr(e))

    def _world_top(self, archie):
        """The day's biggest stories from Archie World, for Home on the phone: titles and source counts only.
        Read at most every 20 minutes; None (keep what the phone has) when there is no World or nothing new."""
        import sqlite3
        if time.time() - getattr(self, "_w_t", 0.0) < 1200:
            return getattr(self, "_w_last", None)
        self._w_t = time.time()
        p = os.path.join(archie, "World", "world.db")
        if not os.path.exists(p):
            return None
        db = sqlite3.connect(f"file:{p}?mode=ro", uri=True, timeout=5)
        try:
            rows = db.execute("SELECT title, n_sources, last FROM clusters WHERE last>? ORDER BY n_sources DESC, last DESC LIMIT 8",
                              (time.time() - 24 * 3600,)).fetchall()
        finally:
            db.close()
        if not rows:
            return None
        self._w_last = {"at": int(max(r[2] or 0 for r in rows)), "s": [{"title": r[0], "n": int(r[1] or 1)} for r in rows if r[0]]}
        return self._w_last

    def _phone_extras(self, archie):
        """Archie's banner pictures (phone-sized) and the quotes, for the top of Home on the phone.
        Archie serves them with Feather's phone app (/feather/banners/, /feather/quotes.json). In the background, every 20 minutes."""
        if self._ph_busy or time.time() - self._ph_t < 1200:
            return
        self._ph_t, self._ph_busy = time.time(), True

        def run():
            try:
                phone = os.path.join(BASE, "phone")
                fsy.sync_banners(phone, archie, max_w=1000)
                dst = os.path.join(phone, "banners")
                names = sorted(f for f in os.listdir(dst) if f.lower().endswith(".jpg")) if os.path.isdir(dst) else []
                try:
                    focus = json.load(open(os.path.join(dst, "banners.json"), encoding="utf-8"))
                except (OSError, ValueError):
                    focus = {}
                if os.path.isdir(dst):
                    body = json.dumps({"pictures": names, "focus": focus})
                    lp = os.path.join(dst, "list.json")
                    try:
                        same = open(lp, encoding="utf-8").read() == body
                    except OSError:
                        same = False
                    if not same:
                        open(lp + ".tmp", "w", encoding="utf-8").write(body)
                        os.replace(lp + ".tmp", lp)
                qs, qd = os.path.join(APP, "web", "quotes.json"), os.path.join(phone, "quotes.json")
                if os.path.isfile(qs) and (not os.path.exists(qd) or os.path.getmtime(qd) < os.path.getmtime(qs)):
                    import shutil
                    shutil.copy2(qs, qd + ".tmp")
                    os.replace(qd + ".tmp", qd)
            except Exception as e:
                log("phone pictures failed:", repr(e))
            finally:
                self._ph_busy = False
        threading.Thread(target=run, daemon=True).start()

    def _archie(self):
        try:
            return fsy.find_archie(fsy.load(fsy.SETTINGS, {}))
        except Exception:
            return None

    def _notes(self, M, archie, d):
        """Notes the laptops send to Archie (Shelf › send to Archie): a .md each, an inbox card in Archie."""
        q = M.get("noteq") or {}
        if not q:
            return
        dp = os.path.join(d, "notes_done.json")
        try:
            done = json.load(open(dp, encoding="utf-8"))
        except (OSError, ValueError):
            done = []
        folder = os.path.join(archie, "From Feather")
        os.makedirs(folder, exist_ok=True)
        for k, n in list(q.items()):
            if k not in done:
                name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", str(n.get("name") or "note.md"))[:120] or "note.md"
                stem, ext = os.path.splitext(name)
                path, i = os.path.join(folder, name), 2
                while os.path.exists(path):
                    path, i = os.path.join(folder, f"{stem} ({i}){ext}"), i + 1
                open(path, "w", encoding="utf-8").write(str(n.get("text") or ""))
                with open(os.path.join(archie, "inbox_queue.txt"), "a", encoding="utf-8") as f:
                    f.write(path + "\n")
                done.append(k)
                log(f"laptop note {os.path.basename(path)} -> Archie")
            del q[k]
        json.dump(done[-300:], open(dp, "w", encoding="utf-8"))

    def _ask(self, req):
        """Ask Archie from Feather on the phone. Archie (archie_sync) hands its chat in as ASK."""
        fn = globals().get("ASK")
        if not fn:
            return {"why": "Archie's chat isn't connected yet: restart Archie once"}
        q = " ".join(str(req.get("q") or "").split())[:3000]
        if not q:
            return {"why": "empty question"}
        ctx = str(req.get("ctx") or "")[:300]
        hist = [{"role": "user" if m.get("role") == "user" else "archie", "text": str(m.get("text") or "")[:1500]}
                for m in (req.get("history") or [])[-6:] if isinstance(m, dict)]
        try:
            r = fn((f"({ctx}) " if ctx else "") + q + "  (asked from Feather on my phone)", hist)
        except Exception as e:
            return {"why": f"Archie couldn't answer: {e}"}
        if not r.get("ok"):
            return {"why": r.get("error") or "Archie couldn't answer"}
        return {"answer": r.get("answer") or ""}

    def _drop(self, d, req):
        """A file shared into Feather on the phone, in pieces. Whole: it goes to Archie (an inbox card there:
        file it, or ask about it) or, for a PDF / EPUB / text book, into Feather's Reading on every device."""
        did = re.sub(r"[^0-9a-z]", "", str(req.get("id") or ""))[:24]
        if not did:
            return {"why": "bad file"}
        name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", str(req.get("fname") or "file")).strip().strip(".")[:120] or "file"
        off, total = int(req.get("off") or 0), int(req.get("total") or 0)
        if total > 200 * 1024 * 1024:
            return {"why": "too big"}
        pd = os.path.join(d, "drops")
        os.makedirs(pd, exist_ok=True)
        part = os.path.join(pd, did + ".part")
        have = os.path.getsize(part) if os.path.exists(part) else 0
        if off != have:
            return {"why": "start again", "have": have}
        with open(part, "ab") as f:
            f.write(base64.b64decode(req.get("data") or ""))
        if os.path.getsize(part) < total:
            return {"done": False, "have": os.path.getsize(part)}
        data = open(part, "rb").read()
        if fsync.sha(data) != req.get("fh"):
            os.remove(part)
            return {"why": "damaged on the way"}
        archie = self._archie()
        reading = req.get("dest") == "reading" and name.lower().endswith((".pdf", ".epub", ".txt"))
        folder = INCOMING if reading else (os.path.join(archie, "From Feather") if archie else None)
        if not folder:
            return {"why": "Archie isn't set up on this PC"}
        os.makedirs(folder, exist_ok=True)
        stem, ext = os.path.splitext(name)
        path, n = os.path.join(folder, name), 2
        while os.path.exists(path):
            path, n = os.path.join(folder, f"{stem} ({n}){ext}"), n + 1
        import shutil
        shutil.move(part, path)
        if not reading:
            with open(os.path.join(archie, "inbox_queue.txt"), "a", encoding="utf-8") as f:
                f.write(path + "\n")  # Archie shows its inbox card for it
        log(f"phone file {os.path.basename(path)} -> {'Reading' if reading else 'Archie'}")
        return {"done": True, "saved": os.path.basename(path), "to": "reading" if reading else "archie"}

    def _take_incoming(self, nd):
        """Files waiting in Feather\\incoming go into the notes folder (Added), where Reading picks them up."""
        try:
            fs = [f for f in os.listdir(INCOMING) if os.path.isfile(os.path.join(INCOMING, f))]
        except OSError:
            return 0
        if not fs:
            return 0
        dest = os.path.join(nd, "Added")
        os.makedirs(dest, exist_ok=True)
        for f in fs:
            stem, ext = os.path.splitext(f)
            to, n = os.path.join(dest, f), 2
            while os.path.exists(to):
                to, n = os.path.join(dest, f"{stem} ({n}){ext}"), n + 1
            try:
                os.replace(os.path.join(INCOMING, f), to)
            except OSError:
                import shutil
                shutil.move(os.path.join(INCOMING, f), to)
        log(f"{len(fs)} file(s) added to Reading")
        return len(fs)

    def _refresh(self, P, d, meta):
        """Every 20 minutes: notes, PDFs and books from Feather\\Notes in Obsidian, and Archie's dates.
        Sooner when a file is waiting in Feather\\incoming (sent from Archie or the phone)."""
        cfg = fsy.load(fsy.SETTINGS, {})
        vault = cfg.get("obsidian_vault")
        try:
            waiting = any(os.path.isfile(os.path.join(INCOMING, f)) for f in os.listdir(INCOMING))
        except OSError:
            waiting = False
        if not vault or not os.path.isdir(vault) or (time.time() - meta.get("refreshed", 0) < REFRESH_EVERY and not waiting):
            return False
        try:
            ef = fsy.export_folder(cfg, vault)
            nd = fsy.notes_dir(cfg, vault, ef)
            if waiting:
                self._take_incoming(nd)
            P.data["notes"] = fsy.import_notes(nd, cfg.get("max_note_kb", 200))
            fsy.sync_readings(P, d, nd, cfg)
            archie = self._archie()
            if archie:
                P.data["deadlines"] = fsy.archie_deadlines(archie)
            meta["refreshed"] = time.time()
            meta["rready"] = True
            return True
        except Exception as e:
            meta["refreshed"] = time.time()  # try again later, not on every request
            log("notes refresh failed:", repr(e))
            return False

    def _sync(self, sid, key, d, req):
        host = str(req.get("host") or "?")[:60]
        name = str(req.get("name") or host)[:40]
        meta = self._meta(key, d)
        P = self._open(key, d)
        fresh = not os.path.exists(os.path.join(d, "versions"))
        H = P.data
        if not fresh and self._refresh(P, d, meta):
            P.save()
            self._keep_version(key, d, fsync.shash(H), H, meta)
        if not fresh and req.get("store") is None and self._cards(H, key, d):  # sent from Archie, or Archie's sets changed
            P.save()
            self._keep_version(key, d, fsync.shash(H), H, meta)
        hh = fsync.shash(H)
        cl = meta.setdefault("clients", {}).setdefault(host, {})
        if "since" not in cl:  # a device seen for the first time starts with what happens from now on
            cl["since"] = time.time()
        mine = None
        if req.get("store") is None:
            if req.get("base") == hh:
                M = None
            elif fresh or self._version(key, d, req.get("base")) is None:
                return {"resend": True}
            else:
                M = H
        else:
            L = req["store"]
            sent_h = fsync.shash(L)  # before the PC's own changes (merge_store can hand back L itself)
            B = self._version(key, d, req.get("base")) if req.get("base") else None
            M, kept = fsync.merge_store(B, L, H, name=name)
            M = self._pc_side(meta, M, H, key, d)
            if B is not None:
                entry = fsync.summarize(B, L)
                if entry:
                    self._log(meta, host, name, entry)
                    mine = fsync.news_line(entry)
            if kept:
                log(f"{name}: {kept} clash(es), both versions kept")
        if M is not None:
            mh = fsync.shash(M)
            if mh != hh or fresh:
                P.data = M
                P.save()
                self._gc(d, M)
                self._export_soon(key, d)
            self._keep_version(key, d, mh, M, meta)
            hh = mh
            out_store = None if req.get("store") is not None and sent_h == mh else M
        else:
            self._keep_version(key, d, hh, H, meta)
            out_store = None
        files = self._files(d)
        hold = meta.setdefault("holders", {})
        for rel, h in (req.get("files") or {}).items():
            if files.get(rel) == h:
                x = hold.setdefault(rel, {"h": h, "hosts": []})
                if x["h"] != h:
                    x.update(h=h, hosts=[])
                if host not in x["hosts"]:
                    x["hosts"].append(host)
        for rel in list(hold):
            if rel not in files:
                del hold[rel]
        fb = req.get("fbase") or {}
        head = P.data or {}
        pages = {pg.get("id") for nb in (head.get("paper") or {}).get("nbs", {}).values() for pg in nb.get("pages", [])}
        wanted = lambda rel: (rel.startswith("paper/a") and len(rel) == 23) or (rel.startswith("paper/") and rel[6:18] in pages) \
            or (rel.startswith("ideas/") and rel[6:-4] in (head.get("ideafiles") or {}))
        # changed on that device, or never reached this PC at all (and still part of Feather)
        need = [rel for rel, h in (req.get("files") or {}).items()
                if fsync.REL_OK.match(rel) and not rel.startswith("readings/") and files.get(rel) != h
                and (h != fb.get(rel) or rel not in files) and wanted(rel)]
        clients = meta["clients"]
        since = cl.get("since", 0)
        news = [e for e in meta.get("log", []) if e.get("t", 0) > since and e.get("host") != host]
        cl.update(name=name, seen=time.time(), base=hh, since=time.time(),
                  kind="stick" if host == "stick" else "phone" if req.get("kind") == "phone" else "laptop")
        mt = req.get("meta") or {}
        if mt.get("id") == sid and re.fullmatch(r"[0-9a-f]{16,64}", str(mt.get("salt") or "")):  # so the phone can make the same key
            op = os.path.join(d, "open.json")
            try:
                cur = json.load(open(op, encoding="utf-8"))
            except (OSError, ValueError):
                cur = {}
            if cur != {"id": sid, "salt": mt["salt"]}:
                json.dump({"id": sid, "salt": mt["salt"]}, open(op, "w", encoding="utf-8"))
        if req.get("diag") is not None:  # how that laptop's Feather is doing (version, hotkeys): into sync.log when it changes
            dg = json.dumps(req["diag"], sort_keys=True, ensure_ascii=False)[:600]
            if cl.get("diag") != dg:
                cl["diag"] = dg
                log(f"{name}: {dg}")
        where = {}
        for rel in req.get("watch") or []:
            x = hold.get(rel) or {}
            others = [clients.get(h, {}).get("name") or h for h in x.get("hosts", []) if h != host and clients.get(h, {}).get("kind") != "stick"]
            if others and x.get("h") == (req.get("files") or {}).get(rel):
                where[rel] = others
        app = None
        if req.get("app"):
            man = fsync.app_manifest(APP)
            if fsync.sha(fsync.canon(man).encode()) != req["app"]:
                app = man
        self._save_meta(key, d, meta)
        return {"store": out_store, "h": hh, "files": files, "need": need, "news": news, "mine": mine, "where": where,
                "rready": bool(meta.get("rready")), "app": app, "pc": socket.gethostname(),
                "devices": [{"host": h, "name": c.get("name") or h, "seen": c.get("seen"), "kind": c.get("kind", "laptop")} for h, c in clients.items()]}

    def _log(self, meta, host, name, entry):
        lg = meta.setdefault("log", [])  # each device folds these into its own "From the Surface" card
        lg.append(dict(entry, t=time.time(), host=host, name=name))
        meta["log"] = lg[-300:]

    def _put(self, key, d, req):
        rel = str(req.get("rel") or "")
        if not fsync.REL_OK.match(rel) or rel.startswith("readings/"):
            return {"why": "bad file"}
        host = str(req.get("host") or "?")[:60]
        k = (host, rel)
        part = base64.b64decode(req.get("data") or "")
        off, total = int(req.get("off") or 0), int(req.get("total") or 0)
        if total > 80 * 1024 * 1024:
            return {"why": "too big"}
        buf = self.uploads.get(k) if off else None
        if off and (buf is None or len(buf) != off):
            return {"why": "start again"}
        buf = (buf or bytearray()) + part
        if len(buf) < total:
            self.uploads[k] = buf
            return {"done": False}
        self.uploads.pop(k, None)
        data = bytes(buf)
        if fsync.sha(data) != req.get("fh"):
            return {"why": "damaged on the way"}
        path = os.path.join(d, "data", *rel.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        cur = open(path, "rb").read() if os.path.exists(path) else None
        merged, added = data, None
        if PAGE.match(rel):
            dec = lambda b: json.loads(AESGCM(key).decrypt(b[:12], b[12:], b"feather-paper")).get("strokes", [])
            ls = dec(data)
            bs = None
            if req.get("fbase"):
                hb = self._hist(d, rel, req["fbase"])
                if hb:
                    bs = dec(hb)
            if cur is not None and fsync.sha(cur) != req.get("fbase") and fsync.sha(cur) != req.get("fh"):
                rs = dec(cur)
                ms = fsync.merge_strokes(bs, ls, rs)
                nonce = os.urandom(12)
                merged = nonce + AESGCM(key).encrypt(nonce, json.dumps({"strokes": ms}, separators=(",", ":")).encode(), b"feather-paper")
                log(f"page merged stroke by stroke: {len(ls)} here + {len(rs)} there -> {len(ms)}")
            added = len(ls) - (len(bs) if bs is not None else (len(dec(cur)) if cur is not None else 0))
            self._keep_hist(d, rel, data)
        tmp = path + ".tmp"
        open(tmp, "wb").write(merged)
        os.replace(tmp, path)
        h = fsync.sha(merged)
        if PAGE.match(rel):
            self._keep_hist(d, rel, merged)
        meta = self._meta(key, d)
        hold = meta.setdefault("holders", {})
        hold[rel] = {"h": h, "hosts": [host] if h == req.get("fh") else []}
        if added and added > 0 and (req.get("fbase") or cur is not None):  # a first upload of what was already there isn't news
            pid = rel[6:18]
            P = self._open(key, d)
            nbid, nb = next(((i, n) for i, n in (P.data.get("paper") or {}).get("nbs", {}).items()
                             if any(pg.get("id") == pid for pg in n.get("pages", []))), (None, None))
            P.lock()
            if nb:
                name = (meta.get("clients", {}).get(host) or {}).get("name") or req.get("name") or host
                self._log(meta, host, name, {"paper": {nbid: {"title": nb.get("title") or "Untitled", "strokes": added, "pid": pid}}})
        self._save_meta(key, d, meta)
        return {"done": True, "h": h, "merged": h != req.get("fh")}

    def _hist(self, d, rel, h):
        p = os.path.join(d, "hist", rel[6:18], str(h)[:32] + ".enc")
        try:
            return open(p, "rb").read()
        except OSError:
            return None

    def _keep_hist(self, d, rel, data):
        hd = os.path.join(d, "hist", rel[6:18])
        os.makedirs(hd, exist_ok=True)
        f = os.path.join(hd, fsync.sha(data) + ".enc")
        if not os.path.exists(f):
            open(f, "wb").write(data)
        olds = sorted((os.path.getmtime(os.path.join(hd, x)), x) for x in os.listdir(hd))
        for _, x in olds[:-KEEP_PAGE]:
            try:
                os.remove(os.path.join(hd, x))
            except OSError:
                pass

    def _get(self, key, d, req):
        rel = str(req.get("rel") or "")
        if not fsync.REL_OK.match(rel):
            return {"missing": True}
        path = os.path.join(d, "data", *rel.split("/"))
        if not os.path.isfile(path):
            return {"missing": True}
        b = open(path, "rb").read()
        off, n = int(req.get("off") or 0), min(int(req.get("n") or fsync.CHUNK), fsync.CHUNK)
        h = fsync.sha(b)
        if off + n >= len(b):  # the whole file has gone to that device
            meta = self._meta(key, d)
            x = meta.setdefault("holders", {}).setdefault(rel, {"h": h, "hosts": []})
            if x["h"] != h:
                x.update(h=h, hosts=[])
            host = str(req.get("host") or "?")[:60]
            if host not in x["hosts"]:
                x["hosts"].append(host)
                self._save_meta(key, d, meta)
        return {"data": base64.b64encode(b[off:off + n]).decode(), "total": len(b), "h": h}

    def _appget(self, req):
        rel = str(req.get("rel") or "")
        p = os.path.normpath(os.path.join(APP, *rel.split("/")))
        if ".." in rel or not p.startswith(os.path.normpath(APP)) or not os.path.isfile(p) or os.path.getsize(p) > 5 * 1024 * 1024:
            return {"data": ""}
        return {"data": base64.b64encode(open(p, "rb").read()).decode()}

    # ----- Feather's folder in Obsidian, from the master copy -----
    def _export_soon(self, key, d):
        if self._exporting or time.time() - getattr(self, "_exported", 0) < EXPORT_EVERY:
            return
        self._exporting = True

        def work():
            time.sleep(20)
            try:
                cfg = fsy.load(fsy.SETTINGS, {})
                vault = cfg.get("obsidian_vault")
                if not vault or not os.path.isdir(vault):
                    return
                with self.tlock, FileLock(os.path.join(d, ".lock")):
                    P = self._open(key, d)
                    ef = fsy.export_folder(cfg, vault)
                    fsy.export(P.data, vault, ef)
                    for f in (lambda: fsy.export_jots(P.data, vault, ef, fsy.notes_dir(cfg, vault, ef)), lambda: fsy.export_ideas(P, vault, ef),
                              lambda: fsy.export_paper(P, d, vault, ef)):
                        try:
                            f()
                        except Exception as e:
                            log("export part failed:", repr(e))
                    P.lock()
                self._exported = time.time()
            except Exception as e:
                log("export failed:", repr(e))
            finally:
                self._exporting = False
        threading.Thread(target=work, daemon=True, name="feather-export").start()

    # ----- the stick, plugged into this PC -----
    def sync_stick(self, P, root):
        """Bring the stick and the master copy together (both ways). Returns a line for the pop-up, or None."""
        sid, key = P.meta["id"], P.key
        c = fsync.Client(P, lambda k, inner, timeout=40: self.inner(sid, key, inner), "stick", "the stick", scopes=("paper", "ideas"))
        c.m["unseen"], c.m["dots"] = {}, {}
        if not c.sync_once():
            log("stick:", c.state, c.err)
            return None
        u = c.m.get("unseen") or {}
        c.m["unseen"], c.m["dots"] = {}, {}  # the stick has no home card: the pop-up says it instead
        c.save_meta()
        if u.get("from"):
            return "Laptops → stick: " + fsync.news_line(u)
        return "In step with your laptops"


HUB = Hub()


def handle(msg):
    """Archie calls this for each Feather request from a laptop."""
    return HUB.handle(msg)
