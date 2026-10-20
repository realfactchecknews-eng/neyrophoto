# Бэкенд Нейрофото (Cloudflare Worker)

Даёт сайту: серверные лимиты генераций, оплату Telegram Stars, серверную проверку на ИИ, загрузки в банк аватарок с модерацией.
Бесплатного тарифа Cloudflare (Workers, D1, R2) хватает для старта.

## Деплой
```bash
cd worker && npm install
npx wrangler login
npx wrangler d1 create neyrofoto            # вставить database_id в wrangler.toml
npx wrangler d1 execute neyrofoto --remote --file=schema.sql
npx wrangler r2 bucket create neyrofoto-bank
# секреты (каждая команда спросит значение)
npx wrangler secret put TOKEN_SECRET             # любая длинная случайная строка
npx wrangler secret put ADMIN_KEY                # пароль модератора
npx wrangler secret put TELEGRAM_BOT_TOKEN       # токен от @BotFather
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET  # любая случайная строка (латиница/цифры)
npx wrangler secret put HF_TOKEN                 # токен Hugging Face для серверного детектора
npx wrangler deploy
```
В `wrangler.toml` пропишите `TELEGRAM_BOT` (username бота без @) и проверьте `ALLOWED_ORIGINS`.

## Telegram-бот
1. Создайте бота у @BotFather.
2. Подключите вебхук (подставьте свои значения):
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<ваш-воркер>.workers.dev/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d 'allowed_updates=["message","pre_checkout_query"]'
```
3. В `js/config.js` задайте `apiBase` (адрес воркера) и `pay.telegramBot` (username бота).
Цены в Stars: `STARS_PACK`, `STARS_PRO` в `wrangler.toml`.

## Поток оплаты
Сайт выдаёт анонимный uid, кнопка тарифа ведёт на `t.me/<бот>?start=<план>_<uid>`, бот присылает счёт в Stars, после оплаты вебхук начисляет генерации на этот uid (идемпотентно по id платежа).

## Модерация банка
Откройте `https://neyrofoto.ru/admin.html`, введите `ADMIN_KEY`, одобряйте или отклоняйте загрузки.

## Что не доделано
- **Lava Top.** Вебхук `/api/lava/webhook` только сохраняет платежи, ничего не начисляет: формат события и способ привязать платёж к пользователю не подтверждены документацией. Нужен пример тела вебхука из кабинета Lava Top.
- **Детектор.** Использует Hugging Face Inference (`Organika/sdxl-detector` по умолчанию, см. `DETECT_MODEL`, `DETECT_URL`). Эндпоинт и качество модели нужно проверить на ваших примерах. Такие модели хуже работают на фото из мессенджеров и на новых генераторах.
- **Генерация.** По умолчанию идёт через Pollinations. Для продакшена задайте `IMAGE_API_URL` и секрет `IMAGE_API_KEY` платного провайдера.
- **Модерация промптов** отсутствует. Перед рекламой и ростом трафика добавьте фильтр запросов.

## Тесты
`npm test` в папке `worker` (нужен Node 22+, использует встроенный SQLite вместо D1).
