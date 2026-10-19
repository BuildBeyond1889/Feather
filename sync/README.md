# sync

The PC side. It runs quietly in the background on the home PC and waits for the stick.

## What happens when you plug the stick in

1. **Rename check.** A stick from before the rename (`ArchiePocket`) becomes `Feather`.
2. **Backup.** The stick's encrypted files are copied to `backups\<stick>\<time>`, still encrypted. The last 10 are kept, plus one a month.
3. **To Obsidian.** Reading logs, flashcards, exams, book highlights and new Paper pages are written into the vault's `Feather` folder as Markdown and PNG.
4. **From Obsidian.** Only the vault's `Feather\Notes` folder comes onto the stick: notes, plus PDFs, EPUBs and text files, which open in the reader in chapters.
5. **Calendar.** Changes made in Feather go into Archie's `calendar.json` and `deadlines.txt`, then the fresh calendar comes back.
6. **Extras.** The World news snapshot, banner pictures, the Vault and app updates are copied across.
7. **Done.** A small pop-up says what happened, with an **eject** button.

The first time a stick is seen, it asks for its password once and keeps the key protected by your Windows login (DPAPI).

## Files

| File | What it does |
|---|---|
| `feather_sync.py` | The background sync. Started with Windows by Feather Setup. Logs to `sync.log`. |
| `books.py` | Turns PDFs, plain-text books and EPUBs into chapters, and takes out Project Gutenberg's licence text. |
| `stickmaker.py` | Makes or updates a stick: the app, portable Python, the encryption library and the offline model. Feather Setup runs it; it also works on its own. |
| `Autostart on this laptop.bat` | Copied onto the stick. Run it on a laptop to make Feather open by itself when the stick goes in. |

Feather Setup's **check the stick** uses `check_stick` and `repair_stick` here: it opens every encrypted file with this PC's saved key and brings damaged ones back from the newest backup that opens.

`settings.json`, `paired.json`, `cache/` and `sync.log` are made on your PC and never go into the repo.
