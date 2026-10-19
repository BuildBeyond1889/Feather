"""Feather demo: a made-up student's Feather, for showing the app or recording it. Nothing here is real.

Started with  feather.py --demo  (or "Feather Demo.bat" on the stick). It lives in its own folder (demo/, demo.id),
uses the password "demo", and never opens your real data.
"""
import json, math, os, random, secrets, time

PASSWORD = "demo"
DAY = 86400


def _strokes_wave(x0, y0, length, rows=1, gap=44, amp=8, seed=1):
    """Squiggly 'handwriting' lines (the demo has no real handwriting)."""
    rnd, out = random.Random(seed), []
    for r in range(rows):
        x, y, pts = x0, y0 + r * gap, []
        end = x0 + length * (0.6 + 0.4 * rnd.random())
        while x < end:
            pts += [round(x, 1), round(y + math.sin(x / 9.0 + r) * amp + rnd.uniform(-2, 2), 1), round(0.55 + 0.3 * rnd.random(), 2)]
            x += 7
        out.append({"k": "p", "c": 0, "w": 3, "p": pts})
    return out


def _circle(cx, cy, r, c=0, n=48):
    pts = []
    for i in range(n + 1):
        a = i / n * 2 * math.pi
        pts += [round(cx + r * math.cos(a), 1), round(cy + r * math.sin(a), 1), 0.7]
    return {"k": "p", "c": c, "w": 3, "p": pts}


def _line(x0, y0, x1, y1, c=0, n=16):
    return {"k": "p", "c": c, "w": 3, "p": [v for i in range(n + 1) for v in (round(x0 + (x1 - x0) * i / n, 1), round(y0 + (y1 - y0) * i / n, 1), 0.7)]}


def _sticky(x, y, text, c=0):
    return {"k": "t", "sticky": True, "text": text, "c": c, "fs": 26, "x": x, "y": y, "w": 240, "h": 240}


def _text(x, y, text, w=420, fs=30):
    return {"k": "t", "sticky": False, "text": text, "c": 0, "fs": fs, "x": x, "y": y, "w": w, "h": 50}


NOTES = {
    "Robotics/Ohm's law.md": "Ohm's law: V = I x R. Voltage (volts) equals current (amps) times resistance (ohms).\n\n"
    "An LED needs about 20 mA. With a 5 V supply and an LED that drops 2 V, the resistor needs to drop 3 V, so R = 3 / 0.02 = 150 ohms.\n\n"
    "Power in a resistor is P = I x V. Pick a resistor rated at least twice the power it will burn.",
    "Robotics/Servo basics.md": "A hobby servo turns to an angle set by a pulse every 20 ms. A 1 ms pulse is about 0 degrees, 1.5 ms is the middle, 2 ms is about 180 degrees.\n\n"
    "Servos draw a lot of current when they start moving, so power them from their own supply and connect the grounds together.",
    "Biology/Photosynthesis.md": "Photosynthesis turns light energy into chemical energy. Plants take in carbon dioxide and water and, using sunlight, make glucose and release oxygen.\n\n"
    "It happens in the chloroplasts. Chlorophyll absorbs red and blue light and reflects green.\n\n"
    "Two stages: the light-dependent reactions (make ATP and NADPH) and the Calvin cycle (fixes carbon into sugar).",
    "Game design/Level flow.md": "A good level teaches one idea, tests it, then twists it.\n\n"
    "Pacing: tension, release, tension. Put a safe room after every hard fight.\n\n"
    "Guide the player with light and colour instead of arrows.",
    "Animation/12 principles.md": "Squash and stretch, anticipation, staging, straight ahead and pose to pose, follow through, slow in and slow out, arcs, "
    "secondary action, timing, exaggeration, solid drawing, appeal.\n\nTiming sells weight: heavy things take more frames to start and stop.",
}

