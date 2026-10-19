# Security

Feather is built for one situation above all: a USB stick that gets lost. Whoever finds it should get nothing.

## What's encrypted

| What | Where | How |
|---|---|---|
| Notes, cards, books, exams, settings | `data/feather.enc` | AES-256-GCM, one file |
| Paper pages | `data/paper/<id>.enc` | AES-256-GCM, one file per page |
| Pictures and PDF pages in Paper | `data/paper/a<id>.enc` | AES-256-GCM |
| PC backups | `D:\Feather\backups` | copies of the encrypted files, never decrypted |

Each kind of file has its own associated data (`feather-paper`, `feather-asset`), so a file can't be swapped in as a different kind. Every write uses a fresh 96-bit nonce.

**Not encrypted:** `feather.id` (the salt and the stick's id, not secret), the app itself, the model, and the Vault libraries, which are public books.

## The key

- Derived from your password with scrypt (N = 2^15, r = 8, p = 1), 32 bytes.
- Held in memory only while Feather is unlocked. It locks after 15 minutes without use, and on eject.
- The password is never written anywhere. There is no recovery: a forgotten password means the data is gone, which is the point. Backups are the safety net for a lost or broken stick, not for a lost password.

## The home PC

The first time a stick syncs, the PC asks for the password once and stores the derived key protected by Windows DPAPI, tied to your Windows login on that PC. Another Windows account, or the same files on another PC, can't use it. Notes copied into Obsidian are plain Markdown on your own PC, as Obsidian notes always are.

## The local server

The app is a Python server on `127.0.0.1` at a random port, opened in an Edge app window.

- It only listens on loopback, so other machines can't reach it.
- Every request must carry a `Host` of `127.0.0.1` or `localhost` with the right port, which stops DNS-rebinding attacks from websites.
- A POST must come from Feather's own page (`Origin` check), so another website open in a browser can't send commands to it.
- Vault books that need JavaScript run in a sandboxed iframe without same-origin rights, so a book can't read your data or call the API.

## What it doesn't protect against

- Malware already running on the laptop while Feather is unlocked can read memory or screenshots.
- Someone who knows or watches you type your password.
- A modified copy of the app on a stick someone else had. Only run Feather from a stick you made.

## Reporting a problem

Open an issue, or email the author. Please don't include anyone's real data.
