"""Feather Setup's stick check: find files that won't open, and bring them back from a backup."""
import os, secrets
import store
import feather_sync as fs
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

fs.log = lambda *a: None


def test_check_and_repair(tmp_path, monkeypatch):
    monkeypatch.setattr(fs, "BASE", str(tmp_path / "PC"))
    root = str(tmp_path / "Feather")
    P = store.Stick(root)
    P.unlock("pw123456")
    P.data["cards"]["c1"] = {"id": "c1", "front": "Q", "back": "A", "deck": "D"}
    P.save()
    page = os.path.join(P.data_dir, "paper", "abcdef123456.enc")
    os.makedirs(os.path.dirname(page))
    n = secrets.token_bytes(12)
    open(page, "wb").write(n + AESGCM(P.key).encrypt(n, b'{"strokes":[]}', b"feather-paper"))
    key, sid = P.key, P.meta["id"]
    fs.backup(P, root)
    assert fs.check_stick(root, key)["bad"] == []
    for f in (page, P.file):  # damage two files
        b = bytearray(open(f, "rb").read()); b[30] ^= 0xFF; open(f, "wb").write(bytes(b))
    bad = fs.check_stick(root, key)["bad"]
    assert sorted(bad) == sorted(["feather.enc", os.path.join("paper", "abcdef123456.enc")])
    r = fs.repair_stick(root, key, sid, bad)
    assert len(r["fixed"]) == 2 and not r["lost"]
    assert fs.check_stick(root, key)["bad"] == []
    Q = store.Stick(root)
    assert Q.unlock("pw123456") and "c1" in Q.data["cards"]
    assert os.listdir(r["aside"])  # the damaged copies are kept, not deleted
