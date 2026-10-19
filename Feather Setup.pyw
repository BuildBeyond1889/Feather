"""Feather Setup: one window for everything on the home PC.

  · pick your Obsidian vault and your name, then start PC sync (it starts with Windows from then on)
  · make or update a Feather stick
  · restore the stick from an encrypted backup
  · move an old Archie Pocket install (D:\\ArchiePocket) over to Feather

Double-click it. Needs Python 3 on the PC (the stick carries its own).
"""
import ctypes, json, os, queue, shutil, string, subprocess, sys, threading, time
import tkinter as tk
from tkinter import filedialog, messagebox

BASE = os.path.dirname(os.path.abspath(__file__))  # D:\Feather
SYNC = os.path.join(BASE, "sync")
SETTINGS = os.path.join(SYNC, "settings.json")
BACKUPS = os.path.join(BASE, "backups")
STARTUP = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
LINK = os.path.join(STARTUP, "Feather Sync.lnk")
OLD_LINK = os.path.join(STARTUP, "Archie Pocket Sync.lnk")
VERSION = "1.0"
NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)

BG, CARD, LINE, TEXT, DIM, ACC = "#0c0d0b", "#141612", "#262a22", "#e8ecdf", "#a7af9e", "#c6f432"
F, FB, FS = ("Segoe UI", 10), ("Segoe UI Semibold", 10), ("Segoe UI", 9)


def pythons():
    """python.exe (for pip) and pythonw.exe (for the quiet sync) next to whichever Python is running this."""
    d = os.path.dirname(sys.executable)
    py, pyw = os.path.join(d, "python.exe"), os.path.join(d, "pythonw.exe")
    return (py if os.path.exists(py) else sys.executable), (pyw if os.path.exists(pyw) else sys.executable)


def ps(cmd):
    return subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, text=True, creationflags=NOWIN).stdout.strip()


def load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return default


def sync_running():
    out = ps("(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*feather_sync.py*' }).Count")
    return out.isdigit() and int(out) > 0


def stop_sync():
    ps("Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and ($_.CommandLine -like '*feather_sync.py*' -or $_.CommandLine -like '*pocket_sync.py*') }"
       " | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }")


def start_sync():
    _, pyw = pythons()
    subprocess.Popen([pyw, os.path.join(SYNC, "feather_sync.py")], cwd=SYNC, creationflags=NOWIN)


def make_shortcut():
    _, pyw = pythons()
    q = lambda s: s.replace("'", "''")
    ps(f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{q(LINK)}'); $s.TargetPath='{q(pyw)}';"
       f" $s.Arguments='\"{q(os.path.join(SYNC, 'feather_sync.py'))}\"'; $s.WorkingDirectory='{q(SYNC)}';"
       f" $s.IconLocation='{q(os.path.join(BASE, 'icon', 'feather.ico'))}'; $s.Save()")
    if os.path.exists(OLD_LINK):
        os.remove(OLD_LINK)


def old_install():
    """An Archie Pocket folder from before the rename, next to this one or at the top of a drive."""
    places = [os.path.join(os.path.dirname(BASE), "ArchiePocket")]
    places += [f"{L}:\\ArchiePocket" for L in "CDEFG"]
    for p in places:
        if os.path.isfile(os.path.join(p, "pc", "pocket_sync.py")) and os.path.normcase(p) != os.path.normcase(BASE):
            return p
    return None


def removable():
    out = []
    try:
        mask = ctypes.windll.kernel32.GetLogicalDrives()
    except AttributeError:
        return out
    for i, L in enumerate(string.ascii_uppercase):
        if mask >> i & 1 and ctypes.windll.kernel32.GetDriveTypeW(f"{L}:\\") == 2:
            name = ctypes.create_unicode_buffer(64)
            ctypes.windll.kernel32.GetVolumeInformationW(f"{L}:\\", name, 64, None, None, None, None, 0)
            free = ctypes.c_ulonglong(0)
            ctypes.windll.kernel32.GetDiskFreeSpaceExW(f"{L}:\\", None, None, ctypes.byref(free))
            kind = "Feather" if os.path.isdir(f"{L}:\\Feather") else "old Archie Pocket" if os.path.isdir(f"{L}:\\ArchiePocket") else "empty"
            out.append((L, name.value or "USB", free.value / 1e9, kind))
    return out


