// Клиент бэкенда (Cloudflare Worker). Если NF_CONFIG.apiBase пуст, сайт работает автономно: лимиты в браузере.
(function () {
  const CFG = window.NF_CONFIG;
  const base = (CFG.apiBase || '').replace(/\/+$/, '');
  const KEY = 'nf_token_v1';
  let sess = null;

  function stored() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function store(t) { try { localStorage.setItem(KEY, t); } catch (e) {} }

  async function session() {
    if (!base) return null;
    if (sess) return sess;
    const r = await fetch(base + '/api/session', { method: 'POST', headers: stored() ? { Authorization: 'Bearer ' + stored() } : {} });
    if (!r.ok) throw new Error('session ' + r.status);
    const d = await r.json();
    store(d.token);
    sess = d;
    return d;
  }

  async function call(path, opts) {
    const s = await session();
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + s.token }, opts.headers || {});
    return fetch(base + path, opts);
  }

  window.NFApi = {
    enabled: !!base,
    base: base,
    session: session,
    call: call,
    uid: async function () { const s = await session(); return s && s.uid; },
    quota: async function () { const r = await call('/api/quota'); return r.ok ? r.json() : null; }
  };
})();
