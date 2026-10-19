"""The app itself, in demo mode: it starts, unlocks, searches, keeps strangers out, and edits the calendar."""
import json, os, re, shutil, subprocess, sys, time, urllib.error, urllib.request
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="module")
def app(tmp_path_factory):
    stick = tmp_path_factory.mktemp("stick") / "Feather"
    shutil.copytree(os.path.join(ROOT, "app"), stick / "app", ignore=shutil.ignore_patterns("__pycache__"))
    p = subprocess.Popen([sys.executable, "app/feather.py", "--demo", "--no-window"], cwd=stick, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    line = p.stdout.readline()
    port = int(re.search(r":(\d+)/", line).group(1))
    yield f"http://127.0.0.1:{port}"
    p.terminate()


def call(base, path, body=None, headers=None):
    req = urllib.request.Request(base + "/api/" + path, data=json.dumps(body or {}).encode(), headers={"Content-Type": "application/json", **(headers or {})})
    try:
        return 200, json.loads(urllib.request.urlopen(req, timeout=30).read())
    except urllib.error.HTTPError as e:
        return e.code, None


def test_unlock_and_home(app):
    assert call(app, "unlock", {"password": "demo"})[1]["ok"]
    code, h = call(app, "home")
    assert code == 200 and h["name"] == "Sam"


def test_search_finds_notes_and_cards(app):
    call(app, "unlock", {"password": "demo"})
    for _ in range(20):  # the index builds in the background
        code, r = call(app, "search", {"q": "photosyn", "vault": False})
        if r.get("notes"):
            break
        time.sleep(0.3)
    assert r["notes"] and r["cards"]


def test_other_websites_are_refused(app):
    assert call(app, "state", headers={"Origin": "http://evil.example"})[0] == 403
    assert call(app, "state", headers={"Host": "evil.example"})[0] == 403


def test_calendar_changes_wait_for_archie(app):
    call(app, "unlock", {"password": "demo"})
    code, r = call(app, "cal/save", {"item": {"what": "Robot demo day", "date": "2099-05-01", "kind": "event", "time": "14:00"}})
    assert code == 200 and any(x["what"] == "Robot demo day" for x in r["items"])
    new_id = r["id"]
    first = r["items"][0]
    call(app, "cal/save", {"item": {**first, "what": first["what"] + "!"}})
    code, r = call(app, "cal/save", {"item": {**first, "what": first["what"] + "!!"}})
    assert r["pending"] == 2  # the add, and one edit (two edits to the same date become one)
    code, r = call(app, "cal/del", {"item": {"id": new_id}})
    assert r["pending"] == 1  # a date that never reached Archie is just forgotten