class Setup(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Feather Setup")
        self.configure(bg=BG)
        self.geometry("660x760")
        self.minsize(560, 600)
        try:
            self.iconbitmap(os.path.join(BASE, "icon", "feather.ico"))
        except Exception:
            pass
        self.q = queue.Queue()
        self.cfg = load(SETTINGS, {})
        self.old = old_install()
        self.busy = False

        head = tk.Frame(self, bg=BG)
        head.pack(fill="x", padx=24, pady=(20, 6))
        try:
            self.logo = tk.PhotoImage(file=os.path.join(BASE, "icon", "feather-48.png"))
            tk.Label(head, image=self.logo, bg=BG).pack(side="left", padx=(0, 12))
        except Exception:
            pass
        t = tk.Frame(head, bg=BG)
        t.pack(side="left")
        tk.Label(t, text="Feather Setup", fg=TEXT, bg=BG, font=("Segoe UI Semibold", 16)).pack(anchor="w")
        self.status = tk.Label(t, text="", fg=DIM, bg=BG, font=FS, justify="left")
        self.status.pack(anchor="w")

        if self.old:
            self.migrate_card()
        self.pc_card()
        self.stick_card()
        self.backup_card()

        self.logbox = tk.Text(self, height=8, bg=CARD, fg=DIM, font=("Consolas", 9), relief="flat", highlightthickness=1,
                              highlightbackground=LINE, wrap="word", state="disabled")
        self.logbox.pack(fill="both", expand=True, padx=24, pady=(6, 18))
        self.refresh()
        self.after(150, self.pump)

    # ---------- little widgets ----------
    def card(self, title, sub):
        c = tk.Frame(self, bg=CARD, highlightthickness=1, highlightbackground=LINE)
        c.pack(fill="x", padx=24, pady=6)
        tk.Label(c, text=title, fg=TEXT, bg=CARD, font=FB).pack(anchor="w", padx=14, pady=(10, 0))
        tk.Label(c, text=sub, fg=DIM, bg=CARD, font=FS, justify="left", wraplength=560).pack(anchor="w", padx=14, pady=(0, 6))
        body = tk.Frame(c, bg=CARD)
        body.pack(fill="x", padx=14, pady=(0, 12))
        return body

    def button(self, parent, text, cmd, main=True):
        return tk.Button(parent, text=text, command=cmd, bg=ACC if main else CARD, fg=BG if main else TEXT, activebackground=ACC,
                         relief="flat", font=FB if main else F, padx=12, pady=3, cursor="hand2",
                         highlightthickness=0 if main else 1, highlightbackground=LINE)

    def entry(self, parent, value="", width=40):
        e = tk.Entry(parent, bg=BG, fg=TEXT, insertbackground=ACC, relief="flat", font=F, width=width,
                     highlightthickness=1, highlightbackground=LINE, highlightcolor=ACC)
        e.insert(0, value)
        return e

    def say(self, *a):
        self.q.put(" ".join(str(x) for x in a))

    def pump(self):
        try:
            while True:
                line = self.q.get_nowait()
                if line == "\0refresh":
                    self.refresh()
                    continue
                self.logbox.configure(state="normal")
                self.logbox.insert("end", line + "\n")
                self.logbox.see("end")
                self.logbox.configure(state="disabled")
        except queue.Empty:
            pass
        self.after(150, self.pump)

    def work(self, label, fn):
        """Run fn in the background so the window never freezes."""
        if self.busy:
            return messagebox.showinfo("Feather Setup", "Still working on the last thing. Give it a moment.")
        self.busy = True
        self.say(f"— {label}")

        def run():
            try:
                fn()
            except Exception as e:
                self.say("  couldn't: " + str(e))
            finally:
                self.busy = False
                self.q.put("\0refresh")
        threading.Thread(target=run, daemon=True).start()

    # ---------- status ----------
    def refresh(self):
        self.cfg = load(SETTINGS, {})
        bits = [f"version {VERSION}"]
        vault = self.cfg.get("obsidian_vault")
        bits.append("Obsidian: " + (vault if vault and os.path.isdir(vault) else "not picked yet"))
        running = sync_running()
        bits.append("PC sync: " + ("running" if running else "not running") + (", starts with Windows" if os.path.exists(LINK) else ""))
        self.status.config(text="   ·   ".join(bits[:1]) + "\n" + "\n".join(bits[1:]))
        self.fill_drives()
        self.fill_backups()

    # ---------- moving over from Archie Pocket ----------
    def migrate_card(self):
        b = self.card("Move over from Archie Pocket",
                      f"Found the old version in {self.old}. This copies its settings and pairing here, renames the Obsidian folder "
                      "Pocket → Feather on the next sync, and swaps the old startup entry for Feather's. Your stick is renamed the next "
                      f"time you plug it in. The old folder stays until you delete it yourself.")
        self.button(b, "move over", lambda: self.work("moving over from Archie Pocket", self.migrate)).pack(anchor="w")

    def migrate(self):
        src = os.path.join(self.old, "pc")
        os.makedirs(SYNC, exist_ok=True)
        stop_sync()
        self.say("  stopped the old sync")
        for fn in ("settings.json", "paired.json"):
            a, b = os.path.join(src, fn), os.path.join(SYNC, fn)
            if os.path.exists(a) and not os.path.exists(b):
                shutil.copy2(a, b)
                self.say("  copied", fn)
        a, b = os.path.join(src, "cache"), os.path.join(SYNC, "cache")
        if os.path.isdir(a) and not os.path.exists(b):
            shutil.copytree(a, b)
            self.say("  copied the cache")
        cfg = load(SETTINGS, {})
        for k in ("readings_folder", "note_folders"):  # notes and documents now come only from vault\\Feather\\Notes
            cfg.pop(k, None)
        json.dump(cfg, open(SETTINGS, "w"), indent=2)
        if os.path.exists(OLD_LINK):
            os.remove(OLD_LINK)
        make_shortcut()
        start_sync()
        self.say("  done: Feather sync is running and starts with Windows.")
        self.say("  When you're happy, you can delete", self.old)
        self.after(0, lambda: (self.name.delete(0, "end"), self.name.insert(0, cfg.get("name", "")),
                               self.vault.delete(0, "end"), self.vault.insert(0, cfg.get("obsidian_vault", ""))))

    # ---------- this PC ----------
    def pc_card(self):
        b = self.card("This PC", "Plugging the stick in here syncs it: your logs, cards and Paper pages go into Obsidian, "
                                 "your notes go onto the stick (encrypted), and an encrypted backup is kept in Feather\\backups. "
                                 "Only what you put in Feather\\Notes in your vault goes onto the stick: notes, PDFs and text files. "
                                 "Daily notes and everything else in Obsidian stay on the PC.")
        r1 = tk.Frame(b, bg=CARD)
        r1.pack(fill="x", pady=2)
        tk.Label(r1, text="Obsidian vault", fg=DIM, bg=CARD, font=FS, width=13, anchor="w").pack(side="left")
        self.vault = self.entry(r1, self.cfg.get("obsidian_vault", ""))
        self.vault.pack(side="left", fill="x", expand=True)
        self.button(r1, "browse", self.browse, main=False).pack(side="left", padx=(6, 0))
        r2 = tk.Frame(b, bg=CARD)
        r2.pack(fill="x", pady=2)
        tk.Label(r2, text="Your name", fg=DIM, bg=CARD, font=FS, width=13, anchor="w").pack(side="left")
        self.name = self.entry(r2, self.cfg.get("name", ""), width=20)
        self.name.pack(side="left")
        r3 = tk.Frame(b, bg=CARD)
        r3.pack(fill="x", pady=(8, 0))
        self.button(r3, "save and start sync", self.save_pc).pack(side="left")
        self.button(r3, "restart sync", lambda: self.work("restarting sync", self.restart), main=False).pack(side="left", padx=6)
        self.button(r3, "open Feather notes", self.open_docs, main=False).pack(side="left", padx=(0, 6))
        self.button(r3, "open log", lambda: os.startfile(os.path.join(SYNC, "sync.log")) if os.path.exists(os.path.join(SYNC, "sync.log")) else None,
                    main=False).pack(side="left")

    def open_docs(self):
        """Feather's own folder in Obsidian: the only notes and PDFs that go onto the stick."""
        cfg = load(SETTINGS, {})
        vault = cfg.get("obsidian_vault")
        if not vault or not os.path.isdir(vault):
            return messagebox.showinfo("Feather Setup", "Pick your Obsidian vault first.")
        d = cfg.get("notes_folder") or os.path.join(vault, cfg.get("export_folder") or "Feather", "Notes")
        os.makedirs(d, exist_ok=True)
        os.startfile(d)

    def browse(self):
        d = filedialog.askdirectory(title="Your Obsidian vault folder")
        if d:
            self.vault.delete(0, "end")
            self.vault.insert(0, os.path.normpath(d))

    def save_pc(self):
        vault, name = self.vault.get().strip().strip('"'), self.name.get().strip()
        if not os.path.isdir(vault):
            return messagebox.showwarning("Feather Setup", "Pick your Obsidian vault folder first.")
        if not os.path.isdir(os.path.join(vault, ".obsidian")) and not messagebox.askyesno(
                "Feather Setup", "That folder doesn't look like an Obsidian vault (no .obsidian folder inside). Use it anyway?"):
            return

        def go():
            cfg = load(SETTINGS, {})
            cfg.update({"obsidian_vault": vault, "name": name})
            cfg.setdefault("export_folder", "Feather")
            cfg.setdefault("max_note_kb", 200)
            os.makedirs(SYNC, exist_ok=True)
            os.makedirs(os.path.join(vault, cfg.get("export_folder") or "Feather", "Notes"), exist_ok=True)
            json.dump(cfg, open(SETTINGS, "w"), indent=2)
            self.say("  saved settings")
            py, _ = pythons()
            self.say("  checking Python packages (cryptography, pillow, pypdf)…")
            r = subprocess.run([py, "-m", "pip", "install", "--quiet", "--upgrade", "cryptography", "pillow", "pypdf"],
                               capture_output=True, text=True, creationflags=NOWIN)
            self.say("  packages ready" if r.returncode == 0 else "  pip said: " + (r.stderr or r.stdout)[-300:])
            make_shortcut()
            self.say("  starts with Windows")
            self.restart()
        self.work("setting up this PC", go)

    def restart(self):
        stop_sync()
        start_sync()
        time.sleep(1.5)
        self.say("  sync is running" if sync_running() else "  sync didn't start: open the log")

    # ---------- the stick ----------
    def stick_card(self):
        b = self.card("Make or update a stick", "Puts the app, portable Python and the offline model on a USB stick. "
                                                "Your data on it is never touched, so updating is safe. Normal syncs update the app too.")
        r = tk.Frame(b, bg=CARD)
        r.pack(fill="x")
        self.drive = tk.StringVar()
        self.drives = tk.OptionMenu(r, self.drive, "")
        self.drives.configure(bg=BG, fg=TEXT, activebackground=LINE, activeforeground=TEXT, relief="flat", font=F, highlightthickness=1,
                              highlightbackground=LINE, width=34, anchor="w")
        self.drives["menu"].configure(bg=CARD, fg=TEXT, font=F)
        self.drives.pack(side="left")
        self.button(r, "↻", self.refresh, main=False).pack(side="left", padx=6)
        self.model = tk.BooleanVar(value=True)
        tk.Checkbutton(b, text="download the offline model if it's missing (about 2 GB)", variable=self.model, bg=CARD, fg=DIM, font=FS,
                       selectcolor=BG, activebackground=CARD, activeforeground=TEXT).pack(anchor="w", pady=(6, 0))
        r2 = tk.Frame(b, bg=CARD)
        r2.pack(anchor="w", pady=(6, 0))
        self.button(r2, "make / update stick", self.make_stick).pack(side="left")
        self.button(r2, "check the stick", self.check_stick, main=False).pack(side="left", padx=6)

    def fill_drives(self):
        m = self.drives["menu"]
        m.delete(0, "end")
        ds = removable()
        labels = [f"{L}:  {name}  ·  {free:.1f} GB free  ·  {kind}" for L, name, free, kind in ds]
        for t in labels:
            m.add_command(label=t, command=lambda t=t: self.drive.set(t))
        cur = self.drive.get()
        self.drive.set(cur if cur in labels else (next((t for t in labels if "Feather" in t or "Pocket" in t), labels[0]) if labels else "no USB stick plugged in"))

    def picked_drive(self):
        t = self.drive.get()
        return t[0] if len(t) > 1 and t[1] == ":" else None

    def make_stick(self):
        L = self.picked_drive()
        if not L:
            return messagebox.showinfo("Feather Setup", "Plug in the USB stick, then press ↻.")
        want = self.model.get()

        def go():
            sys.path.insert(0, SYNC)
            import stickmaker
            stickmaker.make(L, say=self.say, want_model=lambda: want)
        self.work(f"making the stick on {L}:", go)

    def check_stick(self):
        """Opens every encrypted file on the stick with this PC's saved key; offers to repair what doesn't open."""
        L = self.picked_drive()
        root = f"{L}:\\Feather" if L else None
        if not root or not os.path.isdir(root):
            return messagebox.showinfo("Feather Setup", "Plug in the Feather stick (synced at least once), then press ↻.")
        inuse = os.path.join(root, "data", "in-use")
        if os.path.exists(inuse) and time.time() - os.path.getmtime(inuse) < 60:
            return messagebox.showinfo("Feather Setup", "Close the Feather window first.")

        def go():
            sys.path.insert(0, SYNC)
            import base64, feather_sync as fs
            sid = json.load(open(os.path.join(root, "feather.id"))).get("id")
            paired = load(os.path.join(SYNC, "paired.json"), {})
            if sid not in paired:
                return self.say("  this PC hasn't been paired with this stick yet: plug it in once so it syncs, then check again")
            key = fs.unprotect(base64.b64decode(paired[sid]))
            self.say("  opening every encrypted file…")
            res = fs.check_stick(root, key)
            if not res["bad"]:
                return self.say(f"  all {res['ok']} files open fine. Nothing to fix.")
            self.say(f"  {res['ok']} files fine, {len(res['bad'])} won't open:")
            for rel in res["bad"][:20]:
                self.say("    " + rel)
            self.after(0, lambda: self.offer_repair(root, key, sid, res["bad"]))
        self.work("checking the stick", go)

    def offer_repair(self, root, key, sid, bad):
        if not messagebox.askyesno("Feather Setup", f"{len(bad)} file(s) on the stick won't open.\n\nRepair them? Damaged files are moved aside (not deleted), "
                                                    "notes and Paper come back from your newest backup that opens, and books are rebuilt at the next sync."):
            return

        def go():
            import feather_sync as fs
            r = fs.repair_stick(root, key, sid, bad)
            for rel, snap in r["fixed"]:
                self.say(f"  restored {rel} from the backup of {snap}")
            for rel in r["rebuilt"]:
                self.say(f"  {rel} will be rebuilt at the next sync")
            for rel in r["lost"]:
                self.say(f"  {rel} isn't in any backup that opens; it's kept in {r['aside']}")
            self.say("  done. Unplug and plug the stick in so it syncs.")
        self.work("repairing the stick", go)

    # ---------- backups ----------
    def backup_card(self):
        b = self.card("Backups", "Every sync keeps an encrypted copy of the stick here (the last 10, plus one a month). "
                                 "They can't be opened without your password. Restore puts one back onto the stick.")
        r = tk.Frame(b, bg=CARD)
        r.pack(fill="x")
        self.snap = tk.StringVar()
        self.snaps = tk.OptionMenu(r, self.snap, "")
        self.snaps.configure(bg=BG, fg=TEXT, activebackground=LINE, activeforeground=TEXT, relief="flat", font=F, highlightthickness=1,
                             highlightbackground=LINE, width=34, anchor="w")
        self.snaps["menu"].configure(bg=CARD, fg=TEXT, font=F)
        self.snaps.pack(side="left")
        self.button(r, "restore to stick", self.restore, main=False).pack(side="left", padx=6)
        self.button(r, "open folder", lambda: (os.makedirs(BACKUPS, exist_ok=True), os.startfile(BACKUPS)), main=False).pack(side="left")

    def fill_backups(self):
        m = self.snaps["menu"]
        m.delete(0, "end")
        self.snapmap = {}
        if os.path.isdir(BACKUPS):
            for sid in sorted(os.listdir(BACKUPS)):
                d = os.path.join(BACKUPS, sid)
                for s in sorted(os.listdir(d), reverse=True) if os.path.isdir(d) else []:
                    label = f"{s}   ·   stick {sid[:6]}"
                    self.snapmap[label] = (sid, os.path.join(d, s))
        for t in self.snapmap:
            m.add_command(label=t, command=lambda t=t: self.snap.set(t))
        cur = self.snap.get()
        self.snap.set(cur if cur in self.snapmap else (next(iter(self.snapmap)) if self.snapmap else "no backups yet"))

    def restore(self):
        pick = self.snapmap.get(self.snap.get())
        L = self.picked_drive()
        if not pick:
            return messagebox.showinfo("Feather Setup", "No backup picked.")
        if not L or not os.path.isdir(f"{L}:\\Feather"):
            return messagebox.showinfo("Feather Setup", "Plug in the Feather stick (and let it sync once so it's renamed), then press ↻.")
        sid, src = pick
        root = f"{L}:\\Feather"
        try:
            cur = json.load(open(os.path.join(root, "feather.id"))).get("id")
        except Exception:
            cur = None
        if cur and cur != sid and not messagebox.askyesno("Feather Setup", "That backup is from a different stick. Restore it onto this one anyway?"):
            return
        inuse = os.path.join(root, "data", "in-use")
        if os.path.exists(inuse) and time.time() - os.path.getmtime(inuse) < 60:
            return messagebox.showinfo("Feather Setup", "Close the Feather window first.")
        if not messagebox.askyesno("Feather Setup", f"Put the backup from {os.path.basename(src)} back onto {L}:?\n\n"
                                                    "What's on the stick now is backed up first, so you can undo this."):
            return

        def go():
            data = os.path.join(root, "data")
            safety = os.path.join(BACKUPS, cur or sid, time.strftime("%Y-%m-%d %H%M%S") + " before restore")
            os.makedirs(os.path.join(safety, "paper"), exist_ok=True)
            for a in (os.path.join(data, "feather.enc"), os.path.join(root, "feather.id")):
                if os.path.exists(a):
                    shutil.copy2(a, safety)
            pdir = os.path.join(data, "paper")
            for fn in os.listdir(pdir) if os.path.isdir(pdir) else []:
                shutil.copy2(os.path.join(pdir, fn), os.path.join(safety, "paper", fn))
            self.say("  saved what was on the stick to", safety)
            shutil.copy2(os.path.join(src, "feather.enc"), os.path.join(data, "feather.enc"))
            if os.path.exists(os.path.join(src, "feather.id")):
                shutil.copy2(os.path.join(src, "feather.id"), os.path.join(root, "feather.id"))
            os.makedirs(pdir, exist_ok=True)
            n = 0
            for fn in os.listdir(os.path.join(src, "paper")) if os.path.isdir(os.path.join(src, "paper")) else []:
                shutil.copy2(os.path.join(src, "paper", fn), os.path.join(pdir, fn))
                n += 1
            self.say(f"  restored ({n} Paper pages). Unplug and plug it in to sync.")
        self.work("restoring a backup", go)


if __name__ == "__main__":
    Setup().mainloop()
