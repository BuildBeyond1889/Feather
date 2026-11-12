"""Feather's key helper: Ctrl+Alt+F from anywhere on this laptop.

  Feather in front      -> hides it (still unlocked until the usual idle lock)
  hidden or behind      -> brings it back
  not running           -> opens it
Alt+M is still the key that locks and closes. This helper starts with Windows on a laptop where Feather is
installed (Feather sets that up itself) and does nothing but wait for the key. One copy at a time: a second
one finds the key taken and leaves.
"""
import ctypes, json, os, subprocess, sys, time, urllib.request
from ctypes import wintypes

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INUSE = os.path.join(ROOT, "data", "in-use")


def running():
    """(pid, port) of Feather if it's open right now."""
    try:
        if time.time() - os.path.getmtime(INUSE) < 15:
            pid, port = open(INUSE).read().split()[:2]
            return int(pid), int(port)
    except (OSError, ValueError):
        pass
    return None


def note(**kw):
    """What this helper last did, where Feather can read it (data\\fkey.json)."""
    try:
        with open(os.path.join(ROOT, "data", "fkey.json"), "w", encoding="utf-8") as f:
            json.dump(dict(kw, t=time.time(), pid=os.getpid()), f)
    except OSError:
        pass


def press(u, last=[0.0]):
    r = running()
    if r:
        try:
            u.AllowSetForegroundWindow(r[0])  # this helper got the key press, so it may hand the front spot to Feather
            out = urllib.request.urlopen(f"http://127.0.0.1:{r[1]}/api/toggle", timeout=4).read()
            note(key="held", last=out.decode("utf-8", "replace")[:60])
            return
        except Exception as e:
            note(key="held", last="toggle failed: " + repr(e)[:80])
    if time.time() - last[0] < 6:
        return  # already opening
    last[0] = time.time()
    subprocess.Popen([os.path.join(ROOT, "python", "pythonw.exe"), os.path.join("app", "feather.py")], cwd=ROOT)


def main():
    if sys.platform != "win32":
        return
    u = ctypes.windll.user32
    if not u.RegisterHotKey(None, 1, 0x0001 | 0x0002 | 0x4000, ord("F")):  # ALT | CONTROL | NOREPEAT
        try:  # another copy of this helper already has it (fine), or some other program does
            old = json.load(open(os.path.join(ROOT, "data", "fkey.json"), encoding="utf-8"))
        except (OSError, ValueError):
            old = {}
        if old.get("key") != "held" or time.time() - old.get("t", 0) > 86400 * 30:
            note(key="taken by another program")
        return
    note(key="held", last="waiting")
    if not running():  # at Windows start: Feather waits in the background, locked, so the key opens it at once
        try:
            subprocess.Popen([os.path.join(ROOT, "python", "pythonw.exe"), os.path.join("app", "feather.py"), "--background"], cwd=ROOT)
        except OSError:
            pass
    msg = wintypes.MSG()
    while u.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
        if msg.message == 0x0312:  # WM_HOTKEY
            try:
                press(u)
            except Exception:
                pass


if __name__ == "__main__":
    main()
