(function () {
  const CFG = window.NF_CONFIG;

  const PAGES = [
    ['index.html', 'Главная', ''],
    ['create.html', 'Создать', 'create'],
    ['check.html', 'Проверка на ИИ', 'check'],
    ['bank.html', 'Банк аватарок', 'bank'],
    ['pricing.html', 'Тарифы', 'pricing']
  ];

  function renderChrome() {
    const cur = document.body.dataset.page || '';
    const hdr = document.getElementById('hdr');
    if (hdr) {
      hdr.className = 'site';
      hdr.innerHTML =
        '<div class="wrap"><a class="logo" href="index.html"><i></i>' + CFG.siteName + '</a><nav class="main">' +
        PAGES.map(function (p) {
          return '<a href="' + p[0] + '"' + (p[2] === cur ? ' class="on"' : '') + '>' + p[1] + '</a>';
        }).join('') + '</nav></div>';
    }
    const ftr = document.getElementById('ftr');
    if (ftr) {
      ftr.className = 'site';
      ftr.innerHTML =
        '<div class="wrap"><div>© ' + new Date().getFullYear() + ' ' + CFG.siteName +
        ' · <a href="privacy.html">Конфиденциальность</a> · <a href="terms.html">Условия</a></div></div>';
    }
  }

  // ---- Квота бесплатных нейро-генераций (локально, см. комментарий в config.js) ----
  const Quota = {
    key: 'nf_quota_v1',
    today: function () { return new Date().toISOString().slice(0, 10); },
    read: function () {
      let d = {};
      try { d = JSON.parse(localStorage.getItem(this.key) || '{}'); } catch (e) {}
      if (d.date !== this.today()) d = { date: this.today(), used: 0, credits: d.credits || 0 };
      return { date: d.date, used: d.used || 0, credits: d.credits || 0 };
    },
    write: function (q) { try { localStorage.setItem(this.key, JSON.stringify(q)); } catch (e) {} },
    left: function () {
      const q = this.read();
      return Math.max(0, CFG.freePerDay - q.used) + q.credits;
    },
    consume: function () {
      const q = this.read();
      if (q.used < CFG.freePerDay) q.used++;
      else if (q.credits > 0) q.credits--;
      else return false;
      this.write(q);
      return true;
    }
  };

  // ---- Реклама ----
  let adSeq = 0;
  function renderAds(root) {
    const slots = (root || document).querySelectorAll('[data-ad]');
    const ads = CFG.ads;
    let ctx = false;
    slots.forEach(function (el, i) {
      if (el.dataset.adDone) return;
      el.dataset.adDone = '1';
      const slot = el.dataset.ad;
      const blockId = ads.yandexBlockIds && ads.yandexBlockIds[slot];
      el.classList.add('ad');
      if (ads.enabled && blockId) {
        if (!ctx) {
          ctx = true;
          window.yaContextCb = window.yaContextCb || [];
          const s = document.createElement('script');
          s.src = 'https://yandex.ru/ads/system/context.js';
          s.async = true;
          document.head.appendChild(s);
        }
        el.id = el.id || 'ya_' + slot + '_' + (adSeq++);
        window.yaContextCb.push(function () {
          window.Ya.Context.AdvManager.render({ blockId: blockId, renderTo: el.id });
        });
      } else if (ads.placeholders) {
        el.classList.add('ph');
        el.textContent = 'Рекламное место · ' + slot;
      } else {
        el.style.display = 'none';
      }
    });
  }

  // ---- Скачивание ----
  function download(href, name) {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function svgToPng(svg, size) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image();
      img.onload = function () {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        c.getContext('2d').drawImage(img, 0, 0, size, size);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob')); }, 'image/png');
      };
      img.onerror = reject;
      img.src = url;
    });
  }
  function saveSvg(svg, name) {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    download(url, name + '.svg');
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  async function savePng(svg, name, size) {
    const blob = await svgToPng(svg, size || 1024);
    const url = URL.createObjectURL(blob);
    download(url, name + '.png');
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  window.NF = { Quota: Quota, saveSvg: saveSvg, savePng: savePng, download: download };
  window.NF_renderAds = renderAds;
  document.addEventListener('DOMContentLoaded', function () { renderChrome(); renderAds(); });
})();
