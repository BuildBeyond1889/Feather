// Feather's encryption on the phone: the same key as the laptops (scrypt of your password with this Feather's salt),
// the same AES-GCM boxes the PC hub speaks. Nothing here ever leaves the phone unencrypted.
"use strict";
const FC = (() => {
  const subtle = crypto.subtle;
  const te = new TextEncoder(), td = new TextDecoder();

  // ---- scrypt (N=32768, r=8, p=1, 32 bytes), as Python's hashlib.scrypt ----
  async function pbkdf2(pw, salt, len) {
    const k = await subtle.importKey("raw", pw, "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 1 }, k, len * 8));
  }
  function salsa(B) {  // Salsa20/8 core, in place on 16 words
    const x = B.slice();
    const R = (a, b) => (a << b) | (a >>> (32 - b));
    for (let i = 0; i < 8; i += 2) {
      x[4] ^= R(x[0] + x[12], 7); x[8] ^= R(x[4] + x[0], 9); x[12] ^= R(x[8] + x[4], 13); x[0] ^= R(x[12] + x[8], 18);
      x[9] ^= R(x[5] + x[1], 7); x[13] ^= R(x[9] + x[5], 9); x[1] ^= R(x[13] + x[9], 13); x[5] ^= R(x[1] + x[13], 18);
      x[14] ^= R(x[10] + x[6], 7); x[2] ^= R(x[14] + x[10], 9); x[6] ^= R(x[2] + x[14], 13); x[10] ^= R(x[6] + x[2], 18);
      x[3] ^= R(x[15] + x[11], 7); x[7] ^= R(x[3] + x[15], 9); x[11] ^= R(x[7] + x[3], 13); x[15] ^= R(x[11] + x[7], 18);
      x[1] ^= R(x[0] + x[3], 7); x[2] ^= R(x[1] + x[0], 9); x[3] ^= R(x[2] + x[1], 13); x[0] ^= R(x[3] + x[2], 18);
      x[6] ^= R(x[5] + x[4], 7); x[7] ^= R(x[6] + x[5], 9); x[4] ^= R(x[7] + x[6], 13); x[5] ^= R(x[4] + x[7], 18);
      x[11] ^= R(x[10] + x[9], 7); x[8] ^= R(x[11] + x[10], 9); x[9] ^= R(x[8] + x[11], 13); x[10] ^= R(x[9] + x[8], 18);
      x[12] ^= R(x[15] + x[14], 7); x[13] ^= R(x[12] + x[15], 9); x[14] ^= R(x[13] + x[12], 13); x[15] ^= R(x[14] + x[13], 18);
    }
    for (let i = 0; i < 16; i++) B[i] = (B[i] + x[i]) | 0;
  }
  function blockMix(B, Y, r) {
    const X = B.slice((2 * r - 1) * 16, 2 * r * 16);
    for (let i = 0; i < 2 * r; i++) {
      for (let j = 0; j < 16; j++) X[j] ^= B[i * 16 + j];
      salsa(X);
      Y.set(X, (i % 2 ? r + (i >> 1) : i >> 1) * 16);
    }
  }
  async function scrypt(password, saltHex, N = 32768, r = 8) {
    const pw = te.encode(password), salt = hex(saltHex);
    const B8 = await pbkdf2(pw, salt, 128 * r);
    const words = 32 * r, X = new Int32Array(words), Y = new Int32Array(words), V = new Int32Array(words * N);
    const dv = new DataView(B8.buffer);
    for (let i = 0; i < words; i++) X[i] = dv.getInt32(i * 4, true);
    for (let i = 0; i < N; i++) { V.set(X, i * words); blockMix(X, Y, r); X.set(Y); if (i % 4096 === 0) await new Promise((ok) => setTimeout(ok)); }
    for (let i = 0; i < N; i++) {
      const j = (X[(2 * r - 1) * 16] >>> 0) & (N - 1);
      for (let k = 0; k < words; k++) X[k] ^= V[j * words + k];
      blockMix(X, Y, r); X.set(Y);
      if (i % 4096 === 0) await new Promise((ok) => setTimeout(ok));
    }
    for (let i = 0; i < words; i++) dv.setInt32(i * 4, X[i], true);
    return pbkdf2(pw, B8, 32);
  }

  // ---- AES-GCM, as Python's AESGCM: 12-byte nonce in front ----
  const keyOf = (raw) => subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  async function seal(key, plain, aad) {
    const n = crypto.getRandomValues(new Uint8Array(12));
    const c = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: n, additionalData: te.encode(aad) }, key, plain));
    const out = new Uint8Array(12 + c.length); out.set(n); out.set(c, 12); return out;
  }
  async function open(key, raw, aad) {
    return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: te.encode(aad) }, key, raw.slice(12)));
  }
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  const gzip = (b) => pipe(b, new CompressionStream("gzip")), gunzip = (b) => pipe(b, new DecompressionStream("gzip"));

  // ---- the boxes the hub speaks (gzip + AES-GCM + base64) ----
  async function box(key, obj, aad = "feather-sync-v1") { return b64(await seal(key, await gzip(te.encode(JSON.stringify(obj))), aad)); }
  async function unbox(key, s, aad = "feather-sync-v1") { return JSON.parse(td.decode(await gunzip(await open(key, unb64(s), aad)))); }

  function hex(h) { const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
  function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); }
  function unb64(s) { const b = atob(s), o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  async function sha(u8) { const d = new Uint8Array(await subtle.digest("SHA-256", u8)); return Array.from(d.slice(0, 16), (x) => x.toString(16).padStart(2, "0")).join(""); }

  return { scrypt, keyOf, seal, open, box, unbox, b64, unb64, sha, te, td };
})();
if (typeof module !== "undefined") module.exports = FC;
