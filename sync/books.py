"""Turn a PDF, a plain-text book or an EPUB into chapters for Feather's reader.

    book = parse(path)  ->  {"v": 1, "title", "author", "kind", "ch": [{"t": chapter title, "p": [paragraphs]}]}

Project Gutenberg's licence text at the start and end is taken out. Plain-text books are split on their
BOOK / PART / CHAPTER headings; a book with no headings is cut into parts of about 15,000 characters.
"""
import html, os, posixpath, re, zipfile
from html.parser import HTMLParser
from urllib.parse import unquote

START = re.compile(r"\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*{3}", re.I)
END = re.compile(r"\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^*]*\*{3}", re.I)
TOP = re.compile(r"^(book|part|volume|act|epilogue|prologue|first epilogue|second epilogue|appendix)\b", re.I)
CHAP = re.compile(r"^(chapter|letter|section|scene|canto|stave)\b|^[ivxlcdm]+\.?$|^\d{1,3}\.?$", re.I)
ROMAN = re.compile(r"^[IVXLCDM]+[.:]?$")


def nice(h):
    """'BOOK ONE: 1805' -> 'Book One: 1805', 'CHAPTER XII' -> 'Chapter XII' (roman numerals stay upper case)."""
    h = re.sub(r"\s+", " ", h).strip()
    if h != h.upper():
        return h
    return " ".join(w if ROMAN.match(w) else w.capitalize() for w in h.split(" "))


def assemble(blocks):
    """blocks: [("h", heading) | ("p", paragraph)] in reading order -> chapters."""
    chapters, label, cur = [], "", None

    def start(title):
        nonlocal cur
        if cur is not None and sum(len(p) for p in cur["p"]) < 300:  # an empty heading (a book title before its first chapter, a contents list)
            chapters.remove(cur)
        cur = {"t": title, "p": []}
        chapters.append(cur)

    for kind, text in blocks:
        text = text.strip()
        if not text:
            continue
        if kind == "h" and len(text) < 90 and (TOP.match(text) or CHAP.match(text)):
            if TOP.match(text):
                label = nice(text)
                start(label)
            else:
                start(f"{label} · {nice(text)}" if label else nice(text))
        elif kind == "h" and cur is None:
            start(nice(text))
        else:
            if cur is None:
                start("Opening")
            cur["p"].append(text)
    if chapters and sum(len(p) for p in chapters[-1]["p"]) < 300 and len(chapters) > 1:
        chapters.pop()
    if len(chapters) < 3:  # no real chapters: cut it into readable parts
        paras = [p for c in chapters for p in c["p"]]
        chapters, part, size = [], [], 0
        for p in paras:
            part.append(p)
            size += len(p)
            if size > 15000:
                chapters.append({"t": f"Part {len(chapters) + 1}", "p": part})
                part, size = [], 0
        if part:
            chapters.append({"t": f"Part {len(chapters) + 1}" if chapters else "Text", "p": part})
    return chapters


def strip_gutenberg(text):
    m = START.search(text)
    if m:
        text = text[m.end():]
    m = END.search(text)
    if m:
        text = text[:m.start()]
    return text


def from_text(raw):
    meta = {}
    for k in ("Title", "Author"):
        m = re.search(rf"^{k}:\s*(.+)$", raw[:6000], re.M)
        if m:
            meta[k.lower()] = m.group(1).strip()
    text = strip_gutenberg(raw.replace("\r\n", "\n").replace("\r", "\n"))
    blocks = []
    for para in re.split(r"\n\s*\n", text):
        lines = [ln.strip() for ln in para.strip().split("\n") if ln.strip()]
        if not lines:
            continue
        if len(lines) == 1 and len(lines[0]) < 90 and (TOP.match(lines[0]) or CHAP.match(lines[0])):
            blocks.append(("h", lines[0]))
        elif len(lines) > 1 and max(len(ln) for ln in lines) < 48:  # verse or a letter's address: keep its lines
            blocks.append(("p", "\n".join(lines)))
        else:
            blocks.append(("p", " ".join(lines)))
    return meta, blocks


