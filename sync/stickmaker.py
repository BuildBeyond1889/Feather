"""Make (or update) a Feather USB stick. Feather Setup runs this for you; it also works on its own:  python stickmaker.py

It copies onto the stick:  Feather\\app (the app), \\python (portable Python), \\lib (encryption library),
\\llm (the offline model: llama.cpp + a ~2 GB model), and "Start Feather.bat" at the top of the stick.
Your data on the stick (Feather\\data, feather.id) is never touched, so it's safe to run again to update.
An old ArchiePocket folder on the stick is renamed to Feather first.
"""
import ctypes, os, shutil, string, subprocess, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)  # D:\\Feather
PY_URL = "https://www.python.org/ftp/python/3.12.8/python-3.12.8-embed-amd64.zip"
MODEL_URL = "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf"
MODEL_NAME = "qwen2.5-3b-instruct-q4_k_m.gguf"


def drives():
    out = []
    bitmask = ctypes.windll.kernel32.GetLogicalDrives()
    for i, L in enumerate(string.ascii_uppercase):
        if bitmask >> i & 1 and ctypes.windll.kernel32.GetDriveTypeW(f"{L}:\\") == 2:  # 2 = removable
            free = ctypes.c_ulonglong(0)
            ctypes.windll.kernel32.GetDiskFreeSpaceExW(f"{L}:\\", None, None, ctypes.byref(free))
            name = ctypes.create_unicode_buffer(64)
            ctypes.windll.kernel32.GetVolumeInformationW(f"{L}:\\", name, 64, None, None, None, None, 0)
            out.append((L, name.value or "USB", free.value / 1e9))
    return out


def download(url, dest, label, say=print):
    say(f"  downloading {label}…")
    tmp = dest + ".part"
    req = urllib.request.Request(url, headers={"User-Agent": "Feather"})
    with urllib.request.urlopen(req) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        got = 0
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
            got += len(b)
            if total and (got >> 20) % 25 == 0:
                say(f"  {got / 1e6:,.0f} / {total / 1e6:,.0f} MB")
    os.replace(tmp, dest)


def make(L, say=print, want_model=lambda: True):
    """Build or update the Feather stick on drive L. `say` gets progress lines; `want_model()` decides the 2 GB download."""
    old, T = f"{L}:\\ArchiePocket", f"{L}:\\Feather"
    if os.path.isdir(old) and not os.path.exists(T):
        os.rename(old, T)
        say("  renamed ArchiePocket → Feather")
    os.makedirs(T, exist_ok=True)
    sys.path.insert(0, HERE)
    import feather_sync

    say("1/4 the app")
    n = feather_sync.update_app(T)  # copies app\\, start files, the laptop autostart file; removes old names
    say(f"  {n} files updated" if n else "  already up to date")
    for fn in ("archie-pocket.ico",):
        if os.path.exists(os.path.join(T, fn)):
            os.remove(os.path.join(T, fn))
    icon = os.path.join(BASE, "icon", "feather.ico")
    if os.path.exists(icon):
        shutil.copy(icon, os.path.join(T, "feather.ico"))

    say("2/4 portable Python")
    if not os.path.exists(os.path.join(T, "python", "pythonw.exe")):
        z = os.path.join(T, "python.zip")
        download(PY_URL, z, "Python 3.12 (11 MB)", say)
        zipfile.ZipFile(z).extractall(os.path.join(T, "python"))
        os.remove(z)
    else:
        say("  already there")

    say("3/4 encryption library")
    if not os.path.isdir(os.path.join(T, "lib", "cryptography")):
        subprocess.run([sys.executable, "-m", "pip", "install", "cryptography", "--target", os.path.join(T, "lib"), "--platform", "win_amd64",
                        "--python-version", "3.12", "--implementation", "cp", "--only-binary=:all:", "--upgrade", "--quiet"],
                       check=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    else:
        say("  already there")

    say("4/4 the offline model")
    llm = os.path.join(T, "llm")
    os.makedirs(llm, exist_ok=True)
    if not os.path.exists(os.path.join(llm, "llama-server.exe")):
        say("  getting the model engine (llama.cpp)…")
        say("  " + (feather_sync.ensure_engine(T) or "already there"))
    feather_sync.ensure_runtime(os.path.join(T, "python"))  # the C++ runtime for the Vault reader
    feather_sync.ensure_wheels(T)  # the math engine
    if not any(f.endswith(".gguf") for f in os.listdir(llm)):
        if want_model():
            download(MODEL_URL, os.path.join(llm, MODEL_NAME), "Qwen2.5 3B (about 2 GB)", say)
    else:
        say("  already there")
    say("Done. On any laptop: open the stick and double-click  Start Feather.bat")
    say("The first time, it asks you to make a password.")
    return T


def main():
    print("\n  FEATHER · make or update a stick\n")
    ds = drives()
    if not ds:
        input("  No USB stick found. Plug it in and run this again. (Enter to close)")
        return
    for n, (L, name, free) in enumerate(ds, 1):
        print(f"  {n}. {L}:  {name}  ({free:.1f} GB free)")
    pick = input("\n  Which one is the Feather stick? number: ").strip()
    try:
        L = ds[int(pick) - 1][0]
    except Exception:
        return print("  Cancelled.")
    make(L, want_model=lambda: input("  Download the offline model now? About 2 GB. [Y/n] ").strip().lower() != "n")
    input("\n  Enter to close")


if __name__ == "__main__":
    main()
