"""Feather: the encrypted store.

Everything personal (books, notes, flashcards, exams, reviews) lives in one file, data/feather.enc,
encrypted with AES-256-GCM. The key comes from your password (scrypt), and is only ever held in memory.
feather.id (not secret) holds the salt, so the same password always gives the same key.
Sticks made before the rename (pocket.id, data/pocket.enc) are renamed in place the first time they're opened.
"""
import json, os, time, uuid, hashlib, secrets

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:  # the stick ships with it in ../lib; this message only shows on a broken copy
    raise SystemExit("Feather: the 'cryptography' library is missing (lib folder).")


def new_id():
    return uuid.uuid4().hex[:12]


def now():
    return int(time.time())


def empty_store():
    return {"v": 1, "updated": now(), "books": {}, "cards": {}, "notes": {}, "exams": [], "teach": [], "settings": {}}


AAD = b"archie-pocket-v1"  # bound into every encrypted store; kept as-is so older sticks still open


class Stick:
    """root = the Feather folder on the stick (or the demo folder)."""

    def __init__(self, root, data="data"):
        self.root = root
        self.data_dir = os.path.join(root, data)
        os.makedirs(self.data_dir, exist_ok=True)
        self.file = os.path.join(self.data_dir, "feather.enc")
        self.id_file = os.path.join(root, "feather.id" if data == "data" else data + ".id")
        for old, new in ((os.path.join(root, "pocket.id"), self.id_file), (os.path.join(self.data_dir, "pocket.enc"), self.file)):
            if os.path.exists(old) and not os.path.exists(new):  # a stick from before the rename
                try:
                    os.replace(old, new)
                except OSError:
                    pass
        if os.path.exists(self.id_file):
            self.meta = json.load(open(self.id_file))
        else:
            self.meta = {"id": uuid.uuid4().hex, "salt": secrets.token_hex(16), "created": now()}
            json.dump(self.meta, open(self.id_file, "w"))
        self.key = None
        self.data = None

    # --- keys ---
    def derive(self, password):
        return hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(self.meta["salt"]), n=2 ** 15, r=8, p=1,
                              maxmem=64 * 1024 * 1024, dklen=32)

    @property
    def exists(self):
        return os.path.exists(self.file)

    def unlock(self, password=None, key=None):
        """Returns True if the password (or a saved key) opens the store. Creates the store the first time."""
        k = key or self.derive(password)
        if not self.exists:
            self.key, self.data = k, empty_store()
            self.save()
            return True
        try:
            self.data = self.decrypt(k)
            self.key = k
            return True
        except Exception:
            return False

    def lock(self):
        self.key, self.data = None, None

    def decrypt(self, k):
        raw = open(self.file, "rb").read()
        return json.loads(AESGCM(k).decrypt(raw[:12], raw[12:], AAD))

    def save(self):
        if self.key is None:
            return
        self.data["updated"] = now()
        nonce = os.urandom(12)
        blob = nonce + AESGCM(self.key).encrypt(nonce, json.dumps(self.data, ensure_ascii=False).encode("utf-8"), AAD)
        tmp = self.file + ".tmp"
        with open(tmp, "wb") as f:
            f.write(blob)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.file)  # never a half-written file, even if the stick is pulled

    def _aad(self, path):
        """Which kind of encrypted file this is (each kind is bound to its own label)."""
        name, parent = os.path.basename(path), os.path.basename(os.path.dirname(path))
        if parent == "paper":  # pictures are "a" + 12 hex characters; pages are 12 hex characters (which can start with "a" too)
            stem = name[:-4]
            return b"feather-asset" if len(stem) == 13 and stem.startswith("a") else b"feather-paper"
        if parent == "readings":
            return b"feather-book" if name.endswith(".book.enc") else b"feather-file"
        return None

    def change_password(self, new_password):
        """A new password means a new key, so every encrypted file on the stick is re-encrypted with it:
        the store, Paper pages and pictures, and books. New copies are written next to the old ones first,
        and only swapped in once all of them worked."""
        old, new = self.key, self.derive(new_password)
        todo = []
        for r, dirs, files in os.walk(self.data_dir):
            for fn in files:
                p = os.path.join(r, fn)
                aad = self._aad(p) if fn.endswith(".enc") else None
                if aad:
                    todo.append((p, aad))
        done = []
        try:
            for p, aad in todo:
                raw = open(p, "rb").read()
                try:
                    plain = AESGCM(old).decrypt(raw[:12], raw[12:], aad)
                except Exception:
                    continue  # unreadable already (damaged): leave it alone
                nonce = secrets.token_bytes(12)
                with open(p + ".rekey", "wb") as f:
                    f.write(nonce + AESGCM(new).encrypt(nonce, plain, aad))
                done.append(p)
        except Exception:
            for p in done:
                try:
                    os.remove(p + ".rekey")
                except OSError:
                    pass
            raise
        for p in done:
            os.replace(p + ".rekey", p)
        self.key = new
        self.save()
        return len(done)


# ---------- spaced repetition (SM-2, simplified) ----------
def grade_card(card, q):
    """q: 0 again · 1 hard · 2 good · 3 easy"""
    ease = card.get("ease", 2.5)
    reps = card.get("reps", 0)
    if q == 0:
        reps, interval = 0, 0
    else:
        reps += 1
        interval = 1 if reps == 1 else (3 if reps == 2 else round(card.get("interval", 1) * ease * (1.2 if q == 3 else 1.0 if q == 2 else 0.8)))
        ease = max(1.3, ease + (0.1 if q == 3 else 0 if q == 2 else -0.15))
    card.update(reps=reps, interval=interval, ease=round(ease, 2), due=now() + max(interval, 0) * 86400 + (600 if q == 0 else 0), t=now())
    return card


def due_cards(cards):
    t = now()
    return [c for c in cards.values() if c.get("due", 0) <= t]


# ---------- citations ----------
def cite(book, style="mla"):
    a = (book.get("author") or "").strip()
    title = (book.get("title") or "").strip()
    pub = (book.get("publisher") or "").strip()
    year = str(book.get("year") or "").strip()
    trans = (book.get("translator") or "").strip()
    parts = a.split()
    if style == "apa":
        name = f"{parts[-1]}, {' '.join(p[0] + '.' for p in parts[:-1])}" if len(parts) > 1 else a
        s = f"{name} ({year or 'n.d.'}). *{title}*"
        if trans:
            s += f" ({trans}, Trans.)"
        return s + (f". {pub}." if pub else ".")
    name = f"{parts[-1]}, {' '.join(parts[:-1])}" if len(parts) > 1 else a
    s = f"{name}. *{title}*."
    if trans:
        s += f" Translated by {trans},"
    if pub:
        s += f" {pub},"
    if year:
        s += f" {year}"
    return s.rstrip(",") + "."


Pocket = Stick  # older name, still used by a few callers
