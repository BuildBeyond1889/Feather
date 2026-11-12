"""Flashcard sets between Archie and Feather: only when you press send, get or request. Nothing moves on its own.

Archie's sets:   <Archie>\\Study\\<name>.json  (one file per set)
Feather's sets:  the "cards" in Feather's store, grouped by their "deck"
Requests:        from Feather, the store's "cardq"  {id: {"op": "f2a"|"a2f", "deck": name, "t": time}}
                 from Archie,  one small file each in Study\\.feather_outbox\\
                 f2a = Feather's set replaces Archie's copy, a2f = Archie's set replaces Feather's copy.
Links:           Study\\.feather_links   what was moved last, so each side can say "has a newer version"
For Archie:      Study\\.feather_decks   Feather's sets (names, counts, newer or not)
Old copies:      Study\\Backups\\        Archie's set as it was before Feather's replaced it
                 Feather's set as it was goes to the hub (encrypted) through the save_backup the hub passes in.
History:         Study\\.feather_history  every replaced version (last 60), shown in both apps with "put it back".
                 A request {"op": "restore", "hid": ...} puts one back (and what it replaces goes into the history too).
                 A request with "clean": true moves the cards without progress (all new again).

Exams (phase 2): Archie's mock exams live in Study\\Exams\\<id>.json; Feather keeps them in the store's "xexams"
{id: exam} in Archie's own format (questions + attempts). Requests carry "kind": "exam" and "eid". Status for Feather:
"archieexams"; for Archie: Study\\.feather_exams. Old copies go into the same history.

A transfer replaces the whole set on the other side, so there is only ever one copy each side. Card ids
stay the same across trips (Feather "x" <-> Archie "fex", Archie "y" <-> Feather "ary"), so progress follows each card.
"""
import datetime
import hashlib
import json
import os
import re
import time
import uuid

FROM_FEATHER = "Feather"
_SAID = False  # the first look after Archie starts goes in the log


def safe_name(name, max_len=70):
    """The same file name Archie gives a set (archie_study.safe_name)."""
    n = re.sub(r'[<>:"/\\|?*\n\r\t]', " ", str(name)).strip()
    n = re.sub(r"\s+", " ", n)
    return (n[:max_len].rstrip(" .") or "Deck")


def key_of(name):
    return safe_name(name).lower()


def _jload(p, default):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _jsave(p, obj):
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
    os.replace(tmp, p)


def archie_sets(study):
    """{key: (path, set)} for every set file in Archie's Study folder."""
    out = {}
    try:
        names = sorted(os.listdir(study))
    except OSError:
        return out
    for fn in names:
        if not fn.endswith(".json"):
            continue
        p = os.path.join(study, fn)
        d = _jload(p, None)
        if isinstance(d, dict) and isinstance(d.get("cards"), list):
            d.setdefault("name", fn[:-5])
            out[key_of(d["name"])] = (p, d)
    return out


def archie_exams(study):
    """{id: (path, exam)} for Archie's mock exams."""
    out = {}
    d = os.path.join(study, "Exams")
    try:
        names = sorted(os.listdir(d))
    except OSError:
        return out
    for fn in names:
        if fn.endswith(".json"):
            p = os.path.join(d, fn)
            ex = _jload(p, None)
            if isinstance(ex, dict) and isinstance(ex.get("questions"), list):
                ex.setdefault("id", fn[:-5])
                out[str(ex["id"])] = (p, ex)
    return out


def x_hash(ex):
    return hashlib.sha1(json.dumps([ex.get("title"), ex.get("questions"), ex.get("attempts")], sort_keys=True).encode("utf-8")).hexdigest()[:16]


def best_of(ex):
    return max((a.get("score", 0) for a in (ex.get("attempts") or []) if isinstance(a, dict)), default=None)


def deck_of(c):
    return c.get("deck") or "General"


def feather_sets(cards):
    """{key: (name, [cards])} for Feather's sets."""
    out = {}
    for c in (cards or {}).values():
        n = deck_of(c)
        out.setdefault(key_of(n), (n, []))[1].append(c)
    return out


def f_hash(cs):
    rows = sorted([str(c.get("id")), c.get("front") or "", c.get("back") or "", int(c.get("due") or 0), int(c.get("interval") or 0),
                   int(c.get("reps") or 0)] for c in cs)
    return hashlib.sha1(json.dumps(rows).encode("utf-8")).hexdigest()[:16]


