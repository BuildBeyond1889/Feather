// The same three-way merge as fsync.py, for the moment the phone changed something while a sync was on its way.
"use strict";
const FM = (() => {
  const MISSING = undefined;
  const TEXT = ["text", "front", "back", "notes", "q", "a", "title"];
  const KEEP_BOTH = new Set(["jots", "cards", "ideas/cards"]);
  const TIME = ["updated", "synced", "t", "edited", "seen", "started"];
  const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  const canon = (x) => JSON.stringify(x, (k, v) => (isObj(v) ? Object.keys(v).sort().reduce((o, kk) => ((o[kk] = v[kk]), o), {}) : v));
  const eq = (a, b) => a === b || (a !== MISSING && b !== MISSING && canon(a) === canon(b));
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => x.toString(16).padStart(2, "0")).join("");

  function merge3(b, l, r, path, ctx, prefer) {
    if (eq(l, r)) return l;
    if (b !== MISSING) { if (eq(l, b)) return r; if (eq(r, b)) return l; }
    if (isObj(l) && isObj(r)) {
      if (typeof l.t === "number" && typeof r.t === "number") prefer = l.t >= r.t ? "l" : "r";
      return mergeDict(isObj(b) ? b : MISSING, l, r, path, ctx, prefer);
    }
    if (Array.isArray(l) && Array.isArray(r)) return mergeList(Array.isArray(b) ? b : MISSING, l, r, path, ctx, prefer);
    return scalar(b, l, r, path, ctx, prefer);
  }
  function clash(b, l, r) {
    for (const k of TEXT) {
      const lv = l[k], rv = r[k];
      if (lv === rv || typeof lv !== "string" || typeof rv !== "string") continue;
      const bv = isObj(b) ? b[k] : MISSING;
      if (bv === MISSING || (lv !== bv && rv !== bv)) return true;
    }
    return false;
  }
  function dup(rec, ctx) {
    const c = JSON.parse(JSON.stringify(rec)), id = newId();
    if ("id" in c) c.id = id;
    for (const k of ["x", "y"]) if (typeof c[k] === "number") c[k] += 36;
    ctx.kept++;
    return [id, c];
  }
  function mergeDict(b, l, r, path, ctx, prefer) {
    const out = {}, extra = [], keys = [...Object.keys(r), ...Object.keys(l).filter((k) => !(k in r))];
    for (const k of keys) {
      const lv = k in l ? l[k] : MISSING, rv = k in r ? r[k] : MISSING, bv = b === MISSING || !(k in b) ? MISSING : b[k];
      if (lv === MISSING) { if (bv !== MISSING && eq(rv, bv)) continue; out[k] = rv; continue; }
      if (rv === MISSING) { if (bv !== MISSING && eq(lv, bv)) continue; out[k] = lv; continue; }
      if (KEEP_BOTH.has(path.join("/")) && isObj(lv) && isObj(rv) && clash(bv, lv, rv)) { out[k] = rv; extra.push(dup(lv, ctx)); continue; }
      out[k] = merge3(bv, lv, rv, [...path, k], ctx, prefer);
    }
    for (const [id, c] of extra) out[id] = c;
    return out;
  }
  const allIds = (a) => a.every((x) => isObj(x) && (typeof x.id === "string" || typeof x.id === "number"));
  function mergeList(b, l, r, path, ctx, prefer) {
    if (l.length && r.length && allIds(l) && allIds(r) && (b === MISSING || allIds(b))) return mergeKeyed(b, l, r, path, ctx, prefer);
    const ls = l.map(canon), rs = r.map(canon), count = (a) => a.reduce((m, s) => m.set(s, (m.get(s) || 0) + 1), new Map());
    if (b === MISSING) {
      const rc = count(rs), out = r.slice();
      l.forEach((x, i) => { if ((rc.get(ls[i]) || 0) > 0) rc.set(ls[i], rc.get(ls[i]) - 1); else out.push(x); });
      return out;
    }
    const bs = count(b.map(canon)), lc = count(ls), removed = new Map(), left = new Map(bs), added = [];
    for (const [s, n] of bs) { const d = n - (lc.get(s) || 0); if (d > 0) removed.set(s, d); }
    l.forEach((x, i) => { if ((left.get(ls[i]) || 0) > 0) left.set(ls[i], left.get(ls[i]) - 1); else added.push([x, ls[i]]); });
    const out = [];
    r.forEach((x, i) => { if ((removed.get(rs[i]) || 0) > 0) removed.set(rs[i], removed.get(rs[i]) - 1); else out.push(x); });
    const radded = count(rs);
    for (const [s, n] of bs) radded.set(s, (radded.get(s) || 0) - n);
    for (const [x, s] of added) { if ((radded.get(s) || 0) > 0) radded.set(s, radded.get(s) - 1); else out.push(x); }
    return out;
  }
  function mergeKeyed(b, l, r, path, ctx, prefer) {
    const bm = b === MISSING ? null : new Map(b.map((x) => [x.id, x])), lm = new Map(l.map((x) => [x.id, x])), rm = new Map(r.map((x) => [x.id, x]));
    const ids = [];
    for (const x of r) { if (!lm.has(x.id) && bm && bm.has(x.id) && eq(rm.get(x.id), bm.get(x.id))) continue; ids.push(x.id); }
    let prev = null;
    for (const x of l) {
      if (rm.has(x.id)) { prev = x.id; continue; }
      if (bm && bm.has(x.id) && eq(lm.get(x.id), bm.get(x.id))) continue;
      const at = prev === null ? 0 : ids.includes(prev) ? ids.indexOf(prev) + 1 : ids.length;
      ids.splice(at, 0, x.id); prev = x.id;
    }
    const out = [];
    for (const id of ids) {
      const lv = lm.get(id), rv = rm.get(id), bv = bm ? bm.get(id) : MISSING;
      if (lv === MISSING) out.push(rv);
      else if (rv === MISSING) out.push(lv);
      else if (KEEP_BOTH.has(path.join("/")) && isObj(lv) && isObj(rv) && clash(bv, lv, rv)) { out.push(rv); out.push(dup(lv, ctx)[1]); }
      else out.push(merge3(bv, lv, rv, [...path, id], ctx, prefer));
    }
    return out;
  }
  function scalar(b, l, r, path, ctx, prefer) {
    const last = path[path.length - 1] || "", nums = typeof l === "number" && typeof r === "number";
    if (nums && path[0] === "stats") return typeof b === "number" ? r + l - b : Math.max(l, r);
    if (nums && TIME.includes(last)) return Math.max(l, r);
    const quotes = path.join("/") === "settings/quotes";
    if (typeof l === "string" && typeof r === "string" && (TEXT.includes(last) || quotes)) {
      if (r.includes(l)) return r;
      if (l.includes(r)) return l;
      if (quotes) return [...new Set([...r.split("\n"), ...l.split("\n")])].join("\n");
      ctx.kept++;
      return `${r}\n\n— also written on ${ctx.name} —\n${l}`;
    }
    return prefer === "l" ? l : r;
  }
  function mergeStore(base, local, remote, name = "your phone") {
    const ctx = { name, kept: 0 };
    const m = merge3(isObj(base) ? base : MISSING, local, remote, [], ctx, "l");
    const out = isObj(m) ? m : { ...remote };
    out.updated = Math.max(local.updated || 0, remote.updated || 0);
    return out;
  }
  return { mergeStore, merge3, canon };
})();
if (typeof module !== "undefined") module.exports = FM;
