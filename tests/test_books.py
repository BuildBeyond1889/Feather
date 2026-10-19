"""Turning Gutenberg-style books into chapters."""
import zipfile
import books

GUT = """The Project Gutenberg eBook of Test Book

Title: A Test of Chapters

Author: Tolstoy, Leo, graf

*** START OF THE PROJECT GUTENBERG EBOOK A TEST OF CHAPTERS ***

Contents

BOOK ONE: 1805

CHAPTER I

CHAPTER II


BOOK ONE: 1805

CHAPTER I

{p}

CHAPTER II

{p}

BOOK TWO: 1806

CHAPTER I

{p}

*** END OF THE PROJECT GUTENBERG EBOOK A TEST OF CHAPTERS ***

Section 1. General Terms of Use
"""
PARA = "It was a long and winding paragraph that went on for quite a while, " * 6


def write(tmp_path, name, text):
    p = tmp_path / name
    p.write_text(text, encoding="utf-8")
    return str(p)


def test_gutenberg_text_into_chapters(tmp_path):
    b = books.parse(write(tmp_path, "book.txt", GUT.replace("{p}", PARA)))
    assert b["title"] == "A Test of Chapters"
    assert b["author"] == "Leo Tolstoy"
    assert [c["t"] for c in b["ch"]] == ["Book One: 1805 · Chapter I", "Book One: 1805 · Chapter II", "Book Two: 1806 · Chapter I"]
    flat = books.flat(b)
    assert "PROJECT GUTENBERG" not in flat and "Terms of Use" not in flat


def test_roman_numerals_stay_upper_case():
    assert books.nice("CHAPTER XII") == "Chapter XII"
    assert books.nice("BOOK ONE: 1805") == "Book One: 1805"


def test_book_without_headings_is_cut_into_parts(tmp_path):
    text = "\n\n".join(PARA for _ in range(120))
    b = books.parse(write(tmp_path, "plain.txt", text))
    assert len(b["ch"]) > 2 and b["ch"][0]["t"] == "Part 1"
    assert sum(len(p) for c in b["ch"] for p in c["p"]) == sum(len(PARA.strip()) for _ in range(120))


def test_verse_keeps_its_lines(tmp_path):
    b = books.parse(write(tmp_path, "poem.txt", "CHAPTER I\n\nTyger Tyger, burning bright,\nIn the forests of the night;\n\n" + PARA * 3 + "\n\nCHAPTER II\n\n" + PARA * 3 + "\n\nCHAPTER III\n\n" + PARA * 3))
    assert "burning bright,\nIn the forests" in b["ch"][0]["p"][0]


def test_epub_chapters_and_licence(tmp_path):
    p = str(tmp_path / "t.epub")
    z = zipfile.ZipFile(p, "w")
    z.writestr("mimetype", "application/epub+zip")
    z.writestr("META-INF/container.xml", '<container><rootfiles><rootfile full-path="OEBPS/c.opf"/></rootfiles></container>')
    z.writestr("OEBPS/c.opf", '<package><metadata><dc:title>Little Test</dc:title><dc:creator>Austen, Jane</dc:creator></metadata>'
               '<manifest><item id="h" href="h.xhtml" media-type="application/xhtml+xml"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest>'
               '<spine><itemref idref="h"/><itemref idref="a"/></spine></package>')
    z.writestr("OEBPS/h.xhtml", "<p>licence</p><p>*** START OF THE PROJECT GUTENBERG EBOOK LITTLE TEST ***</p>")
    body = "".join(f"<h2>CHAPTER {r}</h2><p>{PARA}</p><p>{PARA}</p>" for r in ("I", "II", "III"))
    z.writestr("OEBPS/a.xhtml", f"<html><head><style>p{{}}</style></head><body>{body}<p>*** END OF THE PROJECT GUTENBERG EBOOK ***</p><p>terms</p></body></html>")
    z.close()
    b = books.parse(p)
    assert b["kind"] == "epub" and b["title"] == "Little Test" and b["author"] == "Jane Austen"
    assert [c["t"] for c in b["ch"]] == ["Chapter I", "Chapter II", "Chapter III"]
    assert "licence" not in books.flat(b) and "terms" not in books.flat(b)
