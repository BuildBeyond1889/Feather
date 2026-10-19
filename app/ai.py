"""Feather: the offline model (llama.cpp on the stick) and everything that uses it.
Every function also has a no-model fallback, so Feather still works if the model is missing or slow."""
import json, os, re, random, socket, subprocess, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the Feather folder
LLM_DIR = os.path.join(ROOT, "llm")
_proc = None
_port = None
_log = None
LLM_LOG = os.path.join(ROOT, "llm.log")  # what the engine printed last time (for fixing problems)


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def available():
    return os.path.exists(os.path.join(LLM_DIR, "llama-server.exe")) and any(f.endswith(".gguf") for f in os.listdir(LLM_DIR) if os.path.isdir(LLM_DIR))


def start():
    """Start the model in the background (only once). Returns True when it's ready to answer."""
    global _proc, _port
    if _proc and _proc.poll() is None:
        return _ready()
    if not os.path.isdir(LLM_DIR) or not available():
        return False
    model = sorted(f for f in os.listdir(LLM_DIR) if f.endswith(".gguf"))[0]
    _port = _free_port()
    threads = max(2, (os.cpu_count() or 4) - 1)
    flags = 0x08000000 if sys.platform == "win32" else 0  # no console window
    global _log
    try:
        _log = open(LLM_LOG, "w", encoding="utf-8", errors="ignore")
    except OSError:
        _log = subprocess.DEVNULL
    _proc = subprocess.Popen([os.path.join(LLM_DIR, "llama-server.exe"), "-m", os.path.join(LLM_DIR, model),
                              "--port", str(_port), "--host", "127.0.0.1", "-c", "8192", "-t", str(threads)],
                             stdout=_log, stderr=subprocess.STDOUT, cwd=LLM_DIR, creationflags=flags)
    return False


def _ready():
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{_port}/health", timeout=1) as r:
            return r.status == 200
    except Exception:
        return False


def status():
    if not available():
        return "missing"
    if _proc is None:
        return "off"
    if _proc.poll() is not None:
        return "failed"
    return "ready" if _ready() else "loading"


def log_tail(n=25):
    try:
        with open(LLM_LOG, encoding="utf-8", errors="ignore") as f:
            lines = [l.rstrip() for l in f if l.strip()]
        code = _proc.poll() if _proc else None
        return lines[-n:] + ([f"(engine exited with code {code})"] if code is not None else [])
    except OSError:
        return []


def stop():
    global _proc
    if _proc and _proc.poll() is None:
        _proc.terminate()
    _proc = None


def chat(messages, max_tokens=700, want_json=False, temperature=0.3):
    """Ask the model. Returns text (or a dict when want_json), or None if the model isn't available."""
    if not available():
        return None
    if not start():
        for _ in range(480):  # wait up to ~4 min: a 2 GB model off a USB stick can be slow the first time
            time.sleep(0.5)
            if _ready():
                break
            if _proc is None or _proc.poll() is not None:  # it crashed or was stopped
                return None
        else:
            return None
    body = {"messages": messages, "max_tokens": max_tokens, "temperature": temperature}
    if want_json:
        body["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(f"http://127.0.0.1:{_port}/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            txt = json.loads(r.read())["choices"][0]["message"]["content"]
    except Exception:
        return None
    if not want_json:
        return txt.strip()
    m = re.search(r"\{.*\}", txt, re.S)
    try:
        return json.loads(m.group(0)) if m else None
    except Exception:
        return None


# ---------- notes helpers ----------
def clean(md):
    md = re.sub(r"^---\n.*?\n---\n", "", md, flags=re.S)       # frontmatter
    md = re.sub(r"!\[\[.*?\]\]|!\[.*?\]\(.*?\)", "", md)       # images
    md = re.sub(r"\[\[([^\]|]+)\|?([^\]]*)\]\]", lambda m: m.group(2) or m.group(1), md)
    md = re.sub(r"\[p\. \d+\]\n?", " ", md)                    # page marks from PDFs
    return md.strip()


def sentences(text):
    text = re.sub(r"[#>*_`]+", " ", text)
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if 40 <= len(s.strip()) <= 260]


STOP = set("the a an and or but of to in on at for with from by as is are was were be been this that these those it its into than then which who whom what when where why how not no can could should would will just also about there their they them very more most some such only other".split())


def key_terms(text):
    words = re.findall(r"[A-Za-z][A-Za-z\-]{3,}", text)
    freq = {}
    for w in words:
        lw = w.lower()
        if lw in STOP:
            continue
        freq[lw] = freq.get(lw, 0) + (2 if w[0].isupper() else 1)
    return [w for w, _ in sorted(freq.items(), key=lambda x: -x[1])][:40]


