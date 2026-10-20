import { json, sniffImage, now, num } from './util.js';
import { tryInc } from './quota.js';

const WRAP = {
  avatar: (p) => 'profile picture avatar, ' + p + ', centered portrait, clean background, high detail',
  photo: (p) => p + ', photorealistic, natural light, high detail',
  art: (p) => p + ', digital art, trending on artstation, vivid colors'
};
const SIZE = { avatar: [768, 768], photo: [1024, 768], art: [1024, 1024] };

// Возвращает Response с картинкой либо null, если генератор недоступен
export async function generateImage(env, mode, prompt) {
  const w = WRAP[mode] ? mode : 'avatar';
  const full = WRAP[w](prompt);
  const [width, height] = SIZE[w];
  const seed = Math.floor(Math.random() * 1e9);
  let url, headers = {};
  if (env.IMAGE_API_URL) {
    url = env.IMAGE_API_URL + '?prompt=' + encodeURIComponent(full) + '&width=' + width + '&height=' + height + '&seed=' + seed;
    if (env.IMAGE_API_KEY) headers.Authorization = 'Bearer ' + env.IMAGE_API_KEY;
  } else {
    url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(full) + '?width=' + width + '&height=' + height + '&seed=' + seed + '&nologo=true&model=flux';
  }
  const r = await fetch(url, { headers });
  const type = r.headers.get('Content-Type') || '';
  if (!r.ok || !type.startsWith('image/')) return null;
  return new Response(r.body, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
}

// Классификатор через Hugging Face Inference. Эндпоинт и модель меняются в env.
export async function detectAi(env, bytes) {
  if (!env.HF_TOKEN) return { error: 'not_configured' };
  const url = env.DETECT_URL || 'https://api-inference.huggingface.co/models/' + (env.DETECT_MODEL || 'Organika/sdxl-detector');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + env.HF_TOKEN, 'Content-Type': 'application/octet-stream' }, body: bytes });
  if (r.status === 503) return { error: 'loading' };
  if (!r.ok) return { error: 'upstream_' + r.status };
  const data = await r.json().catch(() => null);
  const list = Array.isArray(data) ? (Array.isArray(data[0]) ? data[0] : data) : null;
  if (!list) return { error: 'bad_response' };
  const ai = list.find((x) => /artificial|ai|fake|generated|synthetic/i.test(x.label || ''));
  const human = list.find((x) => /human|real|natural|authentic/i.test(x.label || ''));
  const p = ai ? ai.score : human ? 1 - human.score : null;
  return p == null ? { error: 'bad_response' } : { ai: Math.round(p * 1000) / 1000, labels: list };
}

export async function handleDetect(request, env, uid) {
  if (!(await tryInc(env, 'det:' + uid, num(env.DETECT_PER_DAY, 10)))) return json({ error: 'detect_limit' }, 429);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (!buf.length || buf.length > 5 * 1024 * 1024) return json({ error: 'bad_size' }, 413);
  if (!sniffImage(buf)) return json({ error: 'bad_type' }, 415);
  const res = await detectAi(env, buf);
  return res.error ? json(res, res.error === 'loading' ? 503 : 502) : json(res);
}

export async function bankUpload(request, env, uid) {
  if (!env.BANK) return json({ error: 'not_configured' }, 503);
  if (!(await tryInc(env, 'up:' + uid, num(env.UPLOADS_PER_DAY, 5)))) return json({ error: 'upload_limit' }, 429);
  const form = await request.formData().catch(() => null);
  const file = form && form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'no_file' }, 400);
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.length > 1024 * 1024) return json({ error: 'too_big' }, 413);
  const mime = sniffImage(buf);
  if (!mime) return json({ error: 'bad_type' }, 415);
  if (form.get('agree') !== '1') return json({ error: 'no_consent' }, 400);
  const title = String(form.get('title') || '').replace(/[<>]/g, '').trim().slice(0, 60);
  const ins = await env.DB.prepare('INSERT INTO bank_items(uid, r2_key, title, mime, status, created_at) VALUES(?, ?, ?, ?, ?, ?)').bind(uid, 'tmp', title, mime, 'pending', now()).run();
  const id = ins.meta.last_row_id;
  const key = 'bank/' + id;
  await env.BANK.put(key, buf, { httpMetadata: { contentType: mime } });
  await env.DB.prepare('UPDATE bank_items SET r2_key=? WHERE id=?').bind(key, id).run();
  return json({ ok: true, id, status: 'pending' }, 201);
}

export async function bankList(request, env) {
  const url = new URL(request.url);
  const before = num(url.searchParams.get('before'), 1e12);
  const { results } = await env.DB.prepare("SELECT id, title FROM bank_items WHERE status='approved' AND id < ? ORDER BY id DESC LIMIT 49").bind(before).all();
  return json({ items: results || [] }, 200, { 'Cache-Control': 'public, max-age=60' });
}

export async function bankImage(env, id) {
  if (!env.BANK) return json({ error: 'not_configured' }, 503);
  const row = await env.DB.prepare("SELECT r2_key, mime, status FROM bank_items WHERE id=?").bind(id).first();
  if (!row || row.status !== 'approved') return json({ error: 'not_found' }, 404);
  const obj = await env.BANK.get(row.r2_key);
  if (!obj) return json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
}

export async function adminBank(request, env, parts) {
  // parts: ['pending'] | [id, 'approve'|'reject'] | ['preview', id]
  if (parts[0] === 'pending') {
    const { results } = await env.DB.prepare("SELECT id, title, created_at FROM bank_items WHERE status='pending' ORDER BY id LIMIT 50").all();
    return json({ items: results || [] });
  }
  if (parts[0] === 'preview') {
    const row = await env.DB.prepare('SELECT r2_key, mime FROM bank_items WHERE id=?').bind(num(parts[1], 0)).first();
    const obj = row && (await env.BANK.get(row.r2_key));
    return obj ? new Response(obj.body, { headers: { 'Content-Type': row.mime, 'X-Content-Type-Options': 'nosniff' } }) : json({ error: 'not_found' }, 404);
  }
  const id = num(parts[0], 0), action = parts[1];
  if (!id || (action !== 'approve' && action !== 'reject')) return json({ error: 'bad_request' }, 400);
  if (action === 'reject') {
    const row = await env.DB.prepare('SELECT r2_key FROM bank_items WHERE id=?').bind(id).first();
    if (row) await env.BANK.delete(row.r2_key);
  }
  await env.DB.prepare('UPDATE bank_items SET status=? WHERE id=?').bind(action === 'approve' ? 'approved' : 'rejected', id).run();
  return json({ ok: true });
}
