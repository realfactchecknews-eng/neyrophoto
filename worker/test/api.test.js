import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  return {
    prepare(sql) {
      let args = [];
      const st = db.prepare(sql);
      const o = {
        bind(...a) { args = a; return o; },
        async first() { return st.get(...args) || null; },
        async all() { return { results: st.all(...args) }; },
        async run() { const r = st.run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
      };
      return o;
    }
  };
}

function makeR2() {
  const m = new Map();
  return {
    async put(k, v, o) { m.set(k, { v, type: o && o.httpMetadata && o.httpMetadata.contentType }); },
    async get(k) { const e = m.get(k); return e ? { body: e.v } : null; },
    async delete(k) { m.delete(k); }
  };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0]);
let env, fetchCalls, fetchImpl;

beforeEach(() => {
  env = {
    DB: makeDB(), BANK: makeR2(), TOKEN_SECRET: 'test-secret', ADMIN_KEY: 'adm', ALLOWED_ORIGINS: 'https://neyrofoto.ru',
    TELEGRAM_BOT_TOKEN: 'bot', TELEGRAM_WEBHOOK_SECRET: 'whsec', SITE_URL: 'https://neyrofoto.ru', LAVA_WEBHOOK_KEY: 'lk'
  };
  fetchCalls = [];
  fetchImpl = async () => new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
  globalThis.fetch = async (url, opts) => { fetchCalls.push({ url: String(url), opts }); return fetchImpl(url, opts); };
});

const call = (path, { method = 'GET', token, body, headers = {} } = {}) => {
  const h = { ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  const init = { method, headers: h };
  if (body !== undefined) {
    if (body instanceof FormData || body instanceof Uint8Array) init.body = body;
    else { init.body = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
  }
  return worker.fetch(new Request('https://api.test' + path, init), env);
};
const session = async (token) => (await call('/api/session', { method: 'POST', token })).json();
const gen = (token, prompt = 'cat astronaut') => call('/api/generate', { method: 'POST', token, body: { prompt, mode: 'avatar' } });
const tgUpdate = (u) => call('/api/telegram/webhook', { method: 'POST', body: u, headers: { 'X-Telegram-Bot-Api-Secret-Token': 'whsec' } });

test('сессия выдаёт токен, повторный вызов сохраняет uid', async () => {
  const s = await session();
  assert.match(s.uid, /^[a-z0-9]{12}$/);
  assert.equal(s.quota.total, 3);
  assert.equal((await session(s.token)).uid, s.uid);
});

test('без токена и с подделанным токеном доступа нет', async () => {
  assert.equal((await call('/api/quota')).status, 401);
  const s = await session();
  assert.equal((await call('/api/quota', { token: s.token.slice(0, -2) + 'xx' })).status, 401);
  assert.equal((await call('/api/quota', { token: 'aaaaaaaaaaaa.' + s.token.split('.')[1] })).status, 401);
});

test('3 бесплатные генерации, потом 402', async () => {
  const { token } = await session();
  for (let i = 0; i < 3; i++) { const r = await gen(token); assert.equal(r.status, 200); assert.equal(r.headers.get('Content-Type'), 'image/png'); }
  const r = await gen(token);
  assert.equal(r.status, 402);
  assert.equal((await r.json()).quota.total, 0);
});

test('сбой генератора не списывает квоту', async () => {
  const { token } = await session();
  fetchImpl = async () => new Response('err', { status: 500 });
  assert.equal((await gen(token)).status, 502);
  assert.equal((await (await call('/api/quota', { token })).json()).total, 3);
});

test('слишком короткий промпт отклоняется без списания', async () => {
  const { token } = await session();
  assert.equal((await gen(token, 'a')).status, 400);
  assert.equal((await (await call('/api/quota', { token })).json()).total, 3);
});

test('Telegram: /start с планом отправляет счёт в Stars', async () => {
  const { uid } = await session();
  fetchImpl = async () => new Response('{"ok":true}');
  await tgUpdate({ message: { chat: { id: 7 }, text: '/start pack_' + uid } });
  const c = fetchCalls.find((x) => x.url.endsWith('/sendInvoice'));
  const b = JSON.parse(c.opts.body);
  assert.equal(b.currency, 'XTR');
  assert.equal(b.payload, 'pack:' + uid);
  assert.equal(b.prices[0].amount, 150);
});

test('Telegram: неверная подпись вебхука отклоняется', async () => {
  const r = await call('/api/telegram/webhook', { method: 'POST', body: {}, headers: { 'X-Telegram-Bot-Api-Secret-Token': 'nope' } });
  assert.equal(r.status, 403);
});

test('Telegram: оплата пакета начисляется один раз и тратится после бесплатных', async () => {
  const { uid, token } = await session();
  fetchImpl = async () => new Response('{"ok":true}');
  const pay = { message: { chat: { id: 7 }, successful_payment: { invoice_payload: 'pack:' + uid, telegram_payment_charge_id: 'ch1', total_amount: 150 } } };
  await tgUpdate(pay);
  await tgUpdate(pay); // повторная доставка того же платежа
  const q = await (await call('/api/quota', { token })).json();
  assert.equal(q.credits, 50);
  fetchImpl = async () => new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
  for (let i = 0; i < 3; i++) await gen(token);
  assert.equal((await gen(token)).status, 200);
  assert.equal((await (await call('/api/quota', { token })).json()).credits, 49);
});

test('Telegram: Pro даёт месячный лимит и срок', async () => {
  const { uid, token } = await session();
  fetchImpl = async () => new Response('{"ok":true}');
  await tgUpdate({ message: { chat: { id: 7 }, successful_payment: { invoice_payload: 'pro:' + uid, telegram_payment_charge_id: 'ch2', total_amount: 250 } } });
  const q = await (await call('/api/quota', { token })).json();
  assert.equal(q.pro, 300);
  assert.ok(q.proUntil > Date.now() / 1000 + 29 * 86400);
  fetchImpl = async () => new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
  for (let i = 0; i < 4; i++) assert.equal((await gen(token)).status, 200);
  assert.equal((await (await call('/api/quota', { token })).json()).pro, 299);
});

test('Telegram: счёт с чужим или битым payload не проходит pre_checkout', async () => {
  fetchImpl = async () => new Response('{"ok":true}');
  await tgUpdate({ pre_checkout_query: { id: 'q1', invoice_payload: 'hack:zzz' } });
  const b = JSON.parse(fetchCalls.find((x) => x.url.endsWith('/answerPreCheckoutQuery')).opts.body);
  assert.equal(b.ok, false);
});

test('банк: загрузка уходит на модерацию, после одобрения видна и отдаётся', async () => {
  const { token } = await session();
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), 'a.png');
  fd.append('title', 'Мой <b>кот</b>');
  fd.append('agree', '1');
  const up = await call('/api/bank', { method: 'POST', token, body: fd });
  assert.equal(up.status, 201);
  const { id } = await up.json();
  assert.deepEqual((await (await call('/api/bank')).json()).items, []);
  assert.equal((await call('/api/bank/img/' + id)).status, 404);
  assert.equal((await call('/api/admin/bank/pending')).status, 403);
  const adm = { 'X-Admin-Key': 'adm' };
  assert.equal((await (await call('/api/admin/bank/pending', { headers: adm })).json()).items.length, 1);
  await call('/api/admin/bank/' + id + '/approve', { method: 'POST', headers: adm });
  const list = (await (await call('/api/bank')).json()).items;
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Мой bкот/b');
  assert.equal((await call('/api/bank/img/' + id)).status, 200);
});

