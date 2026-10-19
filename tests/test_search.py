"""Ctrl+K's word index."""
import searchidx


def test_prefix_words_must_all_match():
    ix = searchidx.Index()
    ix.build([("note", "a", "Biology", "Photosynthesis happens in chloroplasts"),
              ("doc", "b", "War and Peace", "Natasha went to the ball. " * 3),
              ("note", "c", "Robots", "Servo pulses every 20 ms")], sig=1)
    assert [d[1] for _, d, _ in ix.find(["photo"])] == ["a"]
    assert [d[1] for _, d, _ in ix.find(["natasha", "ball"])] == ["b"]
    assert ix.find(["natasha", "servo"]) == []
    assert [d[1] for _, d, _ in ix.find(["war"])] == ["b"]  # titles count too


def test_snippet_starts_near_the_word():
    ix = searchidx.Index()
    text = "x " * 500 + "Borodino was the battle."
    ix.build([("doc", "b", "Book", text)], sig=1)
    [(_, (kind, key, title, t), at)] = ix.find(["borodino"])
    assert "Borodino" in searchidx.snippet(t, "borodino", at=at)