def _day_to_epoch(day, fallback):
    try:
        d = datetime.date.fromisoformat(str(day)[:10])
        return int(time.mktime(d.timetuple()))
    except (TypeError, ValueError):
        return fallback


def _epoch_to_day(t):
    try:
        return datetime.date.fromtimestamp(int(t)).isoformat()
    except (TypeError, ValueError, OverflowError, OSError):
        return datetime.date.today().isoformat()


def _clean_f(c, now):
    c.update(due=now, interval=0, ease=2.5, reps=0)
    c.pop("lapses", None)
    return c


def _clean_a(c, today):
    c.update(due=today, interval=0, ease=2.5, reps=0, lapses=0, last=None)
    return c


def a_to_f(ac, deck, now):
    aid = str(ac.get("id") or uuid.uuid4().hex[:10])
    fid = aid[2:] if aid.startswith("fe") and len(aid) > 2 else "ar" + aid
    reps = int(ac.get("reps") or 0)
    c = {"id": fid, "front": str(ac.get("q") or "")[:2000], "back": str(ac.get("a") or "")[:4000], "deck": str(deck)[:60],
         "due": _day_to_epoch(ac.get("due"), now) if (reps or ac.get("last")) else now,
         "interval": int(ac.get("interval") or 0), "ease": float(ac.get("ease") or 2.5), "reps": reps, "t": now}
    if ac.get("lapses"):
        c["lapses"] = int(ac["lapses"])
    if ac.get("hint"):
        c["hint"] = str(ac["hint"])[:400]
    return c


def f_to_a(fc, today):
    fid = str(fc.get("id") or uuid.uuid4().hex[:10])
    aid = fid[2:] if fid.startswith("ar") and len(fid) > 2 else "fe" + fid
    reps = int(fc.get("reps") or 0)
    q = fc.get("front") or ("(a picture card: open it in Feather)" if fc.get("fimg") else "")
    a = fc.get("back") or ("(a picture: open it in Feather)" if fc.get("bimg") else "")
    c = {"id": aid, "q": q, "a": a, "source": FROM_FEATHER, "created": today,
         "due": _epoch_to_day(fc.get("due")) if reps else today,
         "interval": int(fc.get("interval") or 0), "ease": float(fc.get("ease") or 2.5), "reps": reps,
         "lapses": int(fc.get("lapses") or 0), "last": _epoch_to_day(fc.get("t")) if reps else None}
    if fc.get("hint"):
        c["hint"] = str(fc["hint"])[:400]
    return c


