import { json, corsHeaders, verifyToken, signToken, randomUid, sha, timingSafeEqual, num, now } from './util.js';
import { ensureUser, quotaOf, consume, refund } from './quota.js';
import { telegramWebhook } from './telegram.js';
import { generateImage, handleDetect, bankUpload, bankList, bankImage, adminBank } from './media.js';

async function authed(request, env) {
  const h = request.headers.get('Authorization') || '';
  return verifyToken(env, h.startsWith('Bearer ') ? h.slice(7) : '');
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const m = request.method;
  const ipKey = await sha(request.headers.get('CF-Connecting-IP') || 'unknown');

  if (path === '/api/health') return json({ ok: true });

  // Вебхуки провайдеров: без пользовательского токена, своя проверка подписи
  if (path === '/api/telegram/webhook' && m === 'POST') return telegramWebhook(request, env);
  if (path === '/api/lava/webhook' && m === 'POST') return lavaWebhook(request, env);

  if (path.startsWith('/api/admin/')) {
    if (!env.ADMIN_KEY || !timingSafeEqual(request.headers.get('X-Admin-Key') || '', env.ADMIN_KEY)) return json({ error: 'forbidden' }, 403);
    if (path.startsWith('/api/admin/bank/')) return adminBank(request, env, path.slice('/api/admin/bank/'.length).split('/'));
    return json({ error: 'not_found' }, 404);
  }

  if (path === '/api/bank' && m === 'GET') return bankList(request, env);
  if (path.startsWith('/api/bank/img/') && m === 'GET') return bankImage(env, num(path.split('/').pop(), 0));

  if (path === '/api/session' && m === 'POST') {
    let uid = await authed(request, env);
    if (!uid) uid = randomUid();
    await ensureUser(env, uid);
    return json({ uid, token: await signToken(env, uid), quota: await quotaOf(env, uid) });
  }

  const uid = await authed(request, env);
  if (!uid) return json({ error: 'unauthorized' }, 401);

  if (path === '/api/quota' && m === 'GET') return json(await quotaOf(env, uid));

  if (path === '/api/generate' && m === 'POST') {
    const body = await request.json().catch(() => null);
    const prompt = body && String(body.prompt || '').trim();
    if (!prompt || prompt.length < 3 || prompt.length > 500) return json({ error: 'bad_prompt' }, 400);
    const kind = await consume(env, uid, ipKey);
    if (!kind) return json({ error: 'no_quota', quota: await quotaOf(env, uid) }, 402);
    let img = null;
    try { img = await generateImage(env, body.mode, prompt); } catch (e) { img = null; }
    if (!img) {
      await refund(env, uid, kind, ipKey);
      return json({ error: 'upstream_failed' }, 502);
    }
    return img;
  }

  if (path === '/api/detect' && m === 'POST') return handleDetect(request, env, uid);
  if (path === '/api/bank' && m === 'POST') return bankUpload(request, env, uid);

  return json({ error: 'not_found' }, 404);
}

// Lava Top: заготовка. Формат вебхука и привязка платежа к пользователю не подтверждены документацией,
// поэтому платёж только сохраняется, без начисления. См. worker/README.md.
async function lavaWebhook(request, env) {
  if (!env.LAVA_WEBHOOK_KEY || !timingSafeEqual(request.headers.get('X-Api-Key') || '', env.LAVA_WEBHOOK_KEY)) return json({ error: 'forbidden' }, 403);
  const raw = await request.text();
  let id = 'lava:' + now() + ':' + (await sha(raw));
  try { const d = JSON.parse(raw); if (d && (d.contractId || d.id)) id = 'lava:' + (d.contractId || d.id); } catch (e) { /* оставляем хэш */ }
  await env.DB.prepare('INSERT OR IGNORE INTO payments(id, uid, plan, provider, amount, raw, created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(id, null, null, 'lava_top', 0, raw.slice(0, 4000), now()).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res;
    try { res = await route(request, env); } catch (e) { res = json({ error: 'internal' }, 500); }
    const out = new Response(res.body, res);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  }
};
