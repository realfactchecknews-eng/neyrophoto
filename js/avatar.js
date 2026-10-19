// Генератор SVG-аватарок. Детерминированный: одинаковые (style, palette, seed) дают одинаковую картинку.
(function () {
  function hash(s) {
    s = String(s);
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = hash(seed);
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = function (r, arr) { return arr[Math.floor(r() * arr.length)]; };

  // [фон1, фон2, акцент1, акцент2, акцент3]
  const PALETTES = {
    neon:   { name: 'Неон',      c: ['#1a1033', '#0b3a52', '#8b5cf6', '#22d3ee', '#f472b6'] },
    sunset: { name: 'Закат',     c: ['#3b1d4a', '#7a2e3a', '#fb923c', '#f472b6', '#fde68a'] },
    forest: { name: 'Лес',       c: ['#0f2a22', '#1f4d3a', '#34d399', '#a3e635', '#fde68a'] },
    ocean:  { name: 'Океан',     c: ['#0b1e3a', '#0e4a6b', '#38bdf8', '#818cf8', '#e0f2fe'] },
    candy:  { name: 'Конфета',   c: ['#ffe4f1', '#e0e7ff', '#f472b6', '#818cf8', '#fbbf24'] },
    mono:   { name: 'Монохром',  c: ['#16161d', '#2a2a36', '#e5e7eb', '#9ca3af', '#6b7280'] }
  };
  const STYLES = {
    face:   { name: 'Персонаж' },
    shapes: { name: 'Геометрия' },
    orb:    { name: 'Сфера' },
    pixel:  { name: 'Пиксели' }
  };
  const SKINS = ['#f6d5b8', '#e8b48f', '#c68a62', '#8d5a3b', '#5b3a29', '#ffe0d0'];

  function face(r, p) {
    const skin = pick(r, SKINS);
    const hair = pick(r, [p[2], p[3], p[4], '#222', '#6b4423', '#c9a227']);
    const hs = Math.floor(r() * 4);
    const eyes = Math.floor(r() * 3);
    const mouth = Math.floor(r() * 3);
    const glasses = r() < 0.3;
    let s = '';
    s += '<path d="M36 256c0-56 42-80 92-80s92 24 92 80z" fill="' + p[3] + '"/>';
    s += '<rect x="112" y="146" width="32" height="42" rx="12" fill="' + skin + '"/>';
    if (hs === 0) s += '<path d="M62 120c-6-56 30-80 66-80s72 24 66 80c0 36 8 62 4 74-18 6-28-6-30-30H88c-2 24-12 36-30 30-4-12 4-38 4-74z" fill="' + hair + '"/>';
    s += '<ellipse cx="128" cy="116" rx="50" ry="58" fill="' + skin + '"/>';
    if (hs === 1) s += '<path d="M76 108c-2-44 26-66 54-66s52 22 48 64c-22-6-46-22-58-36-8 20-24 32-44 38z" fill="' + hair + '"/>';
    if (hs === 2) s += '<path d="M72 112c-8-52 28-74 58-72 36 2 60 28 54 72-12-28-30-40-56-40s-44 14-56 40z" fill="' + hair + '"/>';
    if (hs === 0) s += '<path d="M76 104c8-34 28-46 52-46s44 12 52 46c-26-4-36-20-52-22-18 2-34 18-52 22z" fill="' + hair + '"/>';
    if (hs === 3) s += '<path d="M80 92c4-36 26-46 48-46s44 10 48 46c-30 0-70 0-96 0z" fill="' + hair + '"/><circle cx="128" cy="40" r="18" fill="' + hair + '"/>';
    const ey = 118, ex = 21;
    if (eyes === 0) s += '<circle cx="' + (128 - ex) + '" cy="' + ey + '" r="6" fill="#1b1b24"/><circle cx="' + (128 + ex) + '" cy="' + ey + '" r="6" fill="#1b1b24"/>';
    if (eyes === 1) s += '<ellipse cx="' + (128 - ex) + '" cy="' + ey + '" rx="8" ry="10" fill="#fff"/><ellipse cx="' + (128 + ex) + '" cy="' + ey + '" rx="8" ry="10" fill="#fff"/><circle cx="' + (128 - ex) + '" cy="' + (ey + 1) + '" r="5" fill="#1b1b24"/><circle cx="' + (128 + ex) + '" cy="' + (ey + 1) + '" r="5" fill="#1b1b24"/>';
    if (eyes === 2) s += '<path d="M' + (128 - ex - 8) + ' ' + ey + 'q8 -8 16 0M' + (128 + ex - 8) + ' ' + ey + 'q8 -8 16 0" stroke="#1b1b24" stroke-width="4" fill="none" stroke-linecap="round"/>';
    if (glasses) s += '<g fill="none" stroke="#1b1b24" stroke-width="3.5"><rect x="' + (128 - ex - 15) + '" y="' + (ey - 13) + '" width="30" height="26" rx="9"/><rect x="' + (128 + ex - 15) + '" y="' + (ey - 13) + '" width="30" height="26" rx="9"/><path d="M' + (128 - ex + 15) + ' ' + ey + 'h' + (2 * ex - 30)  + '"/></g>';
    if (mouth === 0) s += '<path d="M108 150q20 20 40 0" stroke="#7a2e3a" stroke-width="5" fill="none" stroke-linecap="round"/>';
    if (mouth === 1) s += '<path d="M112 154h32" stroke="#7a2e3a" stroke-width="5" stroke-linecap="round"/>';
    if (mouth === 2) s += '<path d="M110 148q18 28 36 0z" fill="#7a2e3a"/>';
    s += '<circle cx="98" cy="140" r="8" fill="' + p[4] + '" opacity=".25"/><circle cx="158" cy="140" r="8" fill="' + p[4] + '" opacity=".25"/>';
    return s;
  }

  function shapes(r, p) {
    let s = '';
    const cols = [p[2], p[3], p[4]];
    const n = 5 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const c = pick(r, cols), x = r() * 256, y = r() * 256, z = 40 + r() * 90, o = 0.55 + r() * 0.4;
      const t = Math.floor(r() * 3);
      if (t === 0) s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (z / 2).toFixed(1) + '" fill="' + c + '" opacity="' + o.toFixed(2) + '"/>';
      else if (t === 1) s += '<rect x="' + (x - z / 2).toFixed(1) + '" y="' + (y - z / 2).toFixed(1) + '" width="' + z.toFixed(1) + '" height="' + z.toFixed(1) + '" rx="' + (r() * 24).toFixed(1) + '" fill="' + c + '" opacity="' + o.toFixed(2) + '" transform="rotate(' + (r() * 90).toFixed(0) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"/>';
      else s += '<path d="M' + x.toFixed(1) + ' ' + (y - z / 2).toFixed(1) + 'L' + (x + z / 2).toFixed(1) + ' ' + (y + z / 2).toFixed(1) + 'L' + (x - z / 2).toFixed(1) + ' ' + (y + z / 2).toFixed(1) + 'z" fill="' + c + '" opacity="' + o.toFixed(2) + '"/>';
    }
    return s;
  }

  function orb(r, p, uid) {
    const a = r() * 360;
    let s = '<defs><radialGradient id="o' + uid + '" cx="' + (30 + r() * 20) + '%" cy="' + (25 + r() * 20) + '%" r="75%"><stop offset="0" stop-color="' + p[4] + '"/><stop offset=".45" stop-color="' + p[2] + '"/><stop offset="1" stop-color="' + p[3] + '"/></radialGradient>' +
      '<filter id="b' + uid + '"><feGaussianBlur stdDeviation="14"/></filter></defs>';
    s += '<circle cx="128" cy="128" r="84" fill="url(#o' + uid + ')"/>';
    s += '<g filter="url(#b' + uid + ')" opacity=".7"><circle cx="' + (90 + r() * 70).toFixed(0) + '" cy="' + (90 + r() * 70).toFixed(0) + '" r="38" fill="' + p[4] + '"/></g>';
    s += '<ellipse cx="104" cy="92" rx="30" ry="16" fill="#fff" opacity=".28" transform="rotate(' + (-30 + a / 12).toFixed(0) + ' 104 92)"/>';
    return s;
  }

  function pixel(r, p) {
    const fg = pick(r, [p[2], p[3], p[4]]);
    const fg2 = pick(r, [p[2], p[3], p[4]]);
    const N = 7, cell = 256 / (N + 2);
    let s = '';
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < Math.ceil(N / 2); x++) {
        const v = r();
        if (v < 0.52) continue;
        const c = v > 0.85 ? fg2 : fg;
        const ys = (y + 1) * cell;
        s += '<rect x="' + ((x + 1) * cell).toFixed(1) + '" y="' + ys.toFixed(1) + '" width="' + (cell + 0.5).toFixed(1) + '" height="' + (cell + 0.5).toFixed(1) + '" rx="4" fill="' + c + '"/>';
        if (x !== N - 1 - x) s += '<rect x="' + ((N - x) * cell).toFixed(1) + '" y="' + ys.toFixed(1) + '" width="' + (cell + 0.5).toFixed(1) + '" height="' + (cell + 0.5).toFixed(1) + '" rx="4" fill="' + c + '"/>';
      }
    }
    return s;
  }

  // round=true -> круглая маска (для аватарок), false -> квадрат
  function make(opts) {
    const style = STYLES[opts.style] ? opts.style : 'face';
    const pal = PALETTES[opts.palette] || PALETTES.neon;
    const seed = String(opts.seed == null ? '0' : opts.seed);
    const key = style + '|' + opts.palette + '|' + seed;
    const uid = hash(key).toString(36);
    const r = rng(key);
    const p = pal.c;
    let body = '';
    if (style === 'face') body = face(r, p);
    else if (style === 'shapes') body = shapes(r, p);
    else if (style === 'orb') body = orb(r, p, uid);
    else body = pixel(r, p);
    const bg = '<defs><linearGradient id="g' + uid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + p[0] + '"/><stop offset="1" stop-color="' + p[1] + '"/></linearGradient>' +
      '<clipPath id="c' + uid + '"><' + (opts.round === false ? 'rect width="256" height="256"' : 'circle cx="128" cy="128" r="128"') + '/></clipPath></defs>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">' + bg +
      '<g clip-path="url(#c' + uid + ')"><rect width="256" height="256" fill="url(#g' + uid + ')"/>' + body + '</g></svg>';
  }

  window.Avatar = { make: make, STYLES: STYLES, PALETTES: PALETTES, hash: hash };
})();
