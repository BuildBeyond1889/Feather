"""Feather everywhere: two laptops and the stick, kept the same through the PC hub (no network here: the hub is called directly)."""
import copy, json, os, shutil, time
import pytest

import store, fsync
import feather_hub, feather_sync
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def page_write(P, pid, strokes):
    d = os.path.join(P.data_dir, "paper")
    os.makedirs(d, exist_ok=True)
    nonce = os.urandom(12)
    open(os.path.join(d, pid + ".enc"), "wb").write(nonce + AESGCM(P.key).encrypt(nonce, json.dumps({"strokes": strokes}).encode(), b"feather-paper"))


def page_read(P, pid):
    raw = open(os.path.join(P.data_dir, "paper", pid + ".enc"), "rb").read()
    return json.loads(AESGCM(P.key).decrypt(raw[:12], raw[12:], b"feather-paper"))["strokes"]


def stroke(n):
    return {"k": "p", "c": "#fff", "w": 3, "p": [n, n + 1, 0.5, n + 2, n + 3, 0.6]}


@pytest.fixture
def world(tmp_path, monkeypatch):
    stick = store.Stick(str(tmp_path / "stick"))
    assert stick.unlock("correct horse")
    D = stick.data
    D["cards"]["c1"] = {"id": "c1", "front": "mitosis", "back": "cell division", "deck": "BIO", "t": 1, "reps": 0, "due": 0}
    D["paper"] = {"nbs": {"nb1": {"title": "BIO 101 · cell diagram", "t": 1, "kind": "pages", "pages": [{"id": "aaaaaaaaaaa1", "tpl": "dot"}]}}}
    D["books"]["b1"] = {"id": "b1", "title": "Meditations", "author": "Marcus Aurelius", "chapters": {}, "quotes": [], "people": [], "log": [], "progress": {"page": 100}}
    stick.save()
    page_write(stick, "aaaaaaaaaaa1", [stroke(1), stroke(2)])
    key = stick.key
    hub = feather_hub.Hub(root=str(tmp_path / "hub"))
    monkeypatch.setattr(hub, "key", lambda sid: key)
    monkeypatch.setattr(feather_sync, "SETTINGS", str(tmp_path / "settings.json"))
    json.dump({}, open(tmp_path / "settings.json", "w"))
    monkeypatch.setattr(feather_sync, "find_archie", lambda cfg: None)
    sid = stick.meta["id"]

    def transport(k, inner, timeout=40):  # through the same boxes the network uses
        out = hub.handle({"op": "feather", "sid": sid, "box": fsync.box(k, inner)})
        assert out["ok"], out
        return fsync.unbox(k, out["box"])

    def install(name):  # what the installer does: copy the stick's Feather, data and all
        dst = tmp_path / name
        shutil.copytree(stick.root, dst)
        P = store.Stick(str(dst))
        assert P.unlock("correct horse")
        return P, fsync.Client(P, transport, name.lower(), name)
    return stick, hub, install, transport


def test_stick_creates_the_hub_then_laptops_install(world):
    stick, hub, install, _ = world
    assert hub.sync_stick(stick, stick.root)
    surface, cs = install("Surface")
    thinkpad, ct = install("ThinkPad")
    assert cs.sync_once() and ct.sync_once(), (cs.err, ct.err)
    assert cs.state == "ok" and surface.data["cards"]["c1"]["front"] == "mitosis"


def test_drawing_on_both_laptops_keeps_every_stroke(world):
    stick, hub, install, _ = world
    hub.sync_stick(stick, stick.root)
    surface, cs = install("Surface")
    thinkpad, ct = install("ThinkPad")
    cs.sync_once(); ct.sync_once()
    page_write(surface, "aaaaaaaaaaa1", [stroke(1), stroke(2), stroke(10), stroke(11)])
    page_write(thinkpad, "aaaaaaaaaaa1", [stroke(1), stroke(20)])  # erased stroke 2, drew stroke 20
    assert cs.sync_once() and ct.sync_once() and cs.sync_once()
    want = sorted(json.dumps(s) for s in [stroke(1), stroke(10), stroke(11), stroke(20)])
    assert sorted(json.dumps(s) for s in page_read(surface, "aaaaaaaaaaa1")) == want
    assert sorted(json.dumps(s) for s in page_read(thinkpad, "aaaaaaaaaaa1")) == want
    # and the other laptop hears about it
    v = ct.view()
    assert v["card"] and "Surface" in v["card"]["from"].values() and v["dots"].get("paper")


