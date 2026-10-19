"""Ctrl+K's word index, built in the background when Feather unlocks.

Every word in your notes, books and handwriting points to the places it appears, so a search looks words up
instead of reading every book again on each key press. Each word you type matches as the start of a word
("photo" finds "photosynthesis"), and every word has to be in the same place. Lives in memory only, and is
thrown away when Feather locks.
"""
import bisect, re, threading

WORD = re.compile(r"\w+")


class Index:
    def __init__(self):
        self.docs = []        # (kind, key, title, text)
        self.inv = {}         # word -> {doc number: where it first appears}
        self.vocab = []       # every word, sorted, for "starts with" lookups
        self.sig = None
        self.ready = False
        self.lock = threading.Lock()

    def build(self, docs, sig):
        inv = {}
        for i, (kind, key, title, text) in enumerate(docs):
            tl = len(title) + 1
            for m in WORD.finditer((title + " " + text).lower()):
                w = m.group()
                if len(w) > 1:
                    d = inv.get(w)
                    if d is None:
                        inv[w] = {i: max(0, m.start() - tl)}
                    elif i not in d:
                        d[i] = max(0, m.start() - tl)
        with self.lock:
            self.docs, self.inv, self.vocab, self.sig, self.ready = docs, inv, sorted(inv), sig, True

    def clear(self):
        with self.lock:
            self.docs, self.inv, self.vocab, self.sig, self.ready = [], {}, [], None, False

    def _starting(self, w):
        """{doc: first place} for every word that starts with w."""
        i, out = bisect.bisect_left(self.vocab, w), {}
        while i < len(self.vocab) and self.vocab[i].startswith(w):
            for doc, pos in self.inv[self.vocab[i]].items():
                if doc not in out or pos < out[doc]:
                    out[doc] = pos
            i += 1
        return out

    def find(self, words, kinds=None):
        """[(doc number, doc, where the first word first appears)] for docs where every word starts a word."""
        with self.lock:
            first, hits = None, None
            for w in words:
                s = self._starting(w)
                if first is None:
                    first = s
                hits = set(s) if hits is None else hits & set(s)
                if not hits:
                    return []
            return [(i, self.docs[i], first.get(i, 0)) for i in sorted(hits or []) if not kinds or self.docs[i][0] in kinds]


def snippet(text, word, width=140, at=None):
    if at is None:
        m = re.search(r"\b" + re.escape(word), text, re.I) or re.search(re.escape(word), text, re.I)
        at = m.start() if m else 0
    i = max(0, at - 50)
    t = text[i:i + width + 40].replace("\n", " ")
    return ("…" if i else "") + t[:width].strip() + "…"