class _Blocks(HTMLParser):
    """HTML -> heading and paragraph blocks."""
    BLOCK = {"p", "div", "li", "blockquote", "pre", "tr", "dd", "dt", "section"}
    HEAD = {"h1", "h2", "h3", "h4"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.buf, self.kind, self.skip = [], [], "p", 0

    def flush(self):
        t = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        if t:
            self.blocks.append((self.kind, t))
        self.buf, self.kind = [], "p"

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self.skip += 1
        elif tag in self.HEAD:
            self.flush()
            self.kind = "h"
        elif tag in self.BLOCK:
            self.flush()
        elif tag == "br":
            self.buf.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head"):
            self.skip = max(0, self.skip - 1)
        elif tag in self.HEAD or tag in self.BLOCK:
            self.flush()

    def handle_data(self, data):
        if not self.skip:
            self.buf.append(data)


def from_epub(path):
    z = zipfile.ZipFile(path)
    cont = z.read("META-INF/container.xml").decode("utf-8", "ignore")
    opf_path = re.search(r'full-path="([^"]+)"', cont).group(1)
    opf = z.read(opf_path).decode("utf-8", "ignore")
    meta = {}
    for k, tag in (("title", "title"), ("author", "creator")):
        m = re.search(rf"<dc:{tag}[^>]*>(.*?)</dc:{tag}>", opf, re.S)
        if m:
            meta[k] = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()
    items = {}
    for tag in re.findall(r"<item\b[^>]*>", opf):
        a = dict(re.findall(r'(\w[\w-]*)="([^"]*)"', tag))
        if "id" in a and "href" in a:
            items[a["id"]] = a
    base = posixpath.dirname(opf_path)
    blocks = []
    for idref in re.findall(r'<itemref\b[^>]*idref="([^"]+)"', opf):
        it = items.get(idref)
        if not it or "html" not in it.get("media-type", "html"):
            continue
        name = posixpath.normpath(posixpath.join(base, unquote(it["href"])))
        try:
            doc = z.read(name).decode("utf-8", "ignore")
        except KeyError:
            continue
        p = _Blocks()
        p.feed(doc)
        p.flush()
        blocks += p.blocks
    # Gutenberg's licence: drop everything up to the START line and from the END line on
    for i, (k, t) in enumerate(blocks):
        if START.search(t):
            blocks = blocks[i + 1:]
            break
    for i, (k, t) in enumerate(blocks):
        if END.search(t):
            blocks = blocks[:i]
            break
    return meta, blocks


def from_pdf_pages(pages):
    ch = []
    for i, t in enumerate(pages):
        paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", t or "")]
        ch.append({"t": f"Page {i + 1}", "p": [p for p in paras if p] or [""]})
    return ch


def parse(path, pdf_pages=None):
    ext = os.path.splitext(path)[1].lower()
    name = os.path.splitext(os.path.basename(path))[0]
    if ext == ".pdf":
        pages = pdf_pages(path)
        return {"v": 1, "title": name, "author": "", "kind": "pdf", "ch": from_pdf_pages(pages)}
    if ext == ".epub":
        meta, blocks = from_epub(path)
        kind = "epub"
    else:
        raw = open(path, "rb").read()
        try:
            raw = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            raw = raw.decode("latin-1")
        meta, blocks = from_text(raw)
        kind = "txt"
    author = re.sub(r"^(graf|count|countess|sir|dame|lord|lady)\s+", "", meta.get("author", ""), flags=re.I)
    if author.count(",") >= 1 and "&" not in author:  # "Tolstoy, Leo, graf" -> "Leo Tolstoy"
        last, first = [x.strip() for x in author.split(",")[:2]]
        author = f"{first} {last}"
    return {"v": 1, "title": meta.get("title") or name, "author": author, "kind": kind, "ch": assemble(blocks)}


def flat(book):
    """One text with chapter marks, for search, Ask and mock exams."""
    out = []
    for i, c in enumerate(book["ch"]):
        out.append(f"[{'p' if book['kind'] == 'pdf' else 'ch'}. {i + 1}] {c['t']}\n" + "\n\n".join(c["p"]))
    return "\n\n".join(out)
