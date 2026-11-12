"""
sonia_render.py - one chapter read by Sonia, for Feather's offline audio.

Run by the Feather hub (inside Archie) with the voice's own Python (Archie\\Voice\\kokoro\\env),
which has edge-tts and miniaudio (Tools\\Get Sonia Voice.bat). Nothing is written to disk:

  stdin   {"paras": ["first paragraph", ...], "voice": "en-GB-SoniaNeural"}
  stdout  {"ok": true, "mp3": "<base64>", "paras": [{"t0": ms, "dur": ms, "w": [[char, ms], ...]}, ...]}
          {"ok": false, "why": "..."}
  stderr  "p <done> <total>" after each paragraph (progress)

Each paragraph is its own request, so its start time in the chapter is exact; "w" is when each
word starts, counted from the start of its paragraph, with the word's position in the paragraph.
The paragraphs' MP3s are joined end to end (same encoder settings, so they play as one file).
Speed is set on the device when it plays, so one recording suits every speed.
"""

import asyncio
import base64
import json
import sys


async def para_audio(edge_tts, text, voice):
    buf, words = bytearray(), []
    for attempt in range(3):
        buf, words = bytearray(), []
        try:
            com = edge_tts.Communicate(text, voice, boundary="WordBoundary")
            async for ch in com.stream():
                if ch.get("type") == "audio":
                    buf += ch["data"]
                elif ch.get("type") == "WordBoundary":
                    words.append((int(ch["offset"]) / 10000.0, str(ch.get("text") or "")))
            if buf:
                return bytes(buf), words
        except Exception:
            if attempt == 2:
                raise
            await asyncio.sleep(2 + attempt * 3)
    raise RuntimeError("no audio came back")


def main():
    try:
        import edge_tts
        import miniaudio
    except ImportError as e:
        print(json.dumps({"ok": False, "why": f"Sonia isn't set up on this PC ({e.name}): run Archie\\Tools\\Get Sonia Voice.bat"}))
        return
    try:
        req = json.loads(sys.stdin.read())
        paras, voice = [str(p) for p in req.get("paras") or []], req.get("voice") or "en-GB-SoniaNeural"
    except ValueError:
        print(json.dumps({"ok": False, "why": "bad request"}))
        return

    async def run():
        out, info, t = bytearray(), [], 0.0
        for i, p in enumerate(paras):
            text = p.strip()
            if not text:
                info.append({"t0": round(t), "dur": 0, "w": []})
                continue
            mp3, words = await para_audio(edge_tts, text, voice)
            fi = miniaudio.mp3_get_info(mp3)
            dur = fi.num_frames * 1000.0 / fi.sample_rate
            lead = len(p) - len(p.lstrip())
            w, pos = [], 0
            for ms, word in words:              # where each spoken word sits in the paragraph
                j = p.find(word, pos) if word else -1
                if j < 0:
                    continue
                w.append([j, round(ms)])
                pos = j + len(word)
            if not w or w[0][0] > lead:
                w.insert(0, [lead, 0])
            info.append({"t0": round(t), "dur": round(dur), "w": w})
            out += mp3
            t += dur
            sys.stderr.write(f"p {i + 1} {len(paras)}\n")
            sys.stderr.flush()
        return bytes(out), info

    try:
        mp3, info = asyncio.run(run())
    except Exception as e:
        print(json.dumps({"ok": False, "why": f"Sonia couldn't be reached ({type(e).__name__}: {e})"}))
        return
    print(json.dumps({"ok": True, "mp3": base64.b64encode(mp3).decode("ascii"), "paras": info}))


if __name__ == "__main__":
    main()
