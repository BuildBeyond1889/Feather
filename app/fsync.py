"""Feather everywhere: keeps Feather the same on every laptop, through your PC.

How it works, in short:
  * Each laptop has its own copy of Feather, encrypted the same way as the stick (same password, same key).
  * The PC keeps the master copy (D:\\Feather\\hub). A laptop sends what changed since it last synced;
    the PC merges it with what the other laptops (and the stick) sent, and sends the result back.
  * Merging is three-way: the PC remembers the version each laptop last had, so it can tell
    "you changed this" from "the other laptop changed that". Paper pages merge stroke by stroke,
    so drawing on both laptops loses no ink. Notes, quick notes, flashcards and idea cards edited on
    both before a sync keep both versions.
  * Everything travels encrypted twice: the Feather key (only you, with your password) and the
    Archie Lite pairing key (only your devices). The PC opens it with the key it already keeps for
    the stick, protected by your Windows login.
  * Offline? Changes simply wait in the laptop's own encrypted copy until the PC is reachable.

This one file is used by the laptop (Client + LiteTransport), the PC hub (merge, box) and the stick sync.
"""
import base64, copy, gzip, hashlib, json, os, re, socket, threading, time, urllib.error, urllib.request
from collections import Counter

MISSING = object()

# ---------- hashing ----------
def canon(x):
    return json.dumps(x, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha(b):
    return hashlib.sha256(b).hexdigest()[:32]


def shash(store):
    """The store's fingerprint. "updated" changes on every save, so it isn't part of it."""
    return sha(canon({k: v for k, v in (store or {}).items() if k != "updated"}).encode("utf-8"))


# ---------- the three-way merge ----------
TEXT_KEYS = ("text", "front", "back", "notes", "q", "a", "title")
KEEP_BOTH = {("jots",), ("cards",), ("ideas", "cards")}  # edited on two devices before a sync: keep both versions
TIME_KEYS = ("updated", "synced", "t", "edited", "seen", "started")
PC_OWNED = ("notes", "readings")  # made on the PC from your Obsidian notes folder


class Ctx:
    def __init__(self, name="another laptop", new_id=None):
        self.name = name
        self.new_id = new_id or (lambda: os.urandom(6).hex())
        self.kept_both = 0


def merge3(b, l, r, path=(), ctx=None, prefer="l"):
    """b: the version both sides started from (MISSING when unknown); l: this device's; r: the PC's."""
    ctx = ctx or Ctx()
    if l == r:
        return l
    if b is not MISSING:
        if l == b:
            return r
        if r == b:
            return l
    if isinstance(l, dict) and isinstance(r, dict):
        if "t" in l and "t" in r and isinstance(l.get("t"), (int, float)) and isinstance(r.get("t"), (int, float)):
            prefer = "l" if l["t"] >= r["t"] else "r"  # a record: on a clash, the newer one wins field by field
        return _merge_dict(b if isinstance(b, dict) else MISSING, l, r, path, ctx, prefer)
    if isinstance(l, list) and isinstance(r, list):
        return merge_list(b if isinstance(b, list) else MISSING, l, r, path, ctx, prefer)
    return _scalar(b, l, r, path, ctx, prefer)


def _text_clash(b, l, r):
    for k in TEXT_KEYS:
        lv, rv = l.get(k), r.get(k)
        if lv == rv or not isinstance(lv, str) or not isinstance(rv, str):
            continue
        bv = b.get(k) if isinstance(b, dict) else MISSING
        if bv is MISSING or (lv != bv and rv != bv):
            return True
    return False


def _dup(rec, ctx):
    c = copy.deepcopy(rec)
    nid = ctx.new_id()
    if "id" in c:
        c["id"] = nid
    for k in ("x", "y"):  # an idea card: sit just below and right of the other version
        if isinstance(c.get(k), (int, float)):
            c[k] = c[k] + 36
    ctx.kept_both += 1
    return nid, c


def _merge_dict(b, l, r, path, ctx, prefer):
    out, extra = {}, []
    two_way = b is MISSING
    for k in list(r) + [k for k in l if k not in r]:
        lv, rv = l.get(k, MISSING), r.get(k, MISSING)
        bv = MISSING if two_way else b.get(k, MISSING)
        if lv is MISSING:
            if bv is not MISSING and rv == bv:
                continue  # deleted here, untouched there: deleted
            out[k] = rv
            continue
        if rv is MISSING:
            if bv is not MISSING and lv == bv:
                continue
            out[k] = lv
            continue
        if path in KEEP_BOTH and isinstance(lv, dict) and isinstance(rv, dict) and _text_clash(bv, lv, rv):
            out[k] = rv
            extra.append(_dup(lv, ctx))
            continue
        out[k] = merge3(bv, lv, rv, path + (k,), ctx, prefer)
    for nid, c in extra:
        out[nid] = c
    return out


def _all_ids(lst):
    return all(isinstance(x, dict) and "id" in x and isinstance(x["id"], (str, int)) for x in lst)


def merge_list(b, l, r, path=(), ctx=None, prefer="l"):
    """Lists of records (with ids) merge record by record, keeping order. Anything else (Paper strokes,
    tags, the calendar queue) merges item by item: what this side added or removed since b is applied to r."""
    ctx = ctx or Ctx()
    if l and r and _all_ids(l) and _all_ids(r) and (b is MISSING or _all_ids(b)):
        return _merge_keyed(b, l, r, path, ctx, prefer)
    ls, rs = [canon(x) for x in l], [canon(x) for x in r]
    if b is MISSING:  # never synced: everything from both sides, once
        rc, out = Counter(rs), list(r)
        for x, s in zip(l, ls):
            if rc[s] > 0:
                rc[s] -= 1
            else:
                out.append(x)
        return out
    bs = Counter(canon(x) for x in b)
    removed = bs - Counter(ls)
    left, added = Counter(bs), []
    for x, s in zip(l, ls):
        if left[s] > 0:
            left[s] -= 1
        else:
            added.append((x, s))
    out = []
    for x, s in zip(r, rs):
        if removed[s] > 0:
            removed[s] -= 1
            continue
        out.append(x)
    radded = Counter(rs) - bs  # the other side added the very same thing: once is enough
    for x, s in added:
        if radded[s] > 0:
            radded[s] -= 1
            continue
        out.append(x)
    return out


def _merge_keyed(b, l, r, path, ctx, prefer):
    bm = {x["id"]: x for x in b} if b is not MISSING else None
    lm, rm = {x["id"]: x for x in l}, {x["id"]: x for x in r}
    ids = []
    for x in r:
        i = x["id"]
        if i not in lm and bm is not None and i in bm and canon(rm[i]) == canon(bm[i]):
            continue  # removed here, untouched there
        ids.append(i)
    prev = None
    for x in l:
        i = x["id"]
        if i in rm:
            prev = i
            continue
        if bm is not None and i in bm and canon(lm[i]) == canon(bm[i]):
            continue  # removed there, untouched here
        pos = 0 if prev is None else (ids.index(prev) + 1 if prev in ids else len(ids))
        ids.insert(pos, i)
        prev = i
    out = []
    for i in ids:
        lv, rv = lm.get(i, MISSING), rm.get(i, MISSING)
        bv = bm.get(i, MISSING) if bm is not None else MISSING
        if lv is MISSING:
            out.append(rv)
        elif rv is MISSING:
            out.append(lv)
        elif path in KEEP_BOTH and isinstance(lv, dict) and isinstance(rv, dict) and _text_clash(bv, lv, rv):
            out.append(rv)
            out.append(_dup(lv, ctx)[1])
        else:
            out.append(merge3(bv, lv, rv, path + (i,), ctx, prefer))
    return out


def _scalar(b, l, r, path, ctx, prefer):
    last = path[-1] if path else ""
    nums = all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (l, r))
    if nums and path[:1] == ("stats",):  # review and practice counters: both sides' counts add up
        if isinstance(b, (int, float)) and not isinstance(b, bool):
            return r + l - b
        return max(l, r)
    if nums and last in TIME_KEYS:
        return max(l, r)
    if isinstance(l, str) and isinstance(r, str) and (last in TEXT_KEYS or path == ("settings", "quotes")):
        if l in r:
            return r
        if r in l:
            return l
        if path == ("settings", "quotes"):  # one quote per line: every line from both
            seen, lines = set(), []
            for ln in r.split("\n") + l.split("\n"):
                if ln not in seen:
                    seen.add(ln)
                    lines.append(ln)
            return "\n".join(lines)
        ctx.kept_both += 1
        return f"{r}\n\n— also written on {ctx.name} —\n{l}"
    return l if prefer == "l" else r


