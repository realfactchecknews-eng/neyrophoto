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
