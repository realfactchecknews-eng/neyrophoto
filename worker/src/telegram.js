import { num, timingSafeEqual, json } from './util.js';
import { grant } from './quota.js';

const PLANS = {
  pack: (env) => ({ title: 'Пакет генераций', desc: num(env.PACK_CREDITS, 50) + ' нейро-генераций на Нейрофото, без срока действия', stars: num(env.STARS_PACK, 150) }),
  pro: (env) => ({ title: 'Нейрофото Pro на 30 дней', desc: num(env.PRO_MONTHLY, 300) + ' генераций в месяц на 30 дней', stars: num(env.STARS_PRO, 250) })
};

async function tg(env, method, body) {
  const r = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return r.json().catch(() => ({}));
}

export async function telegramWebhook(request, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return json({ error: 'not_configured' }, 503);
  if (!timingSafeEqual(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '', env.TELEGRAM_WEBHOOK_SECRET)) return json({ error: 'forbidden' }, 403);
  const u = await request.json().catch(() => null);
  if (!u) return json({ ok: true });

  if (u.pre_checkout_query) {
    const [plan, uid] = String(u.pre_checkout_query.invoice_payload || '').split(':');
    const ok = !!PLANS[plan] && /^[a-z0-9]{12}$/.test(uid || '');
    await tg(env, 'answerPreCheckoutQuery', ok ? { pre_checkout_query_id: u.pre_checkout_query.id, ok: true }
      : { pre_checkout_query_id: u.pre_checkout_query.id, ok: false, error_message: 'Неверный заказ. Начните оплату на сайте заново.' });
    return json({ ok: true });
  }

  const m = u.message;
  if (!m) return json({ ok: true });

  if (m.successful_payment) {
    const sp = m.successful_payment;
    const [plan, uid] = String(sp.invoice_payload || '').split(':');
    const done = PLANS[plan] && uid
      ? await grant(env, { id: 'tg:' + sp.telegram_payment_charge_id, uid, plan, provider: 'telegram_stars', amount: sp.total_amount, raw: JSON.stringify(sp) })
      : false;
    await tg(env, 'sendMessage', { chat_id: m.chat.id, text: done ? 'Оплата прошла, спасибо! Вернитесь на сайт: генерации уже начислены.' : 'Платёж получен. Если генерации не появились на сайте, напишите в поддержку и укажите номер: ' + sp.telegram_payment_charge_id });
    return json({ ok: true });
  }

  const text = (m.text || '').trim();
  if (text.startsWith('/start')) {
    const payload = text.split(/\s+/)[1] || '';
    const [plan, uid] = payload.split('_');
    if (PLANS[plan] && /^[a-z0-9]{12}$/.test(uid || '')) {
      const p = PLANS[plan](env);
      await tg(env, 'sendInvoice', {
        chat_id: m.chat.id, title: p.title, description: p.desc, payload: plan + ':' + uid,
        currency: 'XTR', prices: [{ label: p.title, amount: p.stars }]
      });
    } else {
      await tg(env, 'sendMessage', { chat_id: m.chat.id, text: 'Это бот оплаты Нейрофото. Выберите тариф на сайте: ' + (env.SITE_URL || '') + '/pricing.html' });
    }
  }
  return json({ ok: true });
}
