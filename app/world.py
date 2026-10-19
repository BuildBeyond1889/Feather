"""World in Feather: news and governments.

- The snapshot (world/snapshot.json.gz) is copied from Archie World on your PC every time you sync:
  ranked stories from the last 3 days, and every country's leaders and cabinet.
- When the laptop is online, "refresh" pulls the same news feeds live and groups matching headlines.
Public news only, so it's kept unencrypted on the stick."""
import email.utils, gzip, html, json, os, re, threading, time, urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WDIR = os.path.join(ROOT, "world")
SNAP = os.path.join(WDIR, "snapshot.json.gz")
LIVE = os.path.join(WDIR, "live.json")
FLAGS = os.path.join(WDIR, "flags")

_snap = {"mtime": 0, "data": None}
_live = {"at": 0, "items": [], "state": "idle", "ok": 0, "failed": 0}
_lock = threading.Lock()


def snapshot():
    try:
        m = os.path.getmtime(SNAP)
    except OSError:
        return None
    if m != _snap["mtime"]:
        with gzip.open(SNAP, "rt", encoding="utf-8") as f:
            _snap["data"] = json.load(f)
        _snap["mtime"] = m
    return _snap["data"]


def _load_live():
    if not _live["at"] and os.path.exists(LIVE):
        try:
            _live.update(json.load(open(LIVE, encoding="utf-8")))
            _live["state"] = "idle"
        except Exception:
            pass


# ---------- live feeds ----------
def _txt(el, *names):
    for n in names:
        x = el.find(n)
        if x is not None and (x.text or "").strip():
            return x.text.strip()
    return ""


def _strip(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def _date(s):
    if not s:
        return 0
    try:
        return int(email.utils.parsedate_to_datetime(s).timestamp())
    except Exception:
        pass
    try:
        from datetime import datetime
        return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())
    except Exception:
        return 0


def parse_feed(text):
    text = re.sub(r"^[^<]+", "", text)
    root = ET.fromstring(text.encode("utf-8"))
    A, R, DC = "{http://www.w3.org/2005/Atom}", "{http://purl.org/rss/1.0/}", "{http://purl.org/dc/elements/1.1/}"
    out = []
    for it in list(root.iter("item")) or list(root.iter(R + "item")):
        out.append({"title": _strip(_txt(it, "title", R + "title")), "url": _txt(it, "link", R + "link", "guid"),
                    "t": _date(_txt(it, "pubDate", DC + "date")), "summary": _strip(_txt(it, "description", R + "description"))[:300]})
    if not out:
        for en in root.iter(A + "entry"):
            link = next((l.get("href", "") for l in en.findall(A + "link") if l.get("rel", "alternate") == "alternate"), "")
            out.append({"title": _strip(_txt(en, A + "title")), "url": link, "t": _date(_txt(en, A + "published", A + "updated")),
                        "summary": _strip(_txt(en, A + "summary", A + "content"))[:300]})
    return [o for o in out if o["title"]]


def _pull(src):
    req = urllib.request.Request(src["url"], headers={"User-Agent": "Mozilla/5.0 (Feather)"})
    with urllib.request.urlopen(req, timeout=12) as r:
        items = parse_feed(r.read().decode("utf-8", "ignore"))
    for i in items:
        i["source"] = src.get("name", "")
    return items


def refresh():
    """Pull the feeds live (background). Returns at once; poll status()."""
    snap = snapshot() or {}
    sources = [s for s in snap.get("sources", []) if s.get("url")]
    if not sources or _live["state"] == "pulling":
        return False

    def run():
        _live["state"] = "pulling"
        got, ok, bad = [], 0, 0
        with ThreadPoolExecutor(8) as ex:
            for res in ex.map(lambda s: _safe(s), sources):
                if res is None:
                    bad += 1
                else:
                    ok += 1
                    got += res
        cut = time.time() - 48 * 3600
        got = [g for g in got if not g["t"] or g["t"] > cut]
        with _lock:
            _live.update({"at": int(time.time()), "items": got, "state": "done", "ok": ok, "failed": bad})
        try:
            os.makedirs(WDIR, exist_ok=True)
            json.dump({k: _live[k] for k in ("at", "items", "ok", "failed")}, open(LIVE, "w", encoding="utf-8"))
        except OSError:
            pass
    threading.Thread(target=run, daemon=True).start()
    return True


def _safe(s):
    try:
        return _pull(s)
    except Exception:
        return None


# ---------- grouping ----------
STOP = set("the a an and or of to in on at for with from by as is are was were be after over amid says say said new us".split())


def toks(t):
    return {w for w in re.findall(r"[a-z0-9']{3,}", t.lower()) if w not in STOP}


def group(items):
    """Headlines that share most of their words become one story; more sources = ranked higher."""
    stories = []
    for it in sorted(items, key=lambda x: -(x["t"] or 0)):
        tk = toks(it["title"])
        best, bs = None, 0.0
        for s in stories:
            j = len(tk & s["tk"]) / (len(tk | s["tk"]) or 1)
            if j > bs:
                best, bs = s, j
        if best and bs >= 0.3:
            if it["source"] not in {x["source"] for x in best["items"]}:
                best["items"].append(it)
            best["tk"] |= tk
        else:
            stories.append({"title": it["title"], "t": it["t"], "items": [it], "tk": set(tk)})
    for s in stories:
        s["n"] = len(s["items"])
        del s["tk"]
    stories.sort(key=lambda s: (-min(s["n"], 6), -(s["t"] or 0)))
    return stories


def news(region=""):
    _load_live()
    snap = snapshot()
    pc = (snap or {}).get("stories", [])
    if region:
        pc = [s for s in pc if (s.get("region") or "") == region]
    return {"pc": pc[:150], "pc_at": (snap or {}).get("at", 0), "regions": sorted({s.get("region") for s in (snap or {}).get("stories", []) if s.get("region")}),
            "live": group(_live["items"])[:80] if _live["items"] else [], "live_at": _live["at"], "state": _live["state"],
            "ok": _live["ok"], "failed": _live["failed"], "has_sources": bool((snap or {}).get("sources"))}


def govs():
    snap = snapshot() or {}
    L = [{k: c.get(k) for k in ("iso2", "name", "label", "hos", "hog")} for c in snap.get("govs", []) if c.get("name")]
    return {"at": snap.get("at", 0), "list": sorted(L, key=lambda c: c["name"].lower())}


def country(iso):
    for c in (snapshot() or {}).get("govs", []):
        if c.get("iso2") == iso:
            return c
    return None


# ---------- for Ask Archie ----------
def related(question, n=5):
    """Stories and countries that match a question, as context for the model."""
    q = toks(question)
    if not q:
        return [], []
    snap = snapshot() or {}
    pool = [("PC snapshot", s) for s in snap.get("stories", [])] + [("live", s) for s in (group(_live["items"]) if _live["items"] else [])]
    scored = []
    for where, s in pool:
        k = len(q & toks(s["title"] + " " + " ".join(i.get("title", "") for i in s.get("items", [])[:3])))
        if k >= 2 or (k == 1 and len(q) <= 2):
            scored.append((k, s.get("n", 1), where, s))
    scored.sort(key=lambda x: (-x[0], -x[1]))
    ql = question.lower()
    cs = [c for c in snap.get("govs", []) if c.get("name") and re.search(r"\b" + re.escape(c["name"].lower()) + r"\b", ql)][:2]
    return [(w, s) for _, _, w, s in scored[:n]], cs
