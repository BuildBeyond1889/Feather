"""Feather's calendar changes going into Archie's own files."""
import datetime, json
import feather_sync as fs

D = lambda n: (datetime.date.today() + datetime.timedelta(days=n)).isoformat()

fs.log = lambda *a: None


def archie(tmp_path):
    (tmp_path / "calendar.json").write_text(json.dumps({"events": [
        {"id": "ev1", "title": "Open house", "date": D(10), "time": "12:00", "kind": "event", "notes": "bring id", "repeat": None, "until": None}]}))
    (tmp_path / "deadlines.txt").write_text("# DEADLINES\n# Format:  YYYY-MM-DD | what it is\n\n" + D(30) + " | First day of classes\n")
    return str(tmp_path)


def test_reads_both_files(tmp_path):
    items = fs.archie_deadlines(archie(tmp_path))
    assert {(x["what"], x["src"]) for x in items} == {("Open house", "cal"), ("First day of classes", "dl")}


def test_edit_add_and_delete(tmp_path):
    a = archie(tmp_path)
    items = {x["what"]: x for x in fs.archie_deadlines(a)}
    fs.apply_calendar_changes(a, [
        {"op": "edit", "item": {**items["First day of classes"], "what": "First classes", "date": D(31)}},
        {"op": "edit", "item": {**items["Open house"], "kind": "exam", "time": "09:30"}},
        {"op": "add", "item": {"src": "new", "what": "Portfolio due", "date": D(40), "kind": "due", "time": "17:00"}},
    ])
    after = {x["what"]: x for x in fs.archie_deadlines(a)}
    assert after["First classes"]["date"] == D(31) and "First day of classes" not in after
    assert after["Open house"]["kind"] == "exam" and after["Open house"]["time"] == "09:30"
    ev = json.load(open(a + "/calendar.json"))["events"]
    assert next(e for e in ev if e["id"] == "ev1")["notes"] == "bring id"  # what Feather doesn't show is kept
    fs.apply_calendar_changes(a, [{"op": "del", "item": after["Portfolio due"]}])
    assert "Portfolio due" not in {x["what"] for x in fs.archie_deadlines(a)}
    assert open(a + "/deadlines.txt").read().startswith("# DEADLINES")  # Archie's comments survive
