# Changelog

## 1.2 · Nov 12, 2026 · Phone, Sonia and Shelf

- **Feather on your phone.** An installable app (`phone/`) served by Archie on the home PC over Tailscale: Home, Read, Cards, Shelf and More. It works offline and keeps everything encrypted on the phone with the same password. Fingerprint unlock is available after the first password.
- **The hub moved into Archie.** Phone, laptops and the stick all sync through Archie on the PC (`sync/feather_hub.py`). The stick watcher still runs with Windows for plug-in syncs.
- **Sonia reads your books.** Ask for a chapter, a range or the whole book from the phone, a laptop or Archie. The PC makes it with Microsoft's Sonia voice, or one of seven others, or an accent voice overnight. It plays offline with the sentence she is reading lit up, and works from the lock screen and earbuds. Speed, volume and voice are saved and shared across devices. An overnight reader makes the next few chapters of what you're reading.
- **Shelf.** Send books, flashcard decks and mock exams between Feather and Archie, only when you press send, get or request.
- **Home on the phone:**
  - Next up with the event's name; tap it for a **Coming up** calendar (add, edit, remove; changes go to Archie at the next sync).
  - **Today** (today's events and cards due, with your streak).
  - **Sonia** (chapters ready on the phone), **Quiz me** (your latest mock exam) and **World** (the day's biggest stories from Archie).
  - Banner paintings and quotes from Archie.
- **Quick notes from Archie.** "note to feather: …" in Archie, or a Markdown file on its inbox card, lands in Feather on every device.
- **Laptops:** a Sonia player in the reader with a "Sonia ⌄" menu, the Shelf page, Ideas and Nest pages, and the opening animation.

## 1.1 · Feather everywhere

- **Install on a laptop.** `Install Feather on this laptop.bat` on the stick puts Feather on the laptop for good, with your data, still encrypted, same password.
- **Sync through the PC.** Installed copies keep themselves the same through the home PC (Archie's sealed connection, at home or over Tailscale). Changes made offline wait and go later.
- **Paper merges stroke by stroke.** Drawing the same page on two laptops loses no ink. Quick notes, flashcards and idea cards edited on both keep both versions.
- **Small additions only:** a sync badge in the menu, "1 new" dots, a "From the Surface" card on Home, "on the ThinkPad too" under Paper's saved label, and Devices & sync in Settings.
- **The stick still works on its own** and catches up with the laptops when it is plugged into the PC.

## 1.0 — October 2026

The first release under the name Feather (it started as Archie Pocket).

**New**
- Feather Setup: one window to set up PC sync, make or update a stick, and restore backups. Replaces the four .bat files.
- Encrypted backups of the stick on every sync (the last 10, plus one a month).
- Demo mode with a made-up student, for showing the app without real data.
- About screen with version, release notes and credits; your name in Settings.
- First-run tour.
- Calendar: Archie's countdowns and events on the home screen can be changed, added and removed in Feather; changes go back into Archie at the next PC sync. Weekly classes show their next time.
- The left menu narrows to icons ([ key), Paper's page strip tucks away, the canvas map folds to a button (M), and home cards open from anywhere on the card.
- Late at night: The Quiet Hours.
- Edit, move and delete flashcards; rename or delete a whole deck. Delete notebooks and books. Deleting asks for a second tap instead of a pop-up.
- Only Obsidian's `Feather\Notes` folder goes onto the stick (notes, plus PDFs and text files for Documents).
- The local server now refuses requests from other websites and other hosts.
- Changing your password re-encrypts every file on the stick (Paper pages, pictures, books), not just the main store.
- Check the stick (Feather Setup): opens every encrypted file and repairs damaged ones from your backups; books are rebuilt at the next sync.
- Ctrl+K searches a word index built when Feather unlocks: a few milliseconds even with 20 long books.
- Automatic tests, run by GitHub on every push.

**Paper**
- Notebooks, an endless canvas and flipbooks with onion skin and GIF export.
- Pen, finger or any stylus, with palm rejection and a wrist guard.
- PDF and picture import, sticky notes and text boxes. Notes and text boxes can be moved, resized, recoloured, given a font (serif by default, handwriting, sans, mono) and a size; a small arrow on each sticky folds it down to its first line.
- A move tool (V) for scrolling and dragging things around without drawing or making new text.
- Handwriting recognition (Windows Ink) makes pages searchable; stroke replay.
- Lasso a question and an answer to make a flashcard.

**Reader**
- Books from your notes folder open in a reader: EPUB and plain-text books are split into chapters (War and Peace comes out as its 365 chapters), PDFs by page.
- Highlight in four colours, add notes to highlights, save passages as quotes, turn them into flashcards, look words up.
- Contents, Highlights and Find in this book; keeps your place and shows how far through you are.
- Digital books show up in Reading and on the home screen; highlights and notes go to Obsidian with the book.
- Project Gutenberg's licence text is taken out, and whole books are searchable (no more cut-off after 2 million characters). Each book is its own encrypted file, so the main store stays small.

**Study**
- Ctrl+K search across everything, offline dictionary, mastery map, curiosity card, Today strip.
- Ask follows up on the last subject; better ranking for Vault answers.

**Renamed**
- The stick folder is now `Feather` (was `ArchiePocket`), the PC folder `D:\Feather`, the Obsidian folder `Feather` (was `Pocket`). Existing sticks and PCs are moved over automatically on the first sync.