CARDS = [
    ("What does Ohm's law say?", "V = I x R", "Robotics", ""),
    ("Resistor for a 2 V LED at 20 mA on 5 V?", "150 ohms", "Robotics", "Drop 3 V at 0.02 A"),
    ("Pulse width for a servo's middle position?", "About 1.5 ms", "Robotics", ""),
    ("Where does photosynthesis happen?", "In the chloroplasts", "Biology", ""),
    ("What does chlorophyll reflect?", "Green light", "Biology", "Why leaves look green"),
    ("Products of photosynthesis?", "Glucose and oxygen", "Biology", ""),
    ("Teach, test, ...?", "Twist", "Game design", "How a good level is built"),
    ("Which principle sells weight?", "Timing", "Animation", ""),
    ("Name the principle: a small move before a big one", "Anticipation", "Animation", ""),
]


def seed(P):
    """Fill a brand-new demo store with sample data. P is unlocked with the demo password."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    D, now = P.data, int(time.time())
    D["settings"]["name"] = "Sam"
    D["settings"]["quotes"] = '"Well begun is half done." (Aristotle)\n"The best way out is always through." (Robert Frost)'
    D["notes"] = {k: {"text": v, "t": now - DAY * (i + 1)} for i, (k, v) in enumerate(NOTES.items())}
    bid = "demobook01"
    D["books"][bid] = {"id": bid, "title": "Meditations", "author": "Marcus Aurelius", "pages": 254, "started": now - 20 * DAY, "t": now - DAY,
                       "progress": {"page": 112, "chapter": "Book 4"}, "people": ["Marcus", "Rusticus"],
                       "log": [{"t": now - d * DAY, "page": 112 - d * 9, "chapter": "Book 4"} for d in range(6, 0, -1)],
                       "chapters": {"Book 2": {"notes": "Start the day expecting difficult people, and don't let them pull you off course.", "tags": ["big moment"], "t": now - 9 * DAY},
                                    "Book 4": {"notes": "The obstacle becomes the way. What stands in the way becomes the way.", "tags": ["loved this"], "t": now - DAY}},
                       "quotes": [{"id": "q1", "text": "The impediment to action advances action. What stands in the way becomes the way.", "page": 108, "t": now - DAY}]}
    for i, (f, b, deck, hint) in enumerate(CARDS):
        cid = f"democard{i:02d}"
        c = {"id": cid, "front": f, "back": b, "deck": deck, "due": now - 3600 if i % 2 == 0 else now + (i + 2) * DAY,
             "interval": 0 if i % 2 == 0 else 6 + i * 2, "ease": 2.5, "reps": 0 if i % 2 == 0 else 3, "t": now - 10 * DAY}
        if hint:
            c["hint"] = hint
        D["cards"][cid] = c
    rv = {time.strftime("%Y-%m-%d", time.localtime(now - d * DAY)): n for d, n in zip(range(6, -1, -1), [8, 14, 0, 11, 20, 9, 6])}
    mth = {time.strftime("%Y-%m-%d", time.localtime(now - d * DAY)): n for d, n in zip(range(4, -1, -1), [5, 7, 3, 9, 4])}
    D["stats"] = {"reviews": rv, "math": mth}
    D["math"] = {"placement_done": True, "placed": ["f_add", "f_order", "f_neg", "f_frac", "f_dec"],
                 "topics": {"f_ratio": {"right": 9, "seen": 10, "streak": 6, "recent": [1, 1, 1, 1, 1, 1]},
                            "f_exp": {"right": 5, "seen": 8, "streak": 2, "recent": [1, 0, 1, 1, 0, 1, 1]},
                            "f_expr": {"right": 2, "seen": 4, "streak": 1, "recent": [0, 1, 0, 1]}}}
    D["exams"] = [{"id": "demoexam1", "title": "Robotics", "score": 84, "weak": ["Servo basics"], "t": now - 3 * DAY, "n": 10},
                  {"id": "demoexam2", "title": "Biology", "score": 71, "weak": ["Photosynthesis"], "t": now - DAY, "n": 8}]
    D["teach"] = [{"path": "Biology/Photosynthesis.md", "score": 7, "t": now - 2 * DAY}]
    today = time.time()
    D["deadlines"] = [{"id": f"demodl{i}", "src": "dl", "date": time.strftime("%Y-%m-%d", time.localtime(today + d * DAY)), "what": w, "kind": k, **({"time": t} if t else {}),
                       "orig": {"date": time.strftime("%Y-%m-%d", time.localtime(today + d * DAY)), "what": w}}
                      for i, (d, w, k, t) in enumerate([(2, "Biology quiz", "quiz", "10:00"), (4, "Portfolio pieces picked", "deadline", None),
                                                        (11, "College application due", "deadline", None), (25, "Robot arm demo", "event", "14:30")])]
    # Paper: a notebook page, a canvas of ideas and a little flipbook
    folder = os.path.join(P.data_dir, "paper")
    os.makedirs(folder, exist_ok=True)

    def put(pid, strokes):
        nonce = secrets.token_bytes(12)
        body = json.dumps({"strokes": strokes}, separators=(",", ":")).encode()
        open(os.path.join(folder, pid + ".enc"), "wb").write(nonce + AESGCM(P.key).encrypt(nonce, body, b"feather-paper"))

    page = [_text(110, 80, "Ohm's law", fs=40)] + _strokes_wave(110, 184, 700, rows=5, seed=3) + [_circle(560, 640, 70), _line(320, 640, 490, 640), _line(630, 640, 800, 640)] + _strokes_wave(110, 800, 520, rows=3, seed=7)
    board = [_text(-40, -260, "Tide Temple: level ideas", w=700, fs=44),
             _sticky(-40, -160, "Boss fight: the tide rises each phase", 0), _sticky(230, -160, "Safe room after the flooded hall", 1),
             _sticky(500, -160, "Teach: swim. Test: currents. Twist: the tide turns", 2), _sticky(-40, 120, "Light guides the player, not arrows", 3),
             _circle(560, 230, 80, 1), _line(250, 230, 470, 230, 1), _line(650, 230, 760, 230, 1)]
    def ball(cx, cy, r, sq=1.0, n=40):  # squash: wider and shorter when it hits the ground
        pts = []
        for k in range(n + 1):
            a = k / n * 2 * math.pi
            pts += [round(cx + r / sq * math.cos(a), 1), round(cy + r * sq * math.sin(a), 1), 0.7]
        return {"k": "p", "c": 1, "w": 4, "p": pts}
    ground, r = 560, 45
    frames = []
    for i in range(9):  # one bounce across the top of the page, so the whole ball is always in view
        t = i / 8
        hgt = 300 * abs(math.cos(math.pi * t))
        sq = 0.72 if i == 4 else 1.0
        cy = ground - r * sq - hgt
        frames.append([ball(170 + 660 * t, cy, r, sq), _line(90, ground, 910, ground)])
    pid1, pid2 = "d0000000a001", "d0000000b001"
    put(pid1, page)
    put(pid2, board)
    flip = []
    for i, fr in enumerate(frames):
        pid = f"d0000000c{i:03d}"
        put(pid, fr)
        flip.append({"id": pid, "tpl": "blank"})
    D["paper"] = {"nbs": {
        "dd0000000001": {"title": "Robotics", "t": now - DAY, "theme": "dark", "kind": "pages", "pages": [{"id": pid1, "tpl": "lined"}]},
        "dd0000000002": {"title": "Game ideas", "t": now - 2 * DAY, "theme": "dark", "kind": "canvas", "pages": [{"id": pid2, "tpl": "dot"}]},
        "dd0000000003": {"title": "Bouncing ball", "t": now - 3 * DAY, "theme": "dark", "kind": "flip", "pages": flip}},
        "text": {pid1: "Ohm's law\nV = I x R", pid2: "Tide Temple: level ideas\nBoss fight: the tide rises each phase\nSafe room after the flooded hall"}}
    P.save()
