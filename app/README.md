# app

The part of Feather that runs from the USB stick. `Start Feather.bat` on the stick runs `feather.py` with the stick's own portable Python, and it opens in an Edge app window. Nothing gets installed on the laptop.

## How it fits together

`feather.py` is a small web server that only listens on the laptop itself (`127.0.0.1`, a random port). The interface in `web/` talks to it. Close the window and the server stops and everything locks.

Everything personal is held in memory only while Feather is unlocked. On the stick it's encrypted (see [docs/SECURITY.md](../docs/SECURITY.md)).

## Files

| File | What it does |
|---|---|
| `feather.py` | The server: every `/api/...` route, the window, idle lock, eject, Paper, the reader, the calendar. `--demo` opens a made-up student's Feather instead of yours. |
| `store.py` | The encrypted store: one AES-256-GCM file (`data/feather.enc`), key from your password with scrypt. |
| `ai.py` | The offline model (llama.cpp running Qwen2.5 3B from `llm/`): Ask, mock exams, study sessions, teach-it-back, flashcards. Each feature has a no-model fallback. |
| `vault.py` | Reads the Vault's offline libraries (Kiwix `.zim` files: Wikipedia, textbooks). |
| `world.py` | The World tab: the news snapshot from the last PC sync, and a live refresh when the laptop is online. |
| `mathtutor.py` | The math tutor: 57 topics, a problem generator for each, answers checked with SymPy, a placement quiz. |
| `searchidx.py` | The Ctrl+K word index, built in the background when Feather unlocks. |
| `demo.py` | Fills demo mode with sample notes, cards, books, Paper pages and dates. |
| `ink.ps1` | Reads handwriting with Windows' built-in recognizer, so Paper pages are searchable. |
| `ocr.ps1` | Reads text off photos with Windows' built-in OCR. |
| `watch.ps1` | Laptop autostart: opens Feather when the stick is plugged in. |

## web/

Plain JavaScript and CSS, no framework and no build step.

| File | What it does |
|---|---|
| `app.js` | The shell, router and most screens: lock screen, home, Reading, Documents, cards, exams, math, settings, calendar. |
| `paper.js` | Paper: pressure strokes, camera, palm rejection, lasso, sticky notes and text boxes, flipbooks, PDF import. |
| `reader.js` | The book reader: chapters, highlights, notes, find, full screen. |
| `extras.js` | Ctrl+K search, the dictionary, Q/A flashcard sets, the mastery map, the curiosity card. |
| `style.css` | All styles, including the time-of-day colours. |

Bundled libraries keep their own licences next to them: `pdfjs/` (Apache 2.0), `katex/` (MIT), `gifenc.js` (MIT), `fonts/` (SIL OFL).
