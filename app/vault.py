"""The Vault: offline Wikipedia, textbooks and references (Kiwix .zim files) on the stick.

The files are copied from Archie's Vault on the PC by the sync, into <stick>\\Feather\\vault.
Reading them needs libzim (copied into lib by the sync). Public material, so it isn't encrypted."""
import html as H, os, re, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VDIR = os.path.join(ROOT, "vault")

# friendly names and shelves for the files on the list (matched by name prefix)
SHELVES = [
    ("wikipedia_en_all_mini", "Wikipedia", "Knowledge"),
    ("wiktionary_en-simple", "Simple Wiktionary", "Knowledge"),
    ("theworldfactbook", "CIA World Factbook", "Knowledge"),
    ("libretexts.org_en_math", "LibreTexts Math", "Study"),
    ("libretexts.org_en_phys", "LibreTexts Physics", "Study"),
    ("libretexts.org_en_eng", "LibreTexts Engineering", "Study"),
    ("libretexts.org_en_stats", "LibreTexts Statistics", "Study"),
    ("wikipedia_en_computer", "Wikipedia: Computing", "Study"),
    ("opendatastructures", "Open Data Structures", "Study"),
    ("freecodecamp_en_all", "freeCodeCamp", "Study"),
    ("devdocs_en_", "DevDocs", "Code"),
    ("robotics.stackexchange", "Robotics Q&A", "Projects"),
    ("arduino.stackexchange", "Arduino Q&A", "Projects"),
    ("raspberrypi.stackexchange", "Raspberry Pi Q&A", "Projects"),
    ("wikipedia_en_medicine", "Wikipedia: Medicine", "Health"),
    ("nhs.uk_en_medicines", "NHS Medicines", "Health"),
    ("wikem", "WikEM (emergency medicine)", "Health"),
]
ASK_FIRST = ("wikipedia_en_all_mini", "theworldfactbook", "wikipedia_en_computer", "wikipedia_en_medicine", "libretexts")

_open = {}
_lock = threading.Lock()


ERROR = [""]


def available():
    try:
        import libzim.reader  # noqa: F401
        ERROR[0] = ""
        return os.path.isdir(VDIR)
    except Exception as e:  # e.g. a missing DLL on this laptop
        ERROR[0] = f"{type(e).__name__}: {e}"
        return False


def _files():
    try:
        return sorted(f for f in os.listdir(VDIR) if f.endswith(".zim"))
    except OSError:
        return []


def _label(fn):
    for pre, name, shelf in SHELVES:
        if fn.startswith(pre):
            if pre == "devdocs_en_":
                lang = fn[len(pre):].rsplit("_", 1)[0]
                return f"DevDocs: {lang.replace('-', ' ').title()}", shelf
            return name, shelf
    return fn.rsplit("_", 1)[0], "Other"


def _arch(bid):
    fn = bid + ".zim"
    with _lock:
        got = _open.get(fn)
        if got:
            return got
        from libzim.reader import Archive
        a = Archive(os.path.join(VDIR, fn))
        _open[fn] = (a, threading.Lock())
        return _open[fn]


def books():
    out = []
    for fn in _files():
        name, shelf = _label(fn)
        out.append({"id": fn[:-4], "name": name, "shelf": shelf, "size": os.path.getsize(os.path.join(VDIR, fn))})
    order = ["Knowledge", "Study", "Code", "Projects", "Health", "Other"]
    out.sort(key=lambda b: (order.index(b["shelf"]), b["name"]))
    return out


def _entry(a, path):
    e = a.get_entry_by_path(path)
    hops = 0
    while e.is_redirect and hops < 5:
        e = e.get_redirect_entry()
        hops += 1
    return e


