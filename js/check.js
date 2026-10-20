(function () {
  const $ = function (id) { return document.getElementById(id); };
  const drop = $('drop'), input = $('file');
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const ICON = { bad: '⚠', ok: '✓', info: 'i' };

  drop.onclick = function () { input.click(); };
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = function () { drop.classList.remove('over'); };
  drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) run(e.dataTransfer.files[0]); };
  input.onchange = function () { if (input.files[0]) run(input.files[0]); };
  document.addEventListener('paste', function (e) {
    const f = Array.prototype.map.call(e.clipboardData.items, function (i) { return i.getAsFile(); }).filter(Boolean)[0];
    if (f) run(f);
  });

  const SRV_ERR = {
    not_configured: 'Серверная проверка пока не настроена',
    loading: 'Модель прогревается, повторите через минуту',
    detect_limit: 'Лимит серверных проверок на сегодня исчерпан',
    bad_size: 'Для серверной проверки файл должен быть до 5 МБ',
    bad_type: 'Серверная проверка принимает JPG, PNG и WebP'
  };

  // Дополняет локальный результат оценкой нейросети-классификатора на сервере
  async function addServerVerdict(file, r) {
    let srv;
    try {
      const resp = await NFApi.call('/api/detect', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      srv = resp.ok ? await resp.json() : { error: ((await resp.json().catch(function () { return {}; })).error) || 'err' };
    } catch (e) { srv = { error: 'net' }; }
    if (srv.error || typeof srv.ai !== 'number') {
      r.findings.push({ t: 'info', msg: SRV_ERR[srv.error] || 'Серверная проверка недоступна, показан только анализ метаданных' });
      return;
    }
    const pct = Math.round(srv.ai * 100);
    r.findings.unshift({ t: pct >= 50 ? 'bad' : 'ok', msg: 'Нейросеть-классификатор оценивает вероятность ИИ в ' + pct + '%' });
    if (r.level !== 'bad') {
      r.score = Math.max(3, Math.min(97, Math.round(0.35 * r.score + 0.65 * pct)));
      if (r.score >= 70) { r.verdict = 'Вероятно сгенерировано ИИ'; r.level = 'bad'; }
      else if (r.score >= 50) { r.verdict = 'Есть подозрительные признаки'; r.level = 'info'; }
      else if (r.score >= 30) { r.verdict = 'Неопределённо'; r.level = 'info'; }
      else { r.verdict = 'Явных следов ИИ не найдено'; r.level = 'ok'; }
    }
  }

  async function run(file) {
    if (!/^image\//.test(file.type)) { alert('Нужен файл-изображение (JPG, PNG, WebP).'); return; }
    if (file.size > 25 * 1024 * 1024) { alert('Файл больше 25 МБ.'); return; }
    const url = URL.createObjectURL(file);
    $('pimg').src = url;
    $('result').hidden = false;
    $('verdict').textContent = 'Анализируем…';
    $('fl').innerHTML = '';
    $('bar').style.width = '0';
    const r = await Detect.analyze(file);
    if (NFApi.enabled && $('srv') && $('srv').checked) await addServerVerdict(file, r);
    $('verdict').textContent = r.verdict;
    $('verdict').style.color = r.level === 'bad' ? 'var(--bad)' : r.level === 'ok' ? 'var(--ok)' : 'var(--warn)';
    $('pct').textContent = 'Вероятность ИИ: ' + r.score + '%';
    $('bar').style.width = r.score + '%';
    $('bar').style.backgroundSize = (10000 / Math.max(r.score, 1)) + '% 100%';
    const d = r.info.dims;
    $('meta').textContent = r.info.name + ' · ' + (r.info.size / 1024).toFixed(0) + ' КБ' + (d ? ' · ' + d.w + '×' + d.h : '');
    $('fl').innerHTML = r.findings.length ? r.findings.map(function (f) {
      return '<li class="' + f.t + '"><b>' + ICON[f.t] + '</b>' + esc(f.msg) + '</li>';
    }).join('') : '<li class="ok"><b>✓</b>Прямых следов генерации в метаданных нет</li>';
    $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
})();