def merge_store(base, local, remote, name="another laptop"):
    """The whole Feather store. Returns (merged, how many clashes kept both versions)."""
    ctx = Ctx(name)
    b = base if isinstance(base, dict) else MISSING
    m = merge3(b, local, remote, (), ctx)
    m = m if isinstance(m, dict) else dict(remote)
    m["updated"] = max(int(local.get("updated") or 0), int(remote.get("updated") or 0))
    return m, ctx.kept_both


def merge_strokes(base, local, remote):
    """One Paper page, stroke by stroke."""
    return merge_list(MISSING if base is None else base, local, remote, ("strokes",))


# ---------- boxes: gzip + AES-GCM with the Feather key ----------
def box(key, obj, aad=b"feather-sync-v1"):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nonce = os.urandom(12)
    raw = gzip.compress(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 6)
    return base64.b64encode(nonce + AESGCM(key).encrypt(nonce, raw, aad)).decode()


def unbox(key, s, aad=b"feather-sync-v1"):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    raw = base64.b64decode(s)
    return json.loads(gzip.decompress(AESGCM(key).decrypt(raw[:12], raw[12:], aad)).decode("utf-8"))


# ---------- what changed, in words (for "From the Surface" on the other laptop) ----------
def summarize(b, l):
    """What a device changed since b, by section. Paper strokes are counted where pages arrive (the hub)."""
    if not isinstance(b, dict):
        return {}
    out = {}
    rd = {}
    lb, bb = l.get("books") or {}, b.get("books") or {}
    for bid, bk in lb.items():
        old = bb.get(bid) or {}
        if (bk.get("progress") or {}) != (old.get("progress") or {}) and (bk.get("progress") or {}).get("page"):
            pr = bk["progress"]
            rd["b:" + bid] = {"title": bk.get("title") or "a book", "where": ("ch. " if bk.get("digital") else "p. ") + str(pr.get("page")),
                              "href": "#/read/" + bk["digital"] if bk.get("digital") else "#/book/" + bid}
    lp, bp, readings = l.get("readpos") or {}, b.get("readpos") or {}, l.get("readings") or {}
    for rid, pos in lp.items():
        if pos != bp.get(rid) and isinstance(pos, dict):
            name = (readings.get(rid) or {}).get("name") or "a document"
            if not any(v.get("href") == "#/read/" + rid for v in rd.values()):
                rd["r:" + rid] = {"title": name, "where": "ch. " + str(int(pos.get("ch", 0)) + 1), "href": "#/read/" + rid}
    nm = sum(max(0, len(v or []) - len((b.get("marks") or {}).get(k) or [])) for k, v in (l.get("marks") or {}).items())
    if rd:
        out["reading"] = rd
    if nm:
        out["highlights"] = nm
    lc, bc = l.get("cards") or {}, b.get("cards") or {}
    added = [i for i in lc if i not in bc]
    reviewed = [i for i, c in lc.items() if i in bc and (c.get("reps"), c.get("due")) != (bc[i].get("reps"), bc[i].get("due"))]
    if added or reviewed:
        out["cards"] = {"added": len(added), "reviewed": len(reviewed)}
    lj, bj = l.get("jots") or {}, b.get("jots") or {}
    nj = sum(1 for i, j in lj.items() if j != bj.get(i))
    if nj:
        out["jots"] = nj
    li, bi = l.get("ideas") or {}, b.get("ideas") or {}
    if canon(li.get("cards") or []) != canon(bi.get("cards") or []) or canon(li.get("links") or []) != canon(bi.get("links") or []):
        bic = {canon(c) for c in bi.get("cards") or []}
        out["ideas"] = max(1, sum(1 for c in li.get("cards") or [] if canon(c) not in bic))
    lnb, bnb = (l.get("paper") or {}).get("nbs") or {}, (b.get("paper") or {}).get("nbs") or {}
    newnb = {k: {"title": v.get("title") or "Untitled", "strokes": 0, "new": True} for k, v in lnb.items() if k not in bnb}
    if newnb:
        out["paper"] = newnb
    return out


