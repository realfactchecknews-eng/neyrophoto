// Проверка изображения на следы ИИ. Работает целиком в браузере, файл никуда не отправляется.
// Это анализ метаданных и косвенных признаков, а не классификатор пикселей: честный вердикт «чисто» он дать не может.
(function () {
  const AI_MARKERS = [
    [/trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia/i, 'IPTC-метка «создано алгоритмом ИИ»', 70],
    [/midjourney/i, 'Упоминание Midjourney в метаданных', 75],
    [/stable[ _-]?diffusion|sdxl|automatic1111|comfyui|invokeai/i, 'Упоминание Stable Diffusion / ComfyUI в метаданных', 75],
    [/Steps: \d+, Sampler:|CFG scale:|Negative prompt:/, 'Параметры генерации (steps / sampler / prompt) внутри файла', 80],
    [/dall[-· ]?e|openai/i, 'Упоминание DALL·E / OpenAI в метаданных', 70],
    [/firefly/i, 'Упоминание Adobe Firefly в метаданных', 65],
    [/synthid|made with google ai|imagen|gemini/i, 'Метка Google AI (Imagen / Gemini / SynthID)', 65],
    [/flux\.1|black[ _-]?forest|leonardo\.ai|ideogram|nightcafe|playground ?ai|pollinations|krea\.ai|recraft/i, 'Упоминание сервиса генерации изображений', 65],
    [/kandinsky|шедеврум|sber ?ai/i, 'Упоминание российского генератора (Kandinsky / Шедеврум)', 65]
  ];
  const CAMERAS = /Canon|NIKON|SONY|Apple|SAMSUNG|FUJIFILM|OLYMPUS|Panasonic|LEICA|Xiaomi|HUAWEI|OPPO|vivo|OnePlus|Pentax/;

  function latin1(u8) {
    let s = '';
    const step = 0x8000;
    for (let i = 0; i < u8.length; i += step) s += String.fromCharCode.apply(null, u8.subarray(i, i + step));
    return s;
  }

  function dims(file) {
    return new Promise(function (resolve) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  async function analyze(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const text = latin1(buf.subarray(0, Math.min(buf.length, 600000)));
    const d = await dims(file);
    const findings = [];
    let score = 25; // нейтральная стартовая оценка

    let strong = 0;
    AI_MARKERS.forEach(function (m) {
      if (m[0].test(text)) { findings.push({ t: 'bad', msg: m[1] }); strong = Math.max(strong, m[2]); }
    });
    if (strong) score = Math.max(score, strong);

    if (/c2pa|jumbf|contentcredentials/i.test(text)) {
      findings.push({ t: 'info', msg: 'Есть Content Credentials (C2PA): файл подписан, но подпись есть и у обычных фото. Сама по себе это не признак ИИ' });
      score += 5;
    }

    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const hasExif = /Exif\0\0/.test(text);
    if (hasExif && CAMERAS.test(text.slice(0, 70000))) {
      findings.push({ t: 'ok', msg: 'В EXIF указана модель камеры или телефона, что типично для настоящих снимков' });
      score -= 25;
    } else if (!hasExif) {
      findings.push({ t: 'info', msg: 'Метаданных камеры нет. Их убирают мессенджеры и соцсети, так что это слабый признак' });
      score += 8;
    }

    if (d) {
      const m64 = d.w % 64 === 0 && d.h % 64 === 0 && d.w >= 512 && d.h >= 512;
      if (m64 && d.w === d.h) { findings.push({ t: 'info', msg: 'Размер ' + d.w + '×' + d.h + ': квадрат, кратный 64, характерен для нейросетей' }); score += 14; }
      else if (m64) { findings.push({ t: 'info', msg: 'Размер ' + d.w + '×' + d.h + ' кратен 64, как у многих генераторов' }); score += 8; }
    }

    score = Math.max(3, Math.min(97, Math.round(score)));
    let verdict, level;
    if (strong) { verdict = 'Сгенерировано ИИ: нашли прямые следы в файле'; level = 'bad'; score = Math.max(score, 85); }
    else if (score >= 50) { verdict = 'Есть подозрительные признаки'; level = 'info'; }
    else if (score >= 30) { verdict = 'Неопределённо'; level = 'info'; }
    else { verdict = 'Явных следов ИИ не найдено'; level = 'ok'; }

    return {
      score: score, verdict: verdict, level: level, findings: findings,
      info: { name: file.name, size: file.size, type: file.type || (isJpeg ? 'image/jpeg' : '—'), dims: d }
    };
  }

  window.Detect = { analyze: analyze };
})();