# ---------- mock exams ----------
def make_exam(notes, n=10, use_model=True):
    """notes: [(title, text)]. Returns a list of questions:
    {kind: mc|short|explain, q, options, answer, source, excerpt}"""
    notes = [(t, clean(x)) for t, x in notes if clean(x)]
    if not notes:
        return []
    qs = []
    if use_model:
        random.shuffle(notes)
        per = max(2, n // max(1, min(len(notes), 4)) + 1)
        for title, text in notes[:6]:
            if len(qs) >= n:
                break
            start = random.randint(0, max(0, len(text) - 3500)) if len(text) > 5000 else 0  # long readings: a different part each time
            chunk = text[start:start + 3500]
            out = chat([{"role": "system", "content": "You write exam questions ONLY from the study notes given. Never use outside facts. Reply with JSON only."},
                        {"role": "user", "content": f"Notes titled '{title}':\n\n{chunk}\n\nWrite {per} questions as JSON: "
                         '{"questions":[{"kind":"mc","q":"...","options":["...","...","...","..."],"answer":"exact text of the right option"},'
                         '{"kind":"short","q":"...","answer":"short model answer"},{"kind":"explain","q":"Explain ... in your own words","answer":"key points"}]}. '
                         "Mostly mc, some short, at most one explain. Every answer must be supported by the notes."}],
                       max_tokens=900, want_json=True)
            for q in (out or {}).get("questions", []):
                if not isinstance(q, dict) or not q.get("q") or not q.get("answer"):
                    continue
                if q.get("kind") == "mc":
                    opts = [str(o) for o in q.get("options", [])][:4]
                    if len(opts) < 3 or q["answer"] not in opts:
                        continue
                    random.shuffle(opts)
                    q["options"] = opts
                qs.append({"kind": q.get("kind", "short"), "q": q["q"], "options": q.get("options", []), "answer": q["answer"],
                           "source": title, "excerpt": chunk[:1500]})
    if len(qs) < n:
        qs += cloze(notes, n - len(qs))
    return qs[:n]


def cloze(notes, n):
    """No-model questions: a sentence from your notes with one key term blanked out, four choices."""
    out = []
    pool = []
    for title, text in notes:
        terms = key_terms(text)
        for s in sentences(text):
            for t in terms[:15]:
                if re.search(rf"\b{re.escape(t)}\b", s, re.I):
                    pool.append((title, s, t, terms))
                    break
    random.shuffle(pool)
    seen = set()
    for title, s, t, terms in pool:
        if s in seen:
            continue
        seen.add(s)
        others = [x for x in terms if x != t]
        if len(others) < 3:
            continue
        opts = random.sample(others[:12], 3) + [t]
        random.shuffle(opts)
        q = re.sub(rf"\b{re.escape(t)}\b", "_____", s, count=1, flags=re.I)
        out.append({"kind": "mc", "q": f"Fill the blank: {q}", "options": opts, "answer": t, "source": title, "excerpt": s})
        if len(out) >= n:
            break
    return out


def grade_answer(q, user_answer):
    """Grade a short/explain answer against the model answer and the notes. Returns {score 0..1, feedback}."""
    if q["kind"] == "mc":
        ok = user_answer.strip() == q["answer"]
        return {"score": 1.0 if ok else 0.0, "feedback": "" if ok else f"Answer: {q['answer']}"}
    out = chat([{"role": "system", "content": "You grade a student's answer strictly against the notes excerpt. Reply with JSON only."},
                {"role": "user", "content": f"Notes excerpt:\n{q.get('excerpt', '')[:1500]}\n\nQuestion: {q['q']}\nModel answer: {q['answer']}\n"
                 f"Student answer: {user_answer}\n\nJSON: {{\"score\": 0 to 1, \"feedback\": \"one or two sentences: what was right, what was missing\"}}"}],
               max_tokens=200, want_json=True)
    if out and "score" in out:
        try:
            return {"score": max(0.0, min(1.0, float(out["score"]))), "feedback": str(out.get("feedback", ""))}
        except Exception:
            pass
    want = set(key_terms(q["answer"])[:8])
    got = set(w.lower() for w in re.findall(r"[A-Za-z\-]{4,}", user_answer))
    sc = len(want & got) / max(1, len(want))
    return {"score": round(sc, 2), "feedback": f"Key points from your notes: {q['answer']}"}


# ---------- teach it back ----------
def teach_back(title, note, explanation):
    out = chat([{"role": "system", "content": "You are a tutor. Compare the student's explanation with their own notes. Be specific and encouraging. Reply with JSON only."},
                {"role": "user", "content": f"Notes on '{title}':\n{clean(note)[:3500]}\n\nStudent's explanation:\n{explanation}\n\n"
                 'JSON: {"right":["what they got right"],"missing":["important points from the notes they left out"],"wrong":["anything that contradicts the notes, with the correction"],"score":0-100}'}],
               max_tokens=700, want_json=True)
    if out:
        return {"right": out.get("right", []), "missing": out.get("missing", []), "wrong": out.get("wrong", []), "score": out.get("score"), "model": True}
    terms = key_terms(clean(note))[:15]
    said = explanation.lower()
    return {"right": [t for t in terms if t in said], "missing": [t for t in terms if t not in said], "wrong": [],
            "score": round(100 * sum(t in said for t in terms) / max(1, len(terms))), "model": False}


# ---------- books ----------
def ask_book(book, question):
    where = book.get("progress", {})
    notes = "\n".join(f"[{k}] {v.get('notes', '')}" for k, v in book.get("chapters", {}).items())[-3000:]
    out = chat([{"role": "system", "content": "You are a reading companion. The reader is partway through a physical book. "
                 "NEVER reveal anything that happens after their current position. If you're unsure whether something is a spoiler, don't say it. "
                 "If you don't know the book well, say so rather than guessing. Keep answers short."},
                {"role": "user", "content": f"Book: {book.get('title')} by {book.get('author')}. Reader is at: page {where.get('page', '?')}, {where.get('chapter', '')}.\n"
                 f"Their notes so far:\n{notes}\n\nQuestion: {question}"}], max_tokens=350)
    return out or "The model isn't available right now, so I can't answer questions about the book. Your notes and quotes are still saved."


REVIEW_QUESTIONS = [
    "In one sentence, what is this book about to you?",
    "What hit hardest? A moment, a character, an idea.",
    "What didn't work for you?",
    "Your favourite moment or line, and why.",
    "Who would you recommend it to, and who should skip it?",
    "How many stars out of 5?",
]


def build_review(book, answers):
    quotes = [q["text"] for q in book.get("quotes", [])][:5]
    notes = " ".join(v.get("notes", "") for v in book.get("chapters", {}).values())[:2500]
    qa = "\n".join(f"Q: {q}\nA: {a}" for q, a in zip(REVIEW_QUESTIONS, answers) if a.strip())
    out = chat([{"role": "system", "content": "Shape the reader's own answers into a book review in THEIR voice and wording. Do not add opinions they didn't give. "
                 "Keep their slang and tone. 150 to 300 words. No headings."},
                {"role": "user", "content": f"Book: {book.get('title')} by {book.get('author')}\n\nTheir answers:\n{qa}\n\nTheir reading notes (for detail):\n{notes}\n\n"
                 f"Quotes they saved (use at most one, exactly as written):\n" + "\n".join(quotes)}], max_tokens=600, temperature=0.5)
    if out:
        return out
    parts = [a.strip() for a in answers if a.strip()]
    return "\n\n".join(parts) + (f'\n\n"{quotes[0]}"' if quotes else "")


# ---------- ask Archie ----------
def find_notes(notes, question, n=3):
    """Your notes that best match the question (simple word overlap, title words count double)."""
    q = set(key_terms(question)) | {w.lower() for w in re.findall(r"[A-Za-z]{4,}", question) if w.lower() not in STOP}
    if not q:
        return []
    scored = []
    for path, nd in notes.items():
        title = os.path.splitext(os.path.basename(path))[0]
        body = nd.get("text", "").lower()
        s = sum(2 for w in q if w in title.lower()) + sum(1 for w in q if w in body)
        if s >= 2:
            scored.append((s, title, nd.get("text", "")))
    scored.sort(key=lambda x: -x[0])
    return [(t, txt) for _, t, txt in scored[:n]]


def _excerpt(text, question, size=1400):
    """The part of a note that mentions the question's words most."""
    words = [w for w in key_terms(question)][:8] or [""]
    low = text.lower()
    best, bi = -1, 0
    for i in range(0, max(1, len(text) - size + 1), 300):
        s = sum(low.count(w, i, i + size) for w in words)
        if s > best:
            best, bi = s, i
    return text[bi:bi + size]


def ask(question, history, notes, stories, countries, vault_hits=()):
    """Answer from the model, giving it your matching notes and World context. Returns (answer, sources, used_model)."""
    ctx, sources = [], []
    for v in vault_hits:
        ctx.append(f"[Vault · {v['name']} · {v['title']}]\n{v['passage']}")
        sources.append({"kind": "vault", "label": f"{v['name']} · {v['title']}", "book": v["book"], "path": v["path"]})
    for title, txt in notes:
        ctx.append(f"[note: {title}]\n{_excerpt(clean(txt), question)}")
        sources.append({"kind": "note", "label": title})
    for where, s in stories:
        lines = "; ".join(f"{i.get('source')}: {i.get('title')}" for i in s.get("items", [])[:4])
        when = time.strftime("%b %d", time.localtime(s.get("last") or s.get("t") or 0))
        ctx.append(f"[World · {where} · {when}] {s['title']}" + (f" ({s.get('place')})" if s.get("place") else "") + f"\n{lines}")
        sources.append({"kind": "world", "label": s["title"], "url": (s.get("items") or [{}])[0].get("url", "")})
    for c in countries:
        hos = ", ".join(f"{p.get('name')} (since {p.get('since') or '?'})" for p in c.get("hos") or [])
        hog = ", ".join(f"{p.get('name')} (since {p.get('since') or '?'})" for p in c.get("hog") or [])
        ctx.append(f"[World · governments] {c['name']}: {c.get('label') or ''}. {c.get('hosOffice') or 'Head of state'}: {hos or 'unknown'}. "
                   f"{c.get('hogOffice') or 'Head of government'}: {hog or 'unknown'}. Capital: {c.get('capital') or '?'}.")
        sources.append({"kind": "gov", "label": c["name"], "iso": c.get("iso2")})
    sys_p = ("You are Archie, a sharp, friendly offline assistant on a USB stick. Answer clearly and briefly. "
             "Use the context blocks when they're relevant and name them in brackets, like [Vault · Wikipedia · Title], [note: Title] or [World]. "
             "For facts, prefer the Vault passages over your memory. If the passages don't actually answer the question, ignore them; don't mention unrelated ones. "
             "Follow-up questions ('him', 'it', 'expand on that') are about the subject of your previous answer. "
             "If you aren't sure of a fact, say so instead of guessing. "
             "Your built-in knowledge is a couple of years old, so for anything recent trust the World context over memory, "
             "and say plainly when you don't know or aren't sure. Today is " + time.strftime("%B %d, %Y") + ".")
    msgs = [{"role": "system", "content": sys_p}]
    for h in history[-6:]:
        msgs += [{"role": "user", "content": h["q"]}, {"role": "assistant", "content": h["a"]}]
    msgs.append({"role": "user", "content": ("Context:\n" + "\n\n".join(ctx) + "\n\nQuestion: " if ctx else "") + question})
    a = chat(msgs, max_tokens=600, temperature=0.4)
    if a:
        return a, sources, True
    why = {"missing": "The model isn't on this stick.", "failed": "The model engine crashed (details in Settings).",
           "loading": "The model is still loading off the stick. Give it a minute and ask again."}.get(status(), "The model didn't answer in time.")
    if not ctx:
        return why + " Nothing in your notes or World matched either.", [], False
    return why + " Here's what matched in your notes and World:\n\n" + "\n\n".join(ctx), sources, False


# ---------- flashcards from a note or a document ----------
def make_cards(title, text, n=10):
    text = clean(text)
    if not text:
        return []
    start = random.randint(0, max(0, len(text) - 4000)) if len(text) > 6000 else 0
    chunk = text[start:start + 4000]
    out = chat([{"role": "system", "content": "You make study flashcards ONLY from the text given. Reply with JSON only."},
                {"role": "user", "content": f"Text from '{title}':\n\n{chunk}\n\nMake {n} flashcards as JSON: "
                 '{"cards":[{"front":"a clear question or term","back":"a short answer (one or two sentences)"}]}. '
                 "Cover the most important facts, terms and ideas. Every answer must come from the text."}],
               max_tokens=1100, want_json=True)
    cards = [{"front": str(c["front"]).strip(), "back": str(c["back"]).strip()} for c in (out or {}).get("cards", [])
             if isinstance(c, dict) and c.get("front") and c.get("back")]
    if len(cards) < n:  # no model (or it came up short): fill-the-blank cards from the text
        for q in cloze([(title, chunk)], n - len(cards)):
            cards.append({"front": q["q"].replace("Fill the blank: ", ""), "back": q["answer"]})
    return cards[:n]