def test_store_changes_flow_and_clashes_keep_both(world):
    stick, hub, install, _ = world
    hub.sync_stick(stick, stick.root)
    surface, cs = install("Surface")
    thinkpad, ct = install("ThinkPad")
    cs.sync_once(); ct.sync_once()
    surface.data["books"]["b1"]["progress"] = {"page": 118}
    surface.data["cards"]["c1"]["front"] = "mitosis (M phase)"
    surface.data["jots"] = {"j1": {"id": "j1", "text": "ask about the lab", "t": 5}}
    surface.save()
    thinkpad.data["cards"]["c1"]["front"] = "mitosis!"
    thinkpad.data.setdefault("stats", {}).setdefault("reviews", {})["2026-11-10"] = 3
    thinkpad.save()
    assert cs.sync_once() and ct.sync_once() and cs.sync_once()
    for P in (surface, thinkpad):
        fronts = sorted(c["front"] for c in P.data["cards"].values())
        assert fronts == ["mitosis (M phase)", "mitosis!"]
        assert P.data["books"]["b1"]["progress"]["page"] == 118
        assert P.data["jots"]["j1"]["text"] == "ask about the lab"
    assert fsync.shash(surface.data) == fsync.shash(thinkpad.data)
    card = ct.view()["card"]
    assert card["reading"] and any(x["title"] == "Meditations" for x in card["reading"].values())


def test_deletes_follow_and_new_notebooks_arrive(world):
    stick, hub, install, _ = world
    hub.sync_stick(stick, stick.root)
    surface, cs = install("Surface")
    thinkpad, ct = install("ThinkPad")
    cs.sync_once(); ct.sync_once()
    surface.data["paper"]["nbs"]["nb2"] = {"title": "Chem", "t": 2, "kind": "pages", "pages": [{"id": "bbbbbbbbbbb2", "tpl": "lined"}]}
    surface.save()
    page_write(surface, "bbbbbbbbbbb2", [stroke(5)])
    del thinkpad.data["cards"]["c1"]
    thinkpad.save()
    assert cs.sync_once() and ct.sync_once() and cs.sync_once()
    assert page_read(thinkpad, "bbbbbbbbbbb2") == [stroke(5)]
    assert "c1" not in surface.data["cards"]
    # deleting the notebook on the ThinkPad removes its page on the Surface too
    del thinkpad.data["paper"]["nbs"]["nb2"]
    thinkpad.save()
    os.remove(os.path.join(thinkpad.data_dir, "paper", "bbbbbbbbbbb2.enc"))
    assert ct.sync_once() and cs.sync_once()
    assert "nb2" not in surface.data["paper"]["nbs"]
    assert not os.path.exists(os.path.join(surface.data_dir, "paper", "bbbbbbbbbbb2.enc"))


def test_offline_changes_wait_and_a_wiped_hub_never_wipes_a_laptop(world, tmp_path):
    stick, hub, install, _ = world
    hub.sync_stick(stick, stick.root)
    surface, cs = install("Surface")
    cs.sync_once()
    real = cs.t
    cs.t = lambda *a, **k: (_ for _ in ()).throw(ConnectionError("your PC isn't reachable"))
    surface.data["cards"]["c9"] = {"id": "c9", "front": "offline card", "back": "x", "t": 9}
    surface.save()
    assert not cs.sync_once() and cs.state == "off" and cs.view()["waiting"] >= 1
    cs.t = real
    shutil.rmtree(hub.root)  # the PC's master copy is gone
    assert cs.sync_once(), cs.err
    assert "c9" in surface.data["cards"] and "c1" in surface.data["cards"]
    assert os.path.exists(os.path.join(surface.data_dir, "paper", "aaaaaaaaaaa1.enc"))
    assert os.path.exists(os.path.join(hub.root, stick.meta["id"], "data", "paper", "aaaaaaaaaaa1.enc"))


def test_the_stick_catches_up(world):
    stick, hub, install, _ = world
    hub.sync_stick(stick, stick.root)
    surface, cs = install("Surface")
    cs.sync_once()
    page_write(surface, "aaaaaaaaaaa1", [stroke(1), stroke(2), stroke(3)])
    surface.data["cards"]["c2"] = {"id": "c2", "front": "osmosis", "back": "water", "t": 3}
    surface.save()
    cs.sync_once()
    line = hub.sync_stick(stick, stick.root)
    assert "c2" in stick.data["cards"] and len(page_read(stick, "aaaaaaaaaaa1")) == 3
    assert line and "Laptops" in line


def test_the_open_page_merges_strokes_that_arrived(world):
    """The window still shows the old page when strokes from the other laptop land; its next save keeps them."""
    a, b, cur = [stroke(1)], [stroke(1), stroke(2)], [stroke(1), stroke(30)]
    assert fsync.merge_strokes(a, b, cur) == [stroke(1), stroke(30), stroke(2)]
    assert fsync.merge_strokes(b, b + [stroke(3)], fsync.merge_strokes(a, b, cur)) == [stroke(1), stroke(30), stroke(2), stroke(3)]