test('банк: не-картинка и отсутствие согласия отклоняются', async () => {
  const { token } = await session();
  const bad = new FormData();
  bad.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'x.png');
  bad.append('agree', '1');
  assert.equal((await call('/api/bank', { method: 'POST', token, body: bad })).status, 415);
  const noc = new FormData();
  noc.append('file', new Blob([PNG], { type: 'image/png' }), 'a.png');
  assert.equal((await call('/api/bank', { method: 'POST', token, body: noc })).status, 400);
});

test('детектор: без HF_TOKEN сообщает о настройке, с токеном возвращает оценку', async () => {
  const { token } = await session();
  const r1 = await call('/api/detect', { method: 'POST', token, body: PNG });
  assert.equal((await r1.json()).error, 'not_configured');
  env.HF_TOKEN = 'hf';
  fetchImpl = async () => new Response(JSON.stringify([{ label: 'artificial', score: 0.91 }, { label: 'human', score: 0.09 }]));
  const r2 = await call('/api/detect', { method: 'POST', token, body: PNG });
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).ai, 0.91);
  assert.equal((await call('/api/detect', { method: 'POST', token, body: new Uint8Array([1, 2, 3, 4]) })).status, 415);
});

test('Lava-вебхук: требует ключ, платёж сохраняется без начисления', async () => {
  assert.equal((await call('/api/lava/webhook', { method: 'POST', body: { id: 'x' } })).status, 403);
  const r = await call('/api/lava/webhook', { method: 'POST', body: { contractId: 'c1' }, headers: { 'X-Api-Key': 'lk' } });
  assert.equal(r.status, 200);
});

test('CORS: разрешённый origin получает заголовок, чужой нет', async () => {
  const ok = await worker.fetch(new Request('https://api.test/api/health', { headers: { Origin: 'https://neyrofoto.ru' } }), env);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://neyrofoto.ru');
  const bad = await worker.fetch(new Request('https://api.test/api/health', { headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
});