def add_news(into, entry):
    """Fold one device's changes into a running summary (both are plain dicts)."""
    for k, v in entry.items():
        if k in ("t", "host", "name"):
            continue
        if isinstance(v, int):
            into[k] = into.get(k, 0) + v
        elif k == "paper":
            p = into.setdefault("paper", {})
            for nb, x in v.items():
                y = p.setdefault(nb, {"title": x.get("title"), "strokes": 0})
                y["title"] = x.get("title") or y.get("title")
                y["strokes"] = y.get("strokes", 0) + int(x.get("strokes") or 0)
                if x.get("pid"):
                    y["pid"] = x["pid"]
                if x.get("new"):
                    y["new"] = True
        elif k == "cards":
            c = into.setdefault("cards", {"added": 0, "reviewed": 0})
            c["added"] += int(v.get("added") or 0)
            c["reviewed"] += int(v.get("reviewed") or 0)
        elif k == "reading":
            into.setdefault("reading", {}).update(v)
    return into


# ---------- Archie Lite's sealed envelope (same as lite_proto.py) ----------
LITE_AAD = b"archie-lite-v1"


def lite_seal(key_b64, obj):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    body = dict(obj, _t=time.time(), _id=base64.b64encode(os.urandom(12)).decode())
    nonce = os.urandom(12)
    ct = AESGCM(base64.b64decode(key_b64)).encrypt(nonce, json.dumps(body, ensure_ascii=False).encode("utf-8"), LITE_AAD)
    return json.dumps({"v": 1, "n": base64.b64encode(nonce).decode(), "c": base64.b64encode(ct).decode()}).encode()