def text_of(html_bytes):
    s = bytes(html_bytes).decode("utf-8", "ignore") if isinstance(html_bytes, (bytes, memoryview)) else html_bytes
    s = re.sub(r"(?is)<head.*?</head>", " ", s)
    s = re.sub(r"(?is)<(script|style|nav|footer|table)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"(?i)<br\s*/?>|</p>|</h\d>|</li>|</div>", "\n", s)
    s = H.unescape(re.sub(r"<[^>]+>", " ", s))
    s = re.sub(r"\[\d+\]", "", s)
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    return re.sub(r"\n\s*\n+", "\n\n", s).strip()


def _passage(text, q, size=700):
    low = text.lower()
    ph = _keyphrase(q)
    if ph and len(ph.split()) > 1 and ph in low:
        i = max(0, low.index(ph) - size // 3)
        return text[i:i + size].strip()
    words = [w for w in re.findall(r"[a-z0-9]{3,}", q.lower())][:8]
    best, bi = -1, 0
    for i in range(0, max(1, len(text) - size + 1), 200):
        sc = sum(low.count(w, i, i + size) for w in words)
        if sc > best:
            best, bi = sc, i
    return text[bi:bi + size].strip()


STOP = set("""a an the and or but of to in on at for with from by as is are was were be been being this that these those it its into than then
which who whom whose what when where why how not no can could should would will do does did done just also about there their they them
very more most some such only other i me my you your we our he she his her tell explain describe define meaning mean between
difference work works get expand elaborate him it its go on else more detail details summary summarize""".split())


def queries(q):
    """The search index wants every word to match, so try the question's key words, then fewer of them."""
    words = [w for w in re.findall(r"[A-Za-z0-9'+#.-]+", q) if w.lower().strip(".'") not in STOP and len(w) > 1]
    from itertools import combinations
    out = [" ".join(words)] if words else []
    for k in range(len(words) - 1, 0, -1):  # drop words: every combination, longer words first
        combos = sorted(combinations(words, k), key=lambda c: -sum(len(w) for w in c))
        out += [" ".join(c) for c in combos]
    seen, res = set(), []
    for x in out:
        if x and x not in seen:
            seen.add(x)
            res.append(x)
    return res[:8] or [q]


def search(q, only=None, n=8, mode="text"):
    """[{book, name, path, title, snippet}] across the Vault (or the books in `only`)."""
    q = " ".join((q or "").split())[:200]
    if not q or not available():
        return []
    from libzim.search import Query, Searcher
    from libzim.suggestion import SuggestionSearcher
    out = []
    for b in (only or [x["id"] for x in books()]):
        try:
            a, lk = _arch(b)
            with lk:
                paths = []
                if mode == "text" and a.has_fulltext_index:
                    for qq in queries(q):
                        paths = list(Searcher(a).search(Query().set_query(qq)).getResults(0, n))
                        if paths:
                            break
                if not paths:
                    paths = list(SuggestionSearcher(a).suggest(q).getResults(0, n))
                hits = []
                for p in paths:
                    try:
                        e = _entry(a, p)
                        hits.append((e.path, e.title))
                    except Exception:
                        continue
        except Exception:
            continue
        name = _label(b + ".zim")[0]
        for rank, (p, t) in enumerate(hits):
            out.append({"book": b, "name": name, "path": p, "title": t, "rank": rank})
    # interleave books by rank so one big library doesn't bury the rest; titles that match the query rise
    ql = q.lower()
    out.sort(key=lambda r: (0 if r["title"].lower() == ql else 1, r["rank"], 0 if ql in r["title"].lower() else 1))
    return out[: n * 3]


def snippet(book, path, q, size=260):
    try:
        return _passage(article_text(book, path), q, size)
    except Exception:
        return ""


def article_text(book, path, limit=60000):
    a, lk = _arch(book)
    with lk:
        it = _entry(a, path).get_item()
        if "html" not in it.mimetype:
            return ""
        return text_of(bytes(it.content)[:limit * 3])[:limit]


def raw(book, path):
    """(mimetype, bytes) for anything in a book: pages, pictures, styles."""
    a, lk = _arch(book)
    with lk:
        if not path:
            it = a.main_entry.get_item() if a.has_main_entry else None
            if it is None:
                return None
            return "redirect", it.path
        e = a.get_entry_by_path(path)
        if e.is_redirect:
            return "redirect", _entry(a, path).path
        it = e.get_item()
        return it.mimetype, bytes(it.content)


DARK = b"""<style id="feather">
@font-face{font-family:"Croissant One";src:url(/fonts/CroissantOne.woff2) format("woff2")}
@font-face{font-family:Newsreader;font-weight:400;src:url(/fonts/Newsreader-400-normal.woff2) format("woff2")}
@font-face{font-family:Newsreader;font-weight:400;font-style:italic;src:url(/fonts/Newsreader-400-italic.woff2) format("woff2")}
@font-face{font-family:Newsreader;font-weight:500 700;src:url(/fonts/Newsreader-500-normal.woff2) format("woff2")}
:root{--bg:#0c0d0b;--ink:#e8ecdf;--soft:#a7af9e;--line:#262a22;--acc:#c6f432;--code:#141612;--fs:19px}
:root[data-theme=sepia]{--bg:#f1e7d0;--ink:#3b2f22;--soft:#6b5a45;--line:#ddcfb2;--acc:#8a5a12;--code:#e8dcc0}
:root[data-theme=paper]{--bg:#fbfaf6;--ink:#1d1d1b;--soft:#4a4a45;--line:#e6e3da;--acc:#3e6b00;--code:#f0eee6}
html,body{background:var(--bg)!important;color:var(--ink)!important;transition:background .3s,color .3s}
body{font-family:Newsreader,Georgia,serif;font-size:var(--fs);line-height:1.7;max-width:680px;margin:0 auto;padding:36px 28px 80px}
a{color:var(--acc)!important}h1,h2,h3,h4{color:var(--ink)!important;font-weight:500;border-color:var(--line)!important;line-height:1.2}
h1{font-family:"Croissant One",Georgia,serif;font-weight:400;font-size:2.1em}
table,th,td,div,section,.infobox,.thumb,.thumbinner{background:transparent!important;color:inherit!important;border-color:var(--line)!important}
img{max-width:100%;height:auto}:root:not([data-theme]) img,:root[data-theme=dark] img{filter:brightness(.92)}
pre,code{background:var(--code)!important;color:var(--ink)!important;white-space:pre-wrap;font-size:.85em}
p.dropcap::first-letter{float:left;font-family:"Croissant One",Georgia,serif;font-size:3.7em;line-height:.86;padding:6px 10px 0 0;color:var(--acc)}
</style>"""


_APP = {}


def is_app(book):
    """Some books (freeCodeCamp, LibreTexts, PhET...) are small web apps that need JavaScript and their own layout."""
    if book not in _APP:
        try:
            a, lk = _arch(book)
            with lk:
                e = a.main_entry
                while e.is_redirect:
                    e = e.get_redirect_entry()
                html = bytes(e.get_item().content)[:20000]
            _APP[book] = bool(re.search(rb'<script[^>]+type="module"|<div id="app"', html))
        except Exception:
            _APP[book] = False
    return _APP[book]


def page(book, path):
    r = raw(book, path)
    if r is None:
        return None
    mt, body = r
    if mt == "redirect":
        return r
    if "html" in mt and not is_app(book):
        body = re.sub(rb"(?i)</head>", DARK + b"</head>", body, count=1) if re.search(rb"(?i)</head>", body) else DARK + body
    return mt, body


def title_of(book, path):
    try:
        a, lk = _arch(book)
        with lk:
            return _entry(a, path).title
    except Exception:
        return path


def cite(book, path, style="mla"):
    name = _label(book + ".zim")[0]
    title = title_of(book, path)
    m = re.search(r"_(\d{4})-(\d{2})", book)
    year = m.group(1) if m else ""
    today = time.strftime("%d %b. %Y")
    site = {"Wikipedia": "Wikipedia, The Free Encyclopedia"}.get(name.split(":")[0], name)
    if style == "apa":
        return f"{title}. ({year or 'n.d.'}). In *{site}*. Offline copy via Kiwix."
    return f"\"{title}.\" *{site}*, {year + ', ' if year else ''}offline copy via Kiwix. Accessed {today}."


def _keyphrase(q):
    """The question's core, e.g. 'who was the 32nd president' -> '32nd president'."""
    words = [w for w in re.findall(r"[A-Za-z0-9'+#.-]+", q) if w.lower().strip(".'") not in STOP]
    return " ".join(words).strip(" ?.!").lower()


def for_question(q, n=3):
    """The best few passages for Ask Archie, from the reference books first.
    A page only counts if it's actually about the question: most of the key words have to appear in it,
    the main subject has to be there, and pages holding the whole key phrase ('32nd president') win."""
    if not available():
        return []
    words = [w.lower().strip(".'") for w in re.findall(r"[A-Za-z0-9'+#.-]+", q) if w.lower().strip(".'") not in STOP and len(w) > 2]
    if not words:
        return []
    caps = [w.lower() for w in re.findall(r"\b[A-Z][a-zA-Z'-]{2,}", q) if w.lower() not in STOP]
    subject = (caps or sorted(words, key=len, reverse=True))[:2]
    need = max(1, -(-len(words) * 2 // 3))  # at least two thirds of the key words
    phrase = _keyphrase(q)
    ref = [b["id"] for b in books() if b["id"].startswith(ASK_FIRST)]
    cands, seen = [], set()
    for h in search(q, only=ref or None, n=10)[:24] + (search(phrase, only=ref or None, n=4, mode="title")[:6] if phrase else []):
        if (h["book"], h["path"]) not in seen:
            seen.add((h["book"], h["path"]))
            cands.append(h)
    scored = []
    for h in cands:
        try:
            txt = article_text(h["book"], h["path"])
        except Exception:
            continue
        if not txt:
            continue
        t, body = h["title"].lower(), txt[:20000].lower()
        has = lambda w: re.search(r"\b" + re.escape(w), body) is not None or w in t
        cover = sum(1 for w in words if has(w))
        if cover < need or not all(has(s) for s in subject):
            continue
        whole = 1 if phrase and len(phrase.split()) > 1 and phrase in re.sub(r"\s+", " ", body[:6000]) else 0  # the exact phrase near the top
        lead = 1 if whole and phrase in body[:600] else 0  # ...in the opening lines: this page is ABOUT it
        in_title = sum(1 for w in words if w in t)
        scored.append((lead * 4 + whole * 3 + in_title + cover * 0.5 - h["rank"] * 0.05, h, txt))
    if not scored:
        return []
    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[0][0]
    keep = [s for s in scored if s[0] >= top * 0.55][:n]  # drop the weak tail that only confuses the model
    return [{**h, "passage": _passage(txt, q, 1100)} for _, h, txt in keep]


def quick_titles(q, limit=6, budget=0.9):
    """Fast title matches for Ctrl+K: the main books first, stop when time runs out."""
    import time as _t
    if not available():
        return []
    t0, out = _t.time(), []
    ids = [b["id"] for b in books()]
    order = sorted(ids, key=lambda b: (0 if b.startswith(ASK_FIRST) else 1 if b.startswith(("wikipedia", "devdocs", "freecodecamp", "libretexts")) else 2, b))
    from libzim.suggestion import SuggestionSearcher
    for b in order:
        if _t.time() - t0 > budget or len(out) >= limit * 2:
            break
        try:
            a, lk = _arch(b)
            with lk:
                for p in SuggestionSearcher(a).suggest(q).getResults(0, 3):
                    e = _entry(a, p)
                    out.append({"book": b, "path": e.path, "title": e.title, "name": _label(b + ".zim")[0]})
        except Exception:
            continue
    ql = q.lower()
    out.sort(key=lambda r: (0 if r["title"].lower() == ql else 1 if r["title"].lower().startswith(ql) else 2))
    return out[:limit]


def _dict_book():
    return next((b["id"] for b in books() if b["id"].startswith("wiktionary")), None)


def define(word):
    """A word's meanings from Simple Wiktionary in the Vault: {word, senses:[{pos, defs[]}], book, path} or None."""
    if not available():
        return None
    w = re.sub(r"[^\w'-]", "", (word or "").strip())[:40]
    book = _dict_book()
    if not w or not book:
        return None
    a, lk = _arch(book)
    html = path = None
    with lk:
        for cand in dict.fromkeys([w, w.lower(), w.capitalize(), "A/" + w, "A/" + w.lower()]):
            try:
                e = _entry(a, cand)
                html, path = bytes(e.get_item().content).decode("utf-8", "ignore"), e.path
                break
            except Exception:
                continue
        if html is None:  # plurals, -ing, -ed: let the index find the base word
            try:
                from libzim.suggestion import SuggestionSearcher
                hits = list(SuggestionSearcher(a).suggest(w.lower()).getResults(0, 1))
                if hits:
                    e = _entry(a, hits[0])
                    html, path = bytes(e.get_item().content).decode("utf-8", "ignore"), e.path
            except Exception:
                pass
    if html is None:
        return None
    POS = ("Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Interjection", "Phrase", "Determiner", "Abbreviation", "Contraction", "Prefix", "Suffix")
    senses, pos = [], None
    for m in re.finditer(r"(?is)<h[2-4][^>]*>(.*?)</h[2-4]>|<ol[^>]*>(.*?)</ol>", html):
        if m.group(1) is not None:
            t = text_of(m.group(1)).strip()
            pos = next((x for x in POS if t.lower().startswith(x.lower())), pos)
        elif pos:
            items = re.findall(r"(?is)<li[^>]*>(.*?)</li>", re.sub(r"(?is)<(ul|dl)[^>]*>.*?</\1>", " ", m.group(2)))  # examples under a sense go
            defs = []
            for it in items:
                it = re.sub(r"(?is)<(ul|ol|dl)[^>]*>.*?</\1>", " ", it)  # drop example lists under each sense
                t = re.sub(r"\s+", " ", text_of(it)).strip()
                if t:
                    defs.append(t[:300])
            if defs:
                senses.append({"pos": pos, "defs": defs[:4]})
                pos = None
    if not senses:
        txt = text_of(html)
        senses = [{"pos": "", "defs": [txt[:400]]}] if txt else []
    title = re.search(r"(?is)<title>(.*?)</title>", html)
    return {"word": text_of(title.group(1)).strip() if title else w, "senses": senses[:4], "book": book, "path": path}


def curious(seed):
    """One article for the day from the encyclopedia: {book, path, title, teaser} (the same all day)."""
    import random
    if not available():
        return None
    book = next((b["id"] for b in books() if b["id"].startswith("wikipedia_en_all")), None) or next((b["id"] for b in books() if b["id"].startswith("wikipedia")), None)
    if not book:
        return None
    a, lk = _arch(book)
    rnd = random.Random(seed)
    for _ in range(25):
        with lk:
            try:
                e = a._get_entry_by_id(rnd.randrange(a.all_entry_count)) if hasattr(a, "_get_entry_by_id") else a.get_random_entry()
                while e.is_redirect:
                    e = e.get_redirect_entry()
                it = e.get_item()
                if "html" not in it.mimetype:
                    continue
                title, path, html = e.title, e.path, bytes(it.content)
            except Exception:
                continue
        txt = text_of(html)
        lead = next((p.strip() for p in txt.split("\n") if len(p.strip()) > 160), "")
        if lead and not re.search(r"(?i)^(list of|index of)|disambiguation", title + lead[:80]):
            return {"book": book, "path": path, "title": title, "teaser": re.sub(r"\s+", " ", lead)[:260].rsplit(" ", 1)[0] + "…"}
    return None
