(function () {
  const $ = function (id) { return document.getElementById(id); };
  const CFG = window.NF_CONFIG;
  const params = new URLSearchParams(location.search);

  // ---------- вкладки ----------
  const tabs = document.querySelectorAll('.tabs button');
  function showTab(name) {
    tabs.forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    document.querySelectorAll('.tabpane').forEach(function (p) { p.hidden = p.id !== 'tab-' + name; });
    try { history.replaceState(null, '', '#' + name); } catch (e) {}
  }
  tabs.forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });
  showTab(location.hash === '#neuro' ? 'neuro' : 'builder');

  // ---------- конструктор ----------
  const st = {
    style: Avatar.STYLES[params.get('style')] ? params.get('style') : 'face',
    palette: Avatar.PALETTES[params.get('palette')] ? params.get('palette') : 'neon',
    seed: params.get('seed') || String(Math.floor(Math.random() * 1e6)),
    round: true
  };

  function chips(el, map, key) {
    el.innerHTML = '';
    Object.keys(map).forEach(function (k) {
      const b = document.createElement('button');
      b.className = 'chip' + (st[key] === k ? ' on' : '');
      b.textContent = map[k].name;
      b.onclick = function () { st[key] = k; chips(el, map, key); draw(); };
      el.appendChild(b);
    });
  }
  function svg() { return Avatar.make({ style: st.style, palette: st.palette, seed: st.seed, round: st.round }); }
  function draw() {
    $('prev').innerHTML = svg();
    $('seed').value = st.seed;
    const m = $('mini');
    m.innerHTML = '';
    for (let i = 1; i <= 8; i++) {
      const s = st.seed + '-' + i;
      const b = document.createElement('button');
      b.innerHTML = Avatar.make({ style: st.style, palette: st.palette, seed: s });
      b.onclick = function () { st.seed = s; draw(); };
      m.appendChild(b);
    }
  }
  chips($('styles'), Avatar.STYLES, 'style');
  chips($('palettes'), Avatar.PALETTES, 'palette');
  $('seed').addEventListener('input', function () { st.seed = this.value || '0'; $('prev').innerHTML = svg(); });
  $('rnd').onclick = function () { st.seed = String(Math.floor(Math.random() * 1e6)); draw(); };
  $('round').onchange = function () { st.round = this.checked; draw(); };
  $('dlSvg').onclick = function () { NF.saveSvg(svg(), 'avatar-' + st.seed); };
  $('dlPng').onclick = function () { NF.savePng(svg(), 'avatar-' + st.seed, 1024); };
  draw();

  // ---------- нейро ----------
  const PRESETS = {
    avatar: { name: 'Аватарка', w: 768, h: 768, wrap: function (p) { return 'profile picture avatar, ' + p + ', centered portrait, clean background, high detail'; } },
    photo:  { name: 'Фото', w: 1024, h: 768, wrap: function (p) { return p + ', photorealistic, natural light, high detail'; } },
    art:    { name: 'Арт', w: 1024, h: 1024, wrap: function (p) { return p + ', digital art, trending on artstation, vivid colors'; } }
  };
  const ni = { mode: 'avatar' };
  const modes = $('modes');
  Object.keys(PRESETS).forEach(function (k) {
    const b = document.createElement('button');
    b.className = 'chip' + (ni.mode === k ? ' on' : '');
    b.textContent = PRESETS[k].name;
    b.onclick = function () {
      ni.mode = k;
      Array.prototype.forEach.call(modes.children, function (c) { c.classList.remove('on'); });
      b.classList.add('on');
    };
    modes.appendChild(b);
  });

  async function quotaUi() {
    let left = NF.Quota.left();
    if (NFApi.enabled) {
      try { const q = await NFApi.quota(); if (q) left = q.total; } catch (e) {}
    }
    $('quota').innerHTML = 'Осталось генераций: <b>' + left + '</b> · <a href="pricing.html">Больше</a>';
  }
  quotaUi();
  window.addEventListener('focus', quotaUi);

  function providerUrl(prompt, p, seed) {
    if (CFG.imageProvider.type === 'custom' && CFG.imageProvider.url) {
      return CFG.imageProvider.url + '?prompt=' + encodeURIComponent(prompt) + '&width=' + p.w + '&height=' + p.h + '&seed=' + seed;
    }
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
      '?width=' + p.w + '&height=' + p.h + '&seed=' + seed + '&nologo=true&model=flux';
  }

  const stage = $('nstage');
  const gen = $('gen');
  let lastUrl = '';
  function showImg(img, url, blobUrl) {
    lastUrl = blobUrl || url;
    stage.innerHTML = '';
    stage.appendChild(img);
    $('ndl').hidden = false;
    $('nopen').hidden = false;
    $('nopen').href = lastUrl;
    gen.disabled = false;
  }
  function fail(msg) {
    stage.innerHTML = '<div class="ph">' + msg + '</div>';
    gen.disabled = false;
  }

  gen.onclick = async function () {
    const raw = $('prompt').value.trim();
    if (raw.length < 3) { $('nerr').textContent = 'Опишите, что нарисовать (хотя бы пару слов).'; return; }
    $('nerr').textContent = '';
    const p = PRESETS[ni.mode];
    gen.disabled = true;
    stage.innerHTML = '<div class="ph"><div class="spin"></div>Генерируем…<br><small>обычно 5–20 секунд</small></div>';
    const img = new Image();
    img.alt = raw;

    if (NFApi.enabled) {
      try {
        const r = await NFApi.call('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: raw, mode: ni.mode }) });
        if (r.status === 402) { stage.innerHTML = '<div class="ph">Бесплатные генерации закончились</div>'; gen.disabled = false; $('paywall').classList.add('open'); quotaUi(); return; }
        if (!r.ok) { fail('Не получилось. Сервис генерации сейчас недоступен. Лимит не списан, попробуйте ещё раз.'); return; }
        const blobUrl = URL.createObjectURL(await r.blob());
        img.onload = function () { showImg(img, blobUrl, blobUrl); quotaUi(); };
        img.src = blobUrl;
      } catch (e) { fail('Нет связи с сервером. Попробуйте ещё раз.'); }
      return;
    }

    // Автономный режим: лимит в браузере, запрос прямо к сервису генерации
    if (NF.Quota.left() <= 0) { stage.innerHTML = ''; gen.disabled = false; $('paywall').classList.add('open'); return; }
    const url = providerUrl(p.wrap(raw), p, Math.floor(Math.random() * 1e9));
    img.onload = function () { NF.Quota.consume(); quotaUi(); showImg(img, url); };
    img.onerror = function () { fail('Не получилось. Сервис генерации сейчас занят или недоступен. Попробуйте ещё раз: лимит не списан.'); };
    img.src = url;
  };
  $('ndl').onclick = async function () {
    try {
      const r = await fetch(lastUrl);
      const b = await r.blob();
      const u = URL.createObjectURL(b);
      NF.download(u, 'neyrofoto-' + Date.now() + '.jpg');
      setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
    } catch (e) {
      window.open(lastUrl, '_blank');
    }
  };
  document.querySelectorAll('[data-close]').forEach(function (b) {
    b.onclick = function () { $('paywall').classList.remove('open'); };
  });
})();
