import { now, today, num } from './util.js';

const changes = (r) => (r && r.meta && r.meta.changes) || 0;

export async function ensureUser(env, uid) {
  await env.DB.prepare('INSERT OR IGNORE INTO users(uid, created_at) VALUES(?, ?)').bind(uid, now()).run();
}

async function usageN(env, k) {
  const r = await env.DB.prepare('SELECT n FROM usage WHERE k=? AND day=?').bind(k, today()).first();
  return r ? r.n : 0;
}

// Атомарно увеличивает суточный счётчик, если он ниже лимита
export async function tryInc(env, k, limit) {
  await env.DB.prepare('INSERT OR IGNORE INTO usage(k, day, n) VALUES(?, ?, 0)').bind(k, today()).run();
  const r = await env.DB.prepare('UPDATE usage SET n = n + 1 WHERE k=? AND day=? AND n < ?').bind(k, today(), limit).run();
  return changes(r) > 0;
}

async function decUsage(env, k) {
  await env.DB.prepare('UPDATE usage SET n = n - 1 WHERE k=? AND day=? AND n > 0').bind(k, today()).run();
}

export async function quotaOf(env, uid) {
  const free = num(env.FREE_PER_DAY, 3), proMax = num(env.PRO_MONTHLY, 300);
  const u = await env.DB.prepare('SELECT * FROM users WHERE uid=?').bind(uid).first();
  if (!u) return { free, pro: 0, credits: 0, total: free, proUntil: 0 };
  const usedToday = await usageN(env, 'u:' + uid);
  const month = today().slice(0, 7);
  const proActive = u.pro_until > now();
  const proLeft = proActive ? Math.max(0, proMax - (u.pro_month === month ? u.pro_used : 0)) : 0;
  const freeLeft = Math.max(0, free - usedToday);
  return { free: freeLeft, pro: proLeft, credits: u.credits, total: freeLeft + proLeft + u.credits, proUntil: proActive ? u.pro_until : 0 };
}

// Списывает одну генерацию: сначала бесплатные за сутки, потом Pro-месяц, потом купленные кредиты.
// Возвращает 'free' | 'pro' | 'credit' | null (нет остатка).
export async function consume(env, uid, ipKey) {
  const free = num(env.FREE_PER_DAY, 3), ipCap = num(env.IP_FREE_PER_DAY, 15), proMax = num(env.PRO_MONTHLY, 300);
  if ((await usageN(env, 'u:' + uid)) < free && (await tryInc(env, 'ip:' + ipKey, ipCap))) {
    if (await tryInc(env, 'u:' + uid, free)) return 'free';
    await decUsage(env, 'ip:' + ipKey);
  }
  const month = today().slice(0, 7);
  const pr = await env.DB.prepare(
    `UPDATE users SET pro_used = CASE WHEN pro_month = ? THEN pro_used + 1 ELSE 1 END, pro_month = ?
     WHERE uid = ? AND pro_until > ? AND ((pro_month = ? AND pro_used < ?) OR pro_month IS NOT ?)`
  ).bind(month, month, uid, now(), month, proMax, month).run();
  if (changes(pr) > 0) return 'pro';
  const cr = await env.DB.prepare('UPDATE users SET credits = credits - 1 WHERE uid = ? AND credits > 0').bind(uid).run();
  if (changes(cr) > 0) return 'credit';
  return null;
}

export async function refund(env, uid, kind, ipKey) {
  if (kind === 'free') { await decUsage(env, 'u:' + uid); await decUsage(env, 'ip:' + ipKey); }
  else if (kind === 'pro') await env.DB.prepare('UPDATE users SET pro_used = pro_used - 1 WHERE uid = ? AND pro_used > 0').bind(uid).run();
  else if (kind === 'credit') await env.DB.prepare('UPDATE users SET credits = credits + 1 WHERE uid = ?').bind(uid).run();
}

// Начисление за оплату. Идемпотентно по id платежа.
export async function grant(env, { id, uid, plan, provider, amount, raw }) {
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO payments(id, uid, plan, provider, amount, raw, created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(id, uid, plan, provider, amount || 0, raw ? String(raw).slice(0, 4000) : null, now()).run();
  if (changes(ins) === 0) return false; // уже начисляли
  await ensureUser(env, uid);
  if (plan === 'pack') {
    await env.DB.prepare('UPDATE users SET credits = credits + ? WHERE uid = ?').bind(num(env.PACK_CREDITS, 50), uid).run();
  } else if (plan === 'pro') {
    await env.DB.prepare('UPDATE users SET pro_until = MAX(pro_until, ?) + ? WHERE uid = ?').bind(now(), 30 * 86400, uid).run();
  } else return false;
  return true;
}
