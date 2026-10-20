# Нейрофото: передача проекта для деплоя

Репозиторий: https://github.com/realfactchecknews-eng/neyrophoto (ветка `main`). Домен: `neyrofoto.ru`. Фронтенд на GitHub Pages уже включён, DNS в reg.ru настроен (4 A-записи на GitHub Pages и CNAME `www`).

## Что это
Статический сайт без сборки (HTML, CSS, JS) плюс бэкенд на Cloudflare Worker.
- `index.html`, `create.html` (конструктор аватарок и нейро-генерация), `check.html` (проверка фото на ИИ), `bank.html` (банк аватарок и пользовательские загрузки), `pricing.html`, `privacy.html`, `terms.html`, `admin.html` (модерация банка, `noindex`)
- `js/config.js` единая точка настройки: `apiBase`, `legal`, `freePerDay`, `imageProvider`, `ads`, `pay`
- `js/api.js` клиент бэкенда. Пока `apiBase` пуст, сайт работает автономно: лимиты в браузере, без оплаты и загрузок в банк
- `worker/` бэкенд: `src/index.js` (роутер), `quota.js`, `telegram.js`, `media.js`, `util.js`, `schema.sql`, `wrangler.toml`, `test/api.test.js`, `README.md`

## Задача деплоя
1. В `worker/`: `npm install`.
2. `wrangler d1 create neyrofoto`, `database_id` вписать в `worker/wrangler.toml`.
3. `wrangler d1 execute neyrofoto --remote --file=schema.sql`.
4. `wrangler r2 bucket create neyrofoto-bank`.
5. Секреты через `wrangler secret put` (значения у владельца, не коммитить):
   - `TOKEN_SECRET` любая длинная случайная строка (можно сгенерировать)
   - `ADMIN_KEY` пароль модератора (сгенерировать и сообщить владельцу)
   - `TELEGRAM_WEBHOOK_SECRET` случайная строка из латиницы и цифр
   - `TELEGRAM_BOT_TOKEN` от @BotFather (спросить владельца)
   - `HF_TOKEN` токен Hugging Face для детектора (спросить владельца)
6. В `wrangler.toml` вписать `TELEGRAM_BOT` (username бота без @), проверить `ALLOWED_ORIGINS`.
7. `wrangler deploy`, запомнить адрес воркера. Проверить `GET <адрес>/api/health` (ожидается `{"ok":true}`).
8. Вебхук Telegram: `setWebhook` на `<адрес>/api/telegram/webhook` с `secret_token=<TELEGRAM_WEBHOOK_SECRET>` и `allowed_updates=["message","pre_checkout_query"]`.
9. В `js/config.js`: `apiBase` = адрес воркера, `pay.telegramBot` = username бота. Закоммитить и запушить в `main`.
10. Проверить на живом сайте: генерация (квота 3 в день, потом окно оплаты), кнопка Stars на `pricing.html` ведёт на `t.me/<бот>?start=<план>_<uid>`, бот присылает счёт, после оплаты кредиты начисляются, загрузка в банк и одобрение в `admin.html`, серверная проверка на ИИ.
11. Включить HTTPS для `neyrofoto.ru` в Settings → Pages (Enforce HTTPS), если ещё не включено.

## Тесты
`cd worker && npm test` (Node 22+, 15 тестов, SQLite вместо D1). Все проходят.

## Что не доделано и в чём нет уверенности
- **Lava Top.** `/api/lava/webhook` только сохраняет платежи, ничего не начисляет. Формат вебхука и привязка платежа к пользователю не подтверждены. Нужен пример тела вебхука.
- **Детектор ИИ.** Через Hugging Face Inference, модель `Organika/sdxl-detector` (переменные `DETECT_MODEL`, `DETECT_URL`). Адрес API и качество не проверены на реальных данных. Если эндпоинт не отвечает, проверить актуальный формат Inference API (сейчас возможен роутер провайдеров).
- **Генерация.** Идёт через бесплатный Pollinations (`image.pollinations.ai`), нестабилен. Для продакшена задать `IMAGE_API_URL` и секрет `IMAGE_API_KEY`.
- **Фильтра промптов нет.** Перед рекламой и ростом трафика добавить.
- **Покупки привязаны к анонимному uid в localStorage.** При очистке данных браузера пропадают. Следующий этап: вход через Telegram.
- **Юридические страницы.** Реквизиты `legal` в `js/config.js` пусты (владелец, ИНН, email), на страницах висит предупреждение. Тексты написаны без юриста. Вопросы 152-ФЗ и обработки данных за рубежом не закрыты.
- **Реклама** выключена (`ads.enabled: false`), показываются рамки-заглушки. Для РСЯ нужен `blockId` в `ads.yandexBlockIds`.

## Правила работы
- Секреты никогда не коммитить (`.dev.vars`, `.wrangler/` уже в `.gitignore`).
- Коммит-сообщения на русском, как в истории репозитория.
- Не менять `CNAME` (`neyrofoto.ru`).
