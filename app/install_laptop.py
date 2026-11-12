"""Install Feather on this laptop from the stick, or update it. Run "Install Feather on this laptop.bat" on the stick.

  1. copies Feather (the app, its Python, the encryption library, the offline model) to %LOCALAPPDATA%\\Programs\\Feather
  2. the first time, brings your Feather over from the stick: same password, still encrypted
     (later runs only update the app; this laptop's own Feather is never overwritten)
  3. adds Feather to the Start menu and the desktop
After that, Feather on this laptop keeps itself in step with your PC (and through it, your other laptop and the stick).
It finds your PC the way Archie Lite does, so Archie Lite should be on this laptop too.
"""
import json, os, shutil, socket, subprocess, time

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # <stick>\Feather
DEST = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "Programs", "Feather")
SKIP = {"data", "demo", "app.next", "__pycache__", "feather.log", "feather.log.old", "module.json", "run.bat", "Feather Demo.bat",
        "Autostart on this laptop.bat", "Install Feather on this laptop.bat", "installed.json", "pairing.json", "System Volume Information"}
NO_WINDOW = 0x08000000
FOUND = {}


def say(s=""):
    print("  " + s, flush=True)


def ps(cmd):
    return subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd], capture_output=True, text=True,
                          creationflags=NO_WINDOW).stdout.strip()


def size_of(p):
    if os.path.isfile(p):
        return os.path.getsize(p)
    return sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(p) for f in fs)


def copy_tree(src, dst, label):
    """Copies what's new or changed; a file that's already the same is left alone (so an update is quick).
    Big folders show how far along they are, inside a big file too, so a slow stick never looks stuck."""
    todo = []
    for r, dirs, fs in os.walk(src):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for f in fs:
            a = os.path.join(r, f)
            b = os.path.join(dst, os.path.relpath(a, src))
            if os.path.exists(b) and os.path.getsize(a) == os.path.getsize(b) and os.path.getmtime(b) >= os.path.getmtime(a) - 2:
                continue
            todo.append((a, b))
    total = sum(os.path.getsize(a) for a, _ in todo) or 1
    big = total > 50e6
    done, t0, shown = 0, time.time(), 0.0

    def show(final=False):
        nonlocal shown
        if not big or (not final and time.time() - shown < 1):
            return
        shown = time.time()
        speed = done / max(0.5, time.time() - t0)
        left = (total - done) / speed if speed > 0 else 0
        eta = f"{left / 60:.0f} min left" if left >= 90 else f"{left:.0f} s left"
        line = f"    {label}: {100 * done / total:3.0f}%  {done / 1e6:,.0f} of {total / 1e6:,.0f} MB  {speed / 1e6:.1f} MB/s  {eta}"
        print("\r" + line.ljust(78), end="\n" if final else "", flush=True)

    for a, b in todo:
        os.makedirs(os.path.dirname(b), exist_ok=True)
        tmp = b + ".new"
        with open(a, "rb") as fi, open(tmp, "wb") as fo:
            while True:
                buf = fi.read(4 * 1024 * 1024)
                if not buf:
                    break
                fo.write(buf)
                done += len(buf)
                show()
        shutil.copystat(a, tmp)
        os.replace(tmp, b)
    if todo:
        show(final=True)
    return len(todo)


def device_name():
    """'Surface' or 'ThinkPad' (what you'd call it), and the full model for Settings."""
    model = ""
    try:
        out = ps("$c = Get-CimInstance Win32_ComputerSystem; $c.Manufacturer; $c.Model; $c.SystemFamily")
        man, mod, fam = (out.splitlines() + ["", "", ""])[:3]
        model = next((x for x in (fam, mod) if x and any(ch.isalpha() for ch in x) and "to be filled" not in x.lower()), "")
        for word in ("Surface", "ThinkPad", "Yoga", "XPS", "Spectre", "Envy", "Zenbook", "MacBook", "IdeaPad", "Galaxy Book"):
            if word.lower() in (fam + " " + mod).lower():
                return word, model or mod
    except Exception:
        pass
    return socket.gethostname().title(), model


def stop_running():
    ps("Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*Programs\\Feather\\python\\python*' -or $_.CommandLine -like '*Programs\\Feather\\app\\feather.py*') } "
       "| ForEach-Object { Stop-Process -Id $_.ProcessId -Force }")


def shortcut(lnk, target, args, workdir, icon):
    os.makedirs(os.path.dirname(lnk), exist_ok=True)
    q = lambda s: s.replace("'", "''")
    ps(f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{q(lnk)}');$s.TargetPath='{q(target)}';$s.Arguments='{q(args)}';"
       f"$s.WorkingDirectory='{q(workdir)}';$s.IconLocation='{q(icon)}';$s.Description='Feather';$s.Save()")


