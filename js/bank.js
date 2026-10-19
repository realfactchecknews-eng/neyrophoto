(function () {
  const $ = function (id) { return document.getElementById(id); };
  const TOTAL = 240, PAGE = 24;
  const styleKeys = Object.keys(Avatar.STYLES), palKeys = Object.keys(Avatar.PALETTES);

  // Каталог детерминированный: аватарка №N всегда одна и та же, поэтому ссылками можно делиться.
  const ALL = [];
  for (let i = 0; i < TOTAL; i++) {
    ALL.push({ id: i + 1, style: styleKeys[i % styleKeys.length], palette: palKeys[Math.floor(i / styleKeys.length) % palKeys.length], seed: 'bank-' + (i + 1) });
  }

  const f = { style: 'all', palette: 'all' };
  let shown = 0, list = [];

  function chips(el, map, key) {
    el.innerHTML = '';
    [['all', 'Все']].concat(Object.keys(map).map(function (k) { return [k, map[k].name]; })).forEach(function (kv) {
      const b = document.createElement('button');
      b.className = 'chip' + (f[key] === kv[0] ? ' on' : '');
      b.textContent = kv[1];
      b.onclick = function () { f[key] = kv[0]; chips(el, map, key); reset(); };
      el.appendChild(b);
    });
  }

  function reset() {
    list = ALL.filter(function (a) { return (f.style === 'all' || a.style === f.style) && (f.palette === 'all' || a.palette === f.palette); });
    shown = 0;
    $('grid').innerHTML = '';
    more();
  }

  function more() {
    const g = $('grid');
    list.slice(shown, shown + PAGE).forEach(function (a, i) {
      if (shown + i > 0 && (shown + i) % 12 === 0) {
        const ad = document.createElement('div');
        ad.className = 'adcell';
        ad.innerHTML = '<div data-ad="mid"></div>';
        g.appendChild(ad);
        window.NF_renderAds && window.NF_renderAds(ad);
      }
      const d = document.createElement('div');
      d.className = 'it';
      d.innerHTML = Avatar.make(a) + '<small>№' + a.id + ' · ' + Avatar.STYLES[a.style].name + '</small>';
      d.onclick = function () { open(a); };
      g.appendChild(d);
    });
    shown += PAGE;
    $('more').hidden = shown >= list.length;
    $('empty').hidden = list.length > 0;
  }

  function open(a) {
    const svg = Avatar.make(a);
    $('mbig').innerHTML = svg;
    $('mtitle').textContent = 'Аватарка №' + a.id;
    $('msvg').onclick = function () { NF.saveSvg(svg, 'avatar-' + a.id); };
    $('mpng').onclick = function () { NF.savePng(svg, 'avatar-' + a.id, 1024); };
    $('medit').href = 'create.html?style=' + a.style + '&palette=' + a.palette + '&seed=' + encodeURIComponent(a.seed);
    $('modal').classList.add('open');
  }

  chips($('fstyle'), Avatar.STYLES, 'style');
  chips($('fpal'), Avatar.PALETTES, 'palette');
  $('more').onclick = more;
  $('modal').onclick = function (e) { if (e.target === this || e.target.dataset.close != null) this.classList.remove('open'); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('modal').classList.remove('open'); });
  reset();
})();
