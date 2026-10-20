const enc = new TextEncoder();

export const now = () => Math.floor(Date.now() / 1000);
export const today = () => new Date().toISOString().slice(0, 10);
export const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

export function b64url(buf) {
  let s = '';
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

export async function sha(msg) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(msg))).slice(0, 16);
}

export function randomUid() {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return b64url(a).replace(/[-_]/g, 'x').toLowerCase().slice(0, 12);
}

export async function signToken(env, uid) {
  return uid + '.' + (await hmac(env.TOKEN_SECRET, uid)).slice(0, 22);
}

export async function verifyToken(env, token) {
  if (!token || !env.TOKEN_SECRET) return null;
  const i = token.indexOf('.');
  if (i < 1) return null;
  const uid = token.slice(0, i);
  if (!/^[a-z0-9]{12}$/.test(uid)) return null;
  const expect = await signToken(env, uid);
  return timingSafeEqual(expect, token) ? uid : null;
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { Vary: 'Origin' };
  if (allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Admin-Key';
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } });
}

// Определяет тип по первым байтам: клиентскому Content-Type доверять нельзя
export function sniffImage(u8) {
  if (u8.length > 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'image/jpeg';
  if (u8.length > 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'image/png';
  if (u8.length > 12 && u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return 'image/webp';
  return null;
}