def lite_open(key_b64, raw):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    env = json.loads(raw)
    body = json.loads(AESGCM(base64.b64decode(key_b64)).decrypt(base64.b64decode(env["n"]), base64.b64decode(env["c"]), LITE_AAD))
    if abs(time.time() - body.pop("_t", 0)) > 300:
        raise OSError("the PC's answer was too old (is the clock right?)")
    body.pop("_id", None)
    return body


def lite_data_dirs():
    """Where Archie Lite keeps its data on this laptop. Python from the Microsoft Store quietly moves
    %LOCALAPPDATA%\\ArchieLite into its own Packages folder, so both places are looked in."""
    local = os.environ.get("LOCALAPPDATA", "")
    out = [os.path.join(local, "ArchieLite", "data")]
    if os.environ.get("FEATHER_LITE_DATA"):  # where the installer found Archie Lite on this laptop
        out.append(os.environ["FEATHER_LITE_DATA"])
    pk = os.path.join(local, "Packages")
    try:
        for n in os.listdir(pk):
            if n.lower().startswith("pythonsoftwarefoundation.python"):
                out.append(os.path.join(pk, n, "LocalCache", "Local", "ArchieLite", "data"))
    except OSError:
        pass
    return out


def find_pairing(root):
    """Archie Lite's pairing with the PC: from Archie Lite on this laptop, or the copy the installer left."""
    cands = [os.path.join(d, "pairing.json") for d in lite_data_dirs()] + [os.path.join(root, "pairing.json")]
    best = None
    for p in cands:
        try:
            d = json.load(open(p, encoding="utf-8"))
            if d.get("key") and (best is None or d.get("made", 0) > best.get("made", 0)):
                best = d
        except (OSError, ValueError):
            continue
    return best


def lite_addresses():
    """Where Archie Lite on this laptop last reached the PC (its Tailscale address too): Feather tries the same."""
    out = []
    for dd in lite_data_dirs():
        try:
            d = json.load(open(os.path.join(dd, "lite.json"), encoding="utf-8"))
        except (OSError, ValueError):
            continue
        out += [str(d.get("addr") or "")] + [str(a) for a in d.get("pc_addresses") or []]
    return [a for a in out if a]