class Link:
    """Moves sets between Archie's Study folder and a Feather store (a dict with "cards")."""

    def __init__(self, archie_dir, log=print):
        self.study = os.path.join(archie_dir, "Study")
        self.outbox = os.path.join(self.study, ".feather_outbox")
        self.links_p = os.path.join(self.study, ".feather_links")
        self.decks_p = os.path.join(self.study, ".feather_decks")
        self.done_p = os.path.join(self.study, ".feather_done")
        self.hist_p = os.path.join(self.study, ".feather_history")
        self.bdir = os.path.join(self.study, "Backups")
        self.log = log

    # ----- requests ------------------------------------------------------------------
    def archie_requests(self):
        out = []
        try:
            names = sorted(os.listdir(self.outbox))
        except OSError:
            return out
        for fn in names:
            if fn.endswith(".json"):
                r = _jload(os.path.join(self.outbox, fn), None)
                if isinstance(r, dict) and (r.get("op") in ("a2f", "f2a") and (r.get("deck") or r.get("eid")) or r.get("op") == "restore" and r.get("hid")):
                    out.append((fn, dict(r, id=r.get("id") or fn[:-5])))
        return out

    def pending(self):
        return bool(self.archie_requests())

    def run(self, D, save_backup=None, load_backup=None):
        """Carry out Feather's and Archie's requests on store D, then refresh each side's view.
        Returns True when D changed."""
        if not os.path.isdir(self.study):
            return False
        changed = False
        done = _jload(self.done_p, [])
        seen = set(done)
        reqs = [(None, dict(r, id=k)) for k, r in sorted((D.get("cardq") or {}).items(), key=lambda kv: kv[1].get("t", 0))]
        reqs += self.archie_requests()
        for fn, r in reqs:
            rid = str(r.get("id"))
            if rid not in seen:
                seen.add(rid)
                done.append(rid)
                try:
                    if r.get("kind") == "exam":
                        changed |= self.exam(D, r, save_backup, load_backup)
                    elif r["op"] == "a2f":
                        changed |= self.a2f(D, r["deck"], save_backup, clean=bool(r.get("clean")))
                    elif r["op"] == "f2a":
                        self.f2a(D, r["deck"], clean=bool(r.get("clean")))
                    else:
                        changed |= self.restore(D, str(r["hid"]), save_backup, load_backup)
                except Exception as e:
                    self.log("cards: couldn't move", repr(r.get("deck") or r.get("hid")), repr(e))
            if fn:
                try:
                    os.remove(os.path.join(self.outbox, fn))
                except OSError:
                    pass
            elif rid in (D.get("cardq") or {}):
                del D["cardq"][rid]
                changed = True
        if reqs:
            _jsave(self.done_p, done[-400:])
        changed |= self.refresh(D)
        return changed

    # ----- the two directions --------------------------------------------------------
    def _hist(self, side, name, n, ref, kind="cards", eid=None):
        h = _jload(self.hist_p, [])
        e = {"id": uuid.uuid4().hex[:10], "kind": kind, "side": side, "name": name, "n": n, "t": int(time.time()), "ref": ref}
        if eid:
            e["eid"] = eid
        h.append(e)
        _jsave(self.hist_p, h[-60:])

    def _keep_feather(self, name, cards, save_backup):
        if cards and save_backup:
            try:
                ref = save_backup(name, cards)
                if ref:
                    self._hist("feather", name, len(cards), ref)
            except Exception as e:
                self.log("cards: backup of Feather's set failed", repr(e))

    def _keep_archie(self, aset):
        os.makedirs(self.bdir, exist_ok=True)
        stamp = time.strftime("%Y-%m-%d %H%M%S")
        fn = f"{safe_name(aset.get('name') or 'Deck')} (before, {stamp} {uuid.uuid4().hex[:4]}).json"
        _jsave(os.path.join(self.bdir, fn), aset)
        self._hist("archie", aset.get("name") or "Deck", len(aset.get("cards") or []), fn)

    def a2f(self, D, deck, save_backup=None, clean=False):
        """Archie's set replaces Feather's copy."""
        A = archie_sets(self.study).get(key_of(deck))
        if not A:
            self.log("cards: Archie has no set called", repr(deck))
            return False
        path, aset = A
        name = aset.get("name") or deck
        cards = D.setdefault("cards", {})
        F = feather_sets(cards).get(key_of(name))
        fname = F[0] if F else name
        if F:
            self._keep_feather(fname, F[1], save_backup)
        for c in (F[1] if F else []):
            cards.pop(c["id"], None)
        now = int(time.time())
        new = [a_to_f(ac, fname, now) for ac in aset["cards"] if ac.get("q") or ac.get("a")]
        if clean:
            new = [_clean_f(c, now) for c in new]
        for c in new:
            cards[c["id"]] = c
        self._link(name, os.path.getmtime(path), f_hash(new))
        self.log(f"cards: {name} from Archie to Feather ({len(new)} cards)")
        return True

    def f2a(self, D, deck, clean=False):
        """Feather's set replaces Archie's copy."""
        F = feather_sets(D.get("cards")).get(key_of(deck))
        if not F:
            self.log("cards: Feather has no set called", repr(deck))
            return False
        fname, fcs = F
        A = archie_sets(self.study).get(key_of(fname))
        path = A[0] if A else os.path.join(self.study, safe_name(fname) + ".json")
        today = datetime.date.today().isoformat()
        if A:
            self._keep_archie(A[1])
        old = A[1] if A else {}
        aset = {"name": old.get("name") or safe_name(fname), "created": old.get("created") or today,
                "source": old.get("source") or FROM_FEATHER, "cards": [f_to_a(c, today) for c in fcs]}
        if clean:
            aset["cards"] = [_clean_a(c, today) for c in aset["cards"]]
        _jsave(path, aset)
        self._link(fname, os.path.getmtime(path), f_hash(fcs))
        self.log(f"cards: {fname} from Feather to Archie ({len(fcs)} cards)")
        return True

    # ----- exams --------------------------------------------------------------------
    def exam(self, D, r, save_backup=None, load_backup=None):
        eid, op, clean = str(r.get("eid") or ""), r.get("op"), bool(r.get("clean"))
        X = D.setdefault("xexams", {})
        A = archie_exams(self.study)
        exdir = os.path.join(self.study, "Exams")
        if op == "a2f":
            if eid not in A:
                self.log("exams: Archie has no exam", repr(eid))
                return False
            path, ex = A[eid]
            if eid in X and save_backup:
                try:
                    ref = save_backup(X[eid].get("title") or eid, X[eid])
                    if ref:
                        self._hist("feather", X[eid].get("title") or eid, len(X[eid].get("questions") or []), ref, "exam", eid)
                except Exception as e:
                    self.log("exams: backup of Feather's copy failed", repr(e))
            new = json.loads(json.dumps(ex))
            if clean:
                new["attempts"] = []
            new["t"] = int(time.time())
            X[eid] = new
            self._link("exam:" + eid, os.path.getmtime(path), x_hash(new))
            self.log(f"exams: {ex.get('title')} from Archie to Feather")
            return True
        if op == "f2a":
            if eid not in X:
                self.log("exams: Feather has no exam", repr(eid))
                return False
            ex = json.loads(json.dumps(X[eid]))
            ex.pop("t", None)
            if clean:
                ex["attempts"] = []
            if eid in A:
                self._keep_exam(A[eid][1])
            os.makedirs(exdir, exist_ok=True)
            p = A[eid][0] if eid in A else os.path.join(exdir, re.sub(r"[^\w.-]", "_", eid) + ".json")
            _jsave(p, ex)
            self._link("exam:" + eid, os.path.getmtime(p), x_hash(X[eid]))
            self.log(f"exams: {ex.get('title')} from Feather to Archie")
            return False
        return False

    def _keep_exam(self, ex):
        os.makedirs(self.bdir, exist_ok=True)
        stamp = time.strftime("%Y-%m-%d %H%M%S")
        fn = f"exam {safe_name(ex.get('title') or 'exam')} (before, {stamp} {uuid.uuid4().hex[:4]}).json"
        _jsave(os.path.join(self.bdir, fn), ex)
        self._hist("archie", ex.get("title") or "exam", len(ex.get("questions") or []), fn, "exam", str(ex.get("id")))

    def restore(self, D, hid, save_backup=None, load_backup=None):
        """Put a version from the history back; what it replaces goes into the history first."""
        e = next((x for x in _jload(self.hist_p, []) if x.get("id") == hid), None)
        if not e:
            self.log("cards: nothing in the history called", hid)
            return False
        if e.get("kind") == "exam":
            return self._restore_exam(D, e, save_backup, load_backup)
        name = e["name"]
        if e["side"] == "archie":
            data = _jload(os.path.join(self.bdir, os.path.basename(e["ref"])), None)
            if not isinstance(data, dict) or not isinstance(data.get("cards"), list):
                self.log("cards: that Archie backup is gone", e["ref"])
                return False
            A = archie_sets(self.study).get(key_of(name))
            if A:
                self._keep_archie(A[1])
            _jsave(A[0] if A else os.path.join(self.study, safe_name(name) + ".json"), data)
            self.log(f"cards: put back Archie's {name} ({len(data['cards'])} cards)")
            return False
        if not load_backup:
            return False
        data = load_backup(e["ref"])
        cards = D.setdefault("cards", {})
        F = feather_sets(cards).get(key_of(name))
        if F:
            self._keep_feather(F[0], F[1], save_backup)
            for c in F[1]:
                cards.pop(c["id"], None)
        for c in data.get("cards") or []:
            if isinstance(c, dict) and c.get("id"):
                cards[c["id"]] = dict(c, deck=name)
        self.log(f"cards: put back Feather's {name} ({len(data.get('cards') or [])} cards)")
        return True

    def _restore_exam(self, D, e, save_backup, load_backup):
        eid = str(e.get("eid") or "")
        if e["side"] == "archie":
            ex = _jload(os.path.join(self.bdir, os.path.basename(e["ref"])), None)
            if not isinstance(ex, dict) or not eid:
                return False
            A = archie_exams(self.study)
            if eid in A:
                self._keep_exam(A[eid][1])
            exdir = os.path.join(self.study, "Exams")
            os.makedirs(exdir, exist_ok=True)
            _jsave(A[eid][0] if eid in A else os.path.join(exdir, re.sub(r"[^\w.-]", "_", eid) + ".json"), ex)
            self.log(f"exams: put back Archie's {ex.get('title')}")
            return False
        if not load_backup or not eid:
            return False
        ex = load_backup(e["ref"]).get("cards")
        if not isinstance(ex, dict):
            return False
        X = D.setdefault("xexams", {})
        if eid in X and save_backup:
            ref = save_backup(X[eid].get("title") or eid, X[eid])
            if ref:
                self._hist("feather", X[eid].get("title") or eid, len(X[eid].get("questions") or []), ref, "exam", eid)
        X[eid] = ex
        self.log(f"exams: put back Feather's {ex.get('title')}")
        return True

    def _link(self, name, a_mtime, fh):
        links = _jload(self.links_p, {})
        links[key_of(name)] = {"a_mtime": a_mtime, "f_hash": fh, "t": time.time()}
        _jsave(self.links_p, links)

    # ----- what each side shows ------------------------------------------------------
    def refresh(self, D):
        """D["archiedecks"]: Archie's sets for Feather. Study\\.feather_decks: Feather's sets for Archie.
        Returns True when D changed."""
        links = _jload(self.links_p, {})
        A = archie_sets(self.study)
        F = feather_sets(D.get("cards"))

        def state(k):
            ln = links.get(k)
            a = A.get(k)
            f = F.get(k)
            st = {"linked": bool(ln and a and f)}
            if st["linked"]:
                st["anewer"] = os.path.getmtime(a[0]) > ln.get("a_mtime", 0) + 1
                st["fnewer"] = f_hash(f[1]) != ln.get("f_hash")
                st["t"] = int(ln.get("t", 0))
            return st

        ad = {a[1].get("name") or k: dict(state(k), n=len(a[1]["cards"])) for k, a in A.items()}
        fd = {f[0]: dict(state(k), n=len(f[1])) for k, f in F.items()}
        if _jload(self.decks_p, {}).get("decks") != fd:
            try:
                _jsave(self.decks_p, {"decks": fd, "t": time.time()})
            except OSError:
                pass
        hist = [{k: x.get(k) for k in ("id", "kind", "side", "name", "n", "t")} for x in reversed(_jload(self.hist_p, []))]
        changed = False
        AX, FX = archie_exams(self.study), D.get("xexams") or {}

        def xstate(eid):
            ln = links.get(key_of("exam:" + eid))
            st = {"linked": bool(ln and eid in AX and eid in FX)}
            if st["linked"]:
                st["anewer"] = os.path.getmtime(AX[eid][0]) > ln.get("a_mtime", 0) + 1
                st["fnewer"] = x_hash(FX[eid]) != ln.get("f_hash")
                st["t"] = int(ln.get("t", 0))
            return st
        ax = {eid: dict(xstate(eid), title=ex.get("title") or eid, n=len(ex.get("questions") or []), best=best_of(ex)) for eid, (p, ex) in AX.items()}
        fx = {eid: dict(xstate(eid), title=ex.get("title") or eid, n=len(ex.get("questions") or []), best=best_of(ex)) for eid, ex in FX.items()}
        xp = os.path.join(self.study, ".feather_exams")
        if _jload(xp, {}).get("exams") != fx:
            try:
                _jsave(xp, {"exams": fx, "t": time.time()})
            except OSError:
                pass
        global _SAID
        if D.get("archieexams") != ax or not _SAID:
            _SAID = True
            if D.get("archieexams") != ax:
                D["archieexams"] = ax
                changed = True
            self.log(f"exams: Feather now sees {len(ax)} of Archie's exams" + (f" ({', '.join(x['title'] for x in ax.values())[:120]})" if ax else ""))
        if D.get("shelfhist") != hist:
            D["shelfhist"] = hist
            changed = True
        if D.get("archiedecks") != ad:
            D["archiedecks"] = ad
            changed = True
        return changed


def archie_request(archie_dir, op, deck, **extra):
    """For Archie: ask for a set to be moved (the hub does it at the next sync with a Feather device)."""
    ob = os.path.join(archie_dir, "Study", ".feather_outbox")
    os.makedirs(ob, exist_ok=True)
    rid = "a" + uuid.uuid4().hex[:12]
    _jsave(os.path.join(ob, rid + ".json"), dict(extra, id=rid, op=op, deck=deck, t=time.time()))
    return rid
