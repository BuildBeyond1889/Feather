"""The encrypted store: passwords, keys, and every file staying readable."""
import os, json, secrets
import pytest
import store
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def put(P, rel, aad, payload=b"hello"):
    p = os.path.join(P.data_dir, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    n = secrets.token_bytes(12)
    open(p, "wb").write(n + AESGCM(P.key).encrypt(n, payload, aad))
    return p


def opens(P, p, key):
    raw = open(p, "rb").read()
    AESGCM(key).decrypt(raw[:12], raw[12:], P._aad(p))


def test_new_store_and_wrong_password(tmp_path):
    P = store.Stick(str(tmp_path))
    assert P.unlock("correct horse")
    P.data["notes"]["a.md"] = {"text": "secret"}
    P.save()
    raw = open(P.file, "rb").read()
    assert b"secret" not in raw  # encrypted on disk
    Q = store.Stick(str(tmp_path))
    assert not Q.unlock("wrong password")
    assert Q.unlock("correct horse") and Q.data["notes"]["a.md"]["text"] == "secret"


def test_save_never_leaves_a_half_written_file(tmp_path):
    P = store.Stick(str(tmp_path))
    P.unlock("pw123456")
    P.save()
    assert not [f for f in os.listdir(P.data_dir) if f.endswith(".tmp")]


def test_change_password_reencrypts_every_file(tmp_path):
    P = store.Stick(str(tmp_path))
    P.unlock("oldpass1")
    files = [put(P, "paper/abc123def456.enc", b"feather-paper"), put(P, "paper/aff00ee11dd22.enc", b"feather-asset"),
             put(P, "readings/0123456789ab.book.enc", b"feather-book"), put(P, "readings/0123456789ab.enc", b"feather-file")]
    assert P.change_password("newpass2") == len(files)
    Q = store.Stick(str(tmp_path))
    assert not Q.unlock("oldpass1")
    assert Q.unlock("newpass2")
    for p in files:
        opens(Q, p, Q.key)
    assert not [f for r, _, fs in os.walk(Q.data_dir) for f in fs if f.endswith(".rekey")]


def test_old_pocket_files_are_renamed(tmp_path):
    P = store.Stick(str(tmp_path))
    P.unlock("pw123456")
    P.save()
    os.rename(P.id_file, os.path.join(str(tmp_path), "pocket.id"))
    os.rename(P.file, os.path.join(P.data_dir, "pocket.enc"))
    Q = store.Stick(str(tmp_path))
    assert Q.unlock("pw123456") and os.path.exists(Q.file)


def test_spaced_repetition_moves_cards_out():
    c = {"ease": 2.5, "reps": 0}
    store.grade_card(c, 2)
    first = c["interval"]
    store.grade_card(c, 2)
    assert c["interval"] > first
    store.grade_card(c, 0)
    assert c["reps"] == 0 and c["interval"] == 0