class LiteTransport:
    """Talks to Archie on the PC (port 47321), at home or anywhere over Tailscale."""

    def __init__(self, root, sid):
        self.root, self.sid = root, sid
        self.addr = None
        self.pc = None

    def _pair(self):
        p = find_pairing(self.root)
        if not p:
            raise PermissionError("pair")
        self.pc = p.get("pc") or "your PC"
        return p

    def _post(self, pair, addr, msg, timeout):
        req = urllib.request.Request(f"http://{addr}/lite", data=lite_seal(pair["key"], msg), method="POST",
                                     headers={"Content-Type": "application/octet-stream"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return lite_open(pair["key"], r.read())

    def _discover(self, pair, timeout=1.5):
        import hmac
        ch = os.urandom(12).hex()
        want = hmac.new(base64.b64decode(pair["key"]), b"archie-lite-hello:" + ch.encode(), hashlib.sha256).hexdigest()
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            s.settimeout(timeout)
            for t in ["255.255.255.255"] + list(pair.get("addresses") or []):
                try:
                    s.sendto(("ARCHIE-LITE-HELLO " + ch).encode(), (t, int(pair.get("discover_port") or 47322)))
                except OSError:
                    pass
            end = time.time() + timeout
            while time.time() < end:
                try:
                    data, a = s.recvfrom(1024)
                    r = json.loads(data)
                except (socket.timeout, ValueError):
                    break
                if r.get("proof") == want:
                    return f"{a[0]}:{int(r.get('port') or 47321)}"
        except OSError:
            pass
        finally:
            s.close()
        return None

    def __call__(self, key, inner, timeout=40):
        pair = self._pair()
        msg = {"op": "feather", "sid": self.sid, "box": box(key, inner)}
        port = pair.get("port") or 47321
        name = str(pair.get("pc") or "").strip().lower()
        tried, why = [], []
        lite = [a if ":" in a else f"{a}:{port}" for a in lite_addresses()]
        for a in [self.addr] + lite + ([f"{name}:{port}"] if name else []) + [f"{x}:{port}" for x in pair.get("addresses") or []] + ["discover"]:
            if not a or a in tried:
                continue
            tried.append(a)
            if a == "discover":
                a = self._discover(pair)
                if not a:
                    why.append("nothing answered on this network")
                    break
            host, _, p = a.rpartition(":")
            try:
                socket.create_connection((host, int(p)), timeout=2.5).close()
            except (OSError, ValueError):
                why.append(f"{a} no answer")
                continue
            try:
                out = self._post(pair, a, msg, timeout)
            except urllib.error.HTTPError as e:
                if e.code == 401:
                    raise PermissionError("lite")
                why.append(f"{a} answered with error {e.code}")
                continue
            except Exception as e:
                why.append(f"{a} {type(e).__name__}: {str(e)[:60]}")
                continue
            self.addr = a
            if not out.get("ok"):
                raise PermissionError(out.get("why") or ("old" if out.get("error") == "unknown request" else "refused"))
            return unbox(key, out["box"])
        raise ConnectionError(f"{self.pc} isn't reachable ({'; '.join(why[-5:]) or 'no address to try'})")


# ---------- the laptop (and the stick) side ----------
SCOPES = ("paper", "ideas", "readings")
REL_OK = re.compile(r"^(paper/a?[0-9a-f]{12,13}\.enc|ideas/f[0-9a-z]{6,16}\.enc|readings/[0-9a-f]{12}(\.book)?\.enc)$")
CHUNK = 3 * 1024 * 1024
STATE_WORDS = {"pair": "not paired with your PC yet", "lite": "Archie Lite's pairing doesn't match the PC",
               "key": "your password changed on another device", "nohub": "your PC hasn't seen this Feather yet: plug the stick in once",
               "off": "offline · changes wait here", "old": "restart Archie on your PC once (it needs the Feather update)",
               "hub": "the PC had a problem with Feather's sync", "busy": "your PC is busy, trying again"}


class Client:
    def __init__(self, P, transport, host, name, scopes=SCOPES, app_dir=None, next_dir=None):
        self.P, self.t, self.host, self.name = P, transport, host, name
        self.scopes, self.app_dir, self.next_dir = scopes, app_dir, next_dir
        self.meta_path = os.path.join(P.data_dir, "sync.json")
        self.lock = threading.Lock()
        self.kick_at = None
        self.stop_ev = threading.Event()
        self.thread = None
        self.hcache = {}
        self.busy = False
        try:
            self.m = json.load(open(self.meta_path, encoding="utf-8"))
        except (OSError, ValueError):
            self.m = {}
        for k, v in (("fbase", {}), ("unseen", {}), ("dots", {}), ("where", {}), ("recent", []), ("devices", []), ("puts", {})):
            self.m.setdefault(k, v)
        self.state = "idle"
        self.err = None
        self.first = True

    # --- bookkeeping ---
    def save_meta(self):
        tmp = self.meta_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.m, f, ensure_ascii=False)
        os.replace(tmp, self.meta_path)

    def files(self):
        out = {}
        for sc in self.scopes:
            d = os.path.join(self.P.data_dir, sc)
            try:
                names = os.listdir(d)
            except OSError:
                continue
            for fn in names:
                rel = f"{sc}/{fn}"
                if not REL_OK.match(rel):
                    continue
                p = os.path.join(d, fn)
                try:
                    st = os.stat(p)
                except OSError:
                    continue
                sig = (st.st_size, st.st_mtime_ns)
                c = self.hcache.get(rel)
                if not c or c[0] != sig:
                    c = (sig, sha(open(p, "rb").read()))
                    self.hcache[rel] = c
                out[rel] = c[1]
        return out

    def _path(self, rel):
        return os.path.join(self.P.data_dir, *rel.split("/"))

    def app_build(self):
        if not self.app_dir:
            return None
        if not getattr(self, "_build", None):  # the app only changes when Feather restarts
            self._build = sha(canon(app_manifest(self.app_dir)).encode())
        return self._build

    # --- one round ---
    def sync_once(self, timeout=40):
        if self.P.data is None or self.P.key is None:
            return False
        with self.lock:
            self.busy = True
            try:
                self._round(timeout)
                self.state, self.err = "ok", None
                self.m["last_ok"] = time.time()
                return True
            except PermissionError as e:
                self.state, self.err = str(e), STATE_WORDS.get(str(e), str(e))
            except (ConnectionError, OSError, urllib.error.URLError) as e:
                self.state, self.err = "off", str(e)[:500]
            except Exception as e:  # never let a sync problem touch the app
                self.state, self.err = "error", f"{type(e).__name__}: {e}"[:200]
            finally:
                self.busy = False
                self.m["last_try"] = time.time()
                try:
                    self.save_meta()
                except OSError:
                    pass
            return False

    def _call(self, inner, timeout=40):
        return self.t(self.P.key, dict(inner, host=self.host, name=self.name), timeout)

    def _round(self, timeout):
        P, m = self.P, self.m
        sent = copy.deepcopy(P.data)
        sh = shash(sent)
        files = self.files()
        req = {"act": "sync", "base": m.get("base"), "store": None if sh == m.get("base") else sent, "files": files,
               "fbase": {k: v for k, v in m["fbase"].items() if k in files}, "watch": [r for r, t in m["puts"].items() if time.time() - t < 3600],
               "app": self.app_build(), "first": self.first, "diag": self._diag(),
               "meta": {"id": (P.meta or {}).get("id"), "salt": (P.meta or {}).get("salt")}}
        r = self._call(req, timeout)
        if r.get("resend"):  # the PC doesn't know the version this laptop started from: send everything
            req["store"] = sent
            r = self._call(req, timeout)
        if r.get("why"):
            raise PermissionError(r["why"])
        if r.get("store") is not None:
            with P._wlock:
                now = P.data
                if now is None:
                    return
                merged, _ = merge_store(sent, now, r["store"], name=self.name)
                now.clear()
                now.update(merged)
            self._backup_daily()
            P.save()
        if r.get("h"):
            m["base"] = r["h"]
        hub = r.get("files") or {}
        # pages and pictures changed here go up (the PC merges pages stroke by stroke)
        merged_up = set()
        for rel in r.get("need") or []:
            if rel not in files or not REL_OK.match(rel):
                continue
            res = self._put(rel, files[rel], m["fbase"].get(rel))
            if res:
                hub[rel] = res["h"]
                if res["h"] == files[rel]:
                    m["fbase"][rel] = files[rel]
                else:
                    merged_up.add(rel)
                m["puts"][rel] = time.time()
        # what the PC has that this laptop doesn't
        files = self.files()
        budget = 48 * 1024 * 1024
        got = []
        order = sorted(hub.items(), key=lambda kv: (kv[0].startswith("readings/"), kv[0]))
        mirror = bool(r.get("rready")) and "readings" in self.scopes  # books are made on the PC: this laptop copies them as they are
        for rel, hh in order:
            lh = files.get(rel)
            if lh == hh:
                m["fbase"][rel] = hh
                continue
            sc = rel.split("/")[0]
            if sc not in self.scopes or (sc == "readings" and not mirror):
                continue
            if lh is not None and lh != m["fbase"].get(rel) and rel not in merged_up and sc != "readings":
                continue  # changed here meanwhile: it goes up next round
            if budget <= 0:
                break
            n = self._get(rel, hh)
            if n is not None:
                budget -= n
                m["fbase"][rel] = hh
                got.append(rel)
        D = P.data or {}
        pages = {pg.get("id") for nb in (D.get("paper") or {}).get("nbs", {}).values() for pg in nb.get("pages", [])}
        used = lambda rel: (rel.startswith("paper/") and rel[6:-4] in pages) or (rel.startswith("ideas/") and rel[6:-4] in (D.get("ideafiles") or {})) \
            or (rel.startswith("paper/a") and len(rel) == 23)
        for rel, lh in files.items():  # gone on the PC, untouched here, and no longer part of Feather: gone here too
            if rel not in hub and not used(rel) and (m["fbase"].get(rel) == lh or (mirror and rel.startswith("readings/"))):
                try:
                    os.remove(self._path(rel))
                except OSError:
                    pass
                m["fbase"].pop(rel, None)
                self.hcache.pop(rel, None)
        m["puts"] = {k: v for k, v in m["puts"].items() if time.time() - v < 3600}
        m["where"] = r.get("where") or {}
        m["devices"] = r.get("devices") or m["devices"]
        m["pc"] = r.get("pc") or m.get("pc")
        if r.get("news"):
            for e in r["news"]:
                add_news(m["unseen"], e)
                m["unseen"].setdefault("from", {})[e.get("host", "?")] = e.get("name") or "another laptop"
                m["unseen"]["t"] = e.get("t")
                for k in ("paper", "reading", "cards", "ideas", "jots"):
                    if e.get(k):
                        m["dots"][k] = m["dots"].get(k, 0) + (len(e[k]) if isinstance(e[k], dict) and k != "cards" else 1)
            m["unseen"]["closed"] = bool(self.first)
            m["recent"] = (m["recent"] + [{"t": e.get("t"), "name": e.get("name"), "dir": "down", "what": news_line(e)} for e in r["news"]])[-12:]
        if r.get("mine"):
            m["recent"] = (m["recent"] + [{"t": time.time(), "name": self.name, "dir": "up", "what": r["mine"]}])[-12:]
        if r.get("app") and self.app_dir and self.next_dir:
            self._app_update(r["app"])
        try:
            self._sonia()
        except Exception:
            pass  # audio comes next round
        self.first = False

    def _sonia(self):
        """Sonia audio asked for "laptops": copied here as the PC makes it (kept encrypted), cleared after 2 weeks unwanted."""
        D = self.P.data or {}
        so, R = D.get("sonia") or {}, D.get("readings") or {}
        want = set()
        for q in (so.get("reqs") or {}).values():
            if not isinstance(q, dict) or "laptops" not in (q.get("for") or []) or q.get("rid") not in R:
                continue
            n = int(R[q["rid"]].get("pages") or 0)
            cur = int((((D.get("readpos") or {}).get(q["rid"])) or {}).get("ch") or 0)
            to = n - 1 if q.get("to") is None else min(n - 1, int(q["to"]))
            for c in range(max(int(q.get("from") or 0), cur - 1), to + 1):
                want.add(f"{q['rid']}/{c}")
        base = os.path.join(self.P.data_dir, "sonia")
        have = self.m.setdefault("sonia", {})
        if want:
            items = self._call({"act": "audio", "op": "list"}).get("items") or {}
            for k in sorted(want):
                if k not in items or (have.get(k) or {}).get("v") == items[k]:
                    continue
                parts = {}
                for part in ("a", "t"):
                    buf, off, total = bytearray(), 0, None
                    while total is None or off < total:
                        r = self._call({"act": "audio", "k": k, "part": part, "off": off}, 120)
                        if r.get("why") or r.get("data") is None:
                            buf = None
                            break
                        b = base64.b64decode(r["data"])
                        buf += b
                        off += len(b)
                        total = r["total"]
                        if not b:
                            break
                    if buf is None:
                        break
                    parts[part] = bytes(buf)
                if len(parts) < 2:
                    continue
                rid, ch = k.split("/")
                os.makedirs(os.path.join(base, rid), exist_ok=True)
                for part, data in parts.items():
                    dst = os.path.join(base, rid, f"{ch}.{part}.enc")
                    open(dst + ".tmp", "wb").write(data)
                    os.replace(dst + ".tmp", dst)
                have[k] = {"v": items[k], "got": time.time()}
        for k, x in list(have.items()):
            if k in want or time.time() - max(x.get("got", 0), x.get("played", 0)) < 14 * 86400:
                continue
            rid, ch = k.split("/")
            for part in ("a", "t"):
                try:
                    os.remove(os.path.join(base, rid, f"{ch}.{part}.enc"))
                except OSError:
                    pass
            have.pop(k, None)

    def _put(self, rel, h, fbase):
        data = open(self._path(rel), "rb").read()
        if sha(data) != h:
            return None  # changed while we looked: next round
        res, off = None, 0
        while True:
            part = data[off:off + CHUNK]
            res = self._call({"act": "put", "rel": rel, "off": off, "total": len(data), "fh": h, "fbase": fbase,
                              "data": base64.b64encode(part).decode()})
            off += len(part)
            if off >= len(data):
                return res if res.get("done") else None

    def _get(self, rel, hh):
        buf, off, total = bytearray(), 0, None
        while total is None or off < total:
            r = self._call({"act": "get", "rel": rel, "off": off, "n": CHUNK})
            if r.get("missing") or r.get("h") != hh:
                return None
            b = base64.b64decode(r["data"])
            buf += b
            off += len(b)
            total = r["total"]
            if not b and off < total:
                return None
        if sha(bytes(buf)) != hh:
            return None
        p = self._path(rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = p + ".sync"
        with open(tmp, "wb") as f:
            f.write(buf)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, p)
        self.hcache.pop(rel, None)
        if self.on_file:
            try:
                self.on_file(rel)
            except Exception:
                pass
        return len(buf)

    on_file = None
    diag = None

    def _diag(self):
        try:
            d = self.diag() if self.diag else None
            if d is not None and os.path.isdir(self.next_dir or ""):
                d["update_waiting"] = sum(len(fs) for _, _, fs in os.walk(self.next_dir))
            return d
        except Exception as e:
            return {"error": repr(e)[:100]}

    def _app_update(self, man):
        """Changed app files are collected in app.next.part and only become app.next once every one has arrived,
        so a restart can never put in half an update (new screens talking to an old Feather)."""
        import shutil
        mine = app_manifest(self.app_dir)
        part = self.next_dir + ".part"
        shutil.rmtree(part, ignore_errors=True)
        got = 0
        for rel, h in man.items():
            if mine.get(rel) == h or not re.fullmatch(r"[\w./ -]+", rel) or ".." in rel:
                continue
            done = os.path.join(self.next_dir, *rel.split("/"))
            if os.path.isfile(done) and sha(open(done, "rb").read()) == h:
                continue  # already waiting from an earlier round
            r = self._call({"act": "appget", "rel": rel})
            b = base64.b64decode(r.get("data") or "")
            if sha(b) != h:
                shutil.rmtree(part, ignore_errors=True)
                return  # try the whole set again next round
            p = os.path.join(part, *rel.split("/"))
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, "wb").write(b)
            got += 1
        if not got:
            return
        if not os.path.isdir(self.next_dir):
            os.replace(part, self.next_dir)
            return
        for r_, _, fs in os.walk(part):
            for fn in fs:
                src = os.path.join(r_, fn)
                dst = os.path.join(self.next_dir, os.path.relpath(src, part))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                os.replace(src, dst)
        shutil.rmtree(part, ignore_errors=True)

    def _backup_daily(self):
        """One copy of this laptop's encrypted store per day (last 7), before anything from the PC lands."""
        d = os.path.join(self.P.data_dir, "backup")
        f = os.path.join(d, time.strftime("feather-%Y-%m-%d.enc"))
        if os.path.exists(f) or not os.path.exists(self.P.file):
            return
        try:
            os.makedirs(d, exist_ok=True)
            import shutil
            shutil.copy2(self.P.file, f)
            for old in sorted(x for x in os.listdir(d) if x.startswith("feather-"))[:-7]:
                os.remove(os.path.join(d, old))
        except OSError:
            pass

    # --- running in the background while Feather is unlocked ---
    def kick(self, delay=8.0):
        t = time.time() + delay
        if self.kick_at is None or t < self.kick_at:
            self.kick_at = t

    def start(self, every=60):
        if self.thread and self.thread.is_alive():
            self.kick(0)
            return
        self.stop_ev.clear()
        self.kick(0)

        def loop():
            nxt = time.time()
            while not self.stop_ev.is_set():
                now = time.time()
                if (self.kick_at is not None and now >= self.kick_at) or now >= nxt:
                    self.kick_at = None
                    self.sync_once()
                    nxt = time.time() + (every if self.state == "ok" else min(every * 2, 180))
                self.stop_ev.wait(1)
        self.thread = threading.Thread(target=loop, daemon=True, name="feather-sync")
        self.thread.start()

    def stop(self, final=True):
        self.stop_ev.set()
        if final:
            self.sync_once(timeout=12)
        self.first = True

    # --- what the window shows ---
    def view(self):
        m = self.m
        files = m.get("fbase") or {}
        waiting = 0
        try:
            waiting = (0 if shash(self.P.data) == m.get("base") else 1) + sum(1 for rel, h in self.files().items()
                                                                          if rel.split("/")[0] != "readings" and files.get(rel) != h)
        except Exception:
            pass
        others = [d for d in m.get("devices") or [] if d.get("host") != self.host]
        return {"on": True, "state": self.state, "err": self.err, "busy": self.busy, "name": self.name, "host": self.host,
                "last_ok": m.get("last_ok"), "last_try": m.get("last_try"), "waiting": waiting, "pc": m.get("pc"),
                "devices": m.get("devices") or [], "laptops": 1 + sum(1 for d in others if d.get("kind", "laptop") == "laptop"),
                "dots": m.get("dots") or {}, "card": m.get("unseen") if (m.get("unseen") or {}).get("from") else None,
                "recent": list(reversed(m.get("recent") or []))[:6]}

    def seen(self, k):
        if self.m["dots"].pop(k, None) is not None:
            self.save_meta()

    def dismiss(self):
        self.m["unseen"] = {}
        self.save_meta()

    def where(self, pid):
        rel = f"paper/{pid}.enc"
        names = (self.m.get("where") or {}).get(rel)
        if names:
            return {"where": "both", "other": names[0]}
        if time.time() - (self.m.get("last_try") or 0) > 4:
            self.kick(0)  # the window is asking: check with the PC whether the other laptop has it yet
        if rel in self.m["puts"] and self.m["fbase"].get(rel) == self.files().get(rel):
            return {"where": "pc", "pc": self.m.get("pc")}
        return {"where": ""}


def news_line(e):
    """One short line for Settings' recent list."""
    bits = []
    for nb in (e.get("paper") or {}).values():
        bits.append(f"{nb.get('title')}" + (f" · {nb['strokes']} strokes" if nb.get("strokes") else " · new"))
    for x in (e.get("reading") or {}).values():
        bits.append(f"{x.get('title')} {x.get('where')}")
    c = e.get("cards") or {}
    if c.get("reviewed"):
        bits.append(f"{c['reviewed']} flashcards reviewed")
    if c.get("added"):
        bits.append(f"{c['added']} new flashcards")
    if e.get("jots"):
        bits.append(f"{e['jots']} quick note{'s' if e['jots'] != 1 else ''}")
    if e.get("ideas"):
        bits.append("idea board")
    return " · ".join(bits[:3]) or "small changes"


def app_manifest(app_dir):
    out = {}
    for r, dirs, fs in os.walk(app_dir):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for fn in fs:
            if fn.endswith((".pyc", ".tmp", ".new")) or ".bak" in fn:
                continue
            p = os.path.join(r, fn)
            rel = os.path.relpath(p, app_dir).replace("\\", "/")
            try:
                out[rel] = sha(open(p, "rb").read())
            except OSError:
                pass
    return out