def lite_pairing():
    local = os.environ.get("LOCALAPPDATA", "")
    places = [os.path.join(local, "ArchieLite", "data", "pairing.json")]
    try:  # Python from the Microsoft Store keeps Archie Lite's data inside its own Packages folder
        places += [os.path.join(local, "Packages", n, "LocalCache", "Local", "ArchieLite", "data", "pairing.json")
                   for n in os.listdir(os.path.join(local, "Packages")) if n.lower().startswith("pythonsoftwarefoundation.python")]
    except OSError:
        pass
    try:  # and wherever a running Archie Lite was started from
        import re
        out = ps("Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*lite.py*' } | ForEach-Object { $_.CommandLine }")
        for m in re.finditer(r'"?([A-Za-z]:\\[^"\r\n]*?)\\app\\lite\.py', out):
            places.append(os.path.join(m.group(1), "data", "pairing.json"))
    except Exception:
        pass
    for mine in places:
        if os.path.exists(mine):
            shutil.copy2(mine, os.path.join(DEST, "pairing.json"))  # a copy for Feather, in case Archie Lite moves
            FOUND["lite_data"] = os.path.dirname(mine)
            return "lite"
    drive = os.path.splitdrive(SRC)[0]
    for p in (os.path.join(drive + "\\", "ArchieLite", "data", "pairing.json"), os.path.join(os.path.dirname(SRC), "ArchieLite", "data", "pairing.json")):
        if os.path.exists(p):
            shutil.copy2(p, os.path.join(DEST, "pairing.json"))
            return "stick"
    return None


def main():
    print("\n  FEATHER · install on this laptop\n")
    if os.path.normcase(SRC) == os.path.normcase(DEST):
        say("This is already the installed Feather. Run this from the stick.")
        return
    inuse = os.path.join(SRC, "data", "in-use")
    if os.path.exists(inuse) and time.time() - os.path.getmtime(inuse) < 20:
        say("Feather is open from the stick. Close its window first, then run this again.")
        return
    first = not os.path.exists(os.path.join(DEST, "data", "feather.enc"))
    if not first:
        try:
            a = json.load(open(os.path.join(SRC, "feather.id"))).get("id")
            b = json.load(open(os.path.join(DEST, "feather.id"))).get("id")
        except (OSError, ValueError):
            a = b = None
        if a and b and a != b:
            say("This laptop already has a different Feather installed (not the one on this stick).")
            say("Nothing was changed.")
            return
    os.makedirs(DEST, exist_ok=True)
    stop_running()
    items = [n for n in os.listdir(SRC) if n not in SKIP and not n.startswith(".")]
    big = {n: size_of(os.path.join(SRC, n)) for n in items if n.lower() == "vault"}
    for n in items:
        if n in big and big[n] > 1e9:
            ans = input(f"  Copy the Vault (offline libraries, {big[n] / 1e9:.1f} GB) too? [Y/n] ").strip().lower()
            if ans == "n":
                continue
        p = os.path.join(SRC, n)
        if os.path.isdir(p):
            k = copy_tree(p, os.path.join(DEST, n), n)
            say(f"{n}: {k} file{'s' if k != 1 else ''} copied" if k else f"{n}: up to date")
        elif n != "feather.id":
            shutil.copy2(p, os.path.join(DEST, n))
    if first:
        say("bringing your Feather over from the stick (still encrypted, same password)...")
        shutil.copy2(os.path.join(SRC, "feather.id"), os.path.join(DEST, "feather.id"))
        src_data, dst_data = os.path.join(SRC, "data"), os.path.join(DEST, "data")
        for r, dirs, fs in os.walk(src_data):
            dirs[:] = [d for d in dirs if d not in ("damaged", "backup")]
            for f in fs:
                if f in ("in-use",) or f.endswith((".tmp", ".rekey", ".sync")):
                    continue
                a = os.path.join(r, f)
                b = os.path.join(dst_data, os.path.relpath(a, src_data))
                os.makedirs(os.path.dirname(b), exist_ok=True)
                shutil.copy2(a, b)
    info_p = os.path.join(DEST, "installed.json")
    try:
        info = json.load(open(info_p, encoding="utf-8"))
    except (OSError, ValueError):
        info = {}
    if not info.get("name"):
        info["name"], info["model"] = device_name()
    info.update(host=socket.gethostname(), installed=info.get("installed") or time.time(), updated=time.time())
    json.dump(info, open(info_p, "w", encoding="utf-8"), indent=1)
    py = os.path.join(DEST, "python", "pythonw.exe")
    ico = os.path.join(DEST, "feather.ico")
    progs = os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs")
    desk = ps("[Environment]::GetFolderPath('Desktop')") or os.path.join(os.path.expanduser("~"), "Desktop")
    for lnk in (os.path.join(progs, "Feather.lnk"), os.path.join(desk, "Feather.lnk")):
        shortcut(lnk, py, "app\\feather.py", DEST, ico)
    vbs = os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs\Startup", "Feather Autostart.vbs")
    if os.path.exists(vbs):  # Feather lives on this laptop now: plugging the stick in no longer needs to open it
        try:
            os.remove(vbs)
            ps("Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*Feather\\watch.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }")
            say("stick autostart turned off on this laptop (Feather is installed here now)")
        except OSError:
            pass
    pair = lite_pairing()
    if FOUND.get("lite_data"):
        info["lite_data"] = FOUND["lite_data"]
        json.dump(info, open(info_p, "w", encoding="utf-8"), indent=1)
        say("found Archie Lite's pairing with your PC")
    print()
    say(f"Feather is on this laptop: {info['name']}.")
    say("Open it from the Start menu or the desktop. Same password as the stick.")
    if pair:
        say("It syncs with your PC by itself, at home or anywhere on Tailscale.")
    else:
        say("To sync with your PC, put Archie Lite on this laptop too (it's how Feather finds your PC).")
        say("Until then, Feather works here on its own and keeps everything.")
    if first:
        subprocess.Popen([py, "app\\feather.py"], cwd=DEST)
    else:  # back to waiting in the background, with Ctrl+Alt+F ready
        subprocess.Popen([py, "app\\fkey.py"], cwd=DEST)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        say(f"Something went wrong: {e}")
        say("Nothing on the stick was changed.")
