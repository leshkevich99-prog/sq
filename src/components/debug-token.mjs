/**
 * Диагностический скрипт для проверки токена Telegram бота.
 * Запуск: node debug-token.mjs
 *
 * Как работает:
 * 1. Берём известный data check string и полученный хэш из логов сервера
 * 2. Пробуем все токены которые ты вводишь
 * 3. Если хэш совпадает — это правильный токен
 */

import crypto from 'crypto';

// ─── Данные из логов сервера (для пользователя Ttaammmo) ──────────────────────
const RECEIVED_HASH = '107e6f808cd1ee7546f76daedb7927973a5c4e56077f53941923d3ee4b223631';
const DATA_CHECK_STRING = [
  'auth_date=1774338778',
  'chat_instance=8060520916662908766',
  'chat_type=sender',
  'user={"id":847634885,"first_name":"It\'s","last_name":"","username":"Ttaammmo","language_code":"ru","is_premium":true,"allows_write_to_pm":true,"photo_url":"https:\\/\\/t.me\\/i\\/userpic\\/320\\/1dlRmtWmhGQI4eRc55sP_qPbzT1KqTVqBEZQoXfC4Mk.svg"}'
].join('\n');

// ─── Также данные для пользователя ppaaoort ───────────────────────────────────
const RECEIVED_HASH_2 = '5ddfee154baee9e4ffcecdfb2d61b14e787eff52553843faf27e2ffb119b3c3a';
const DATA_CHECK_STRING_2 = [
  'auth_date=1774335151',
  'query_id=AAHYRGVqAwAAANhEZWp3ybSQ',
  'user={"id":8227472600,"first_name":"\\u0418\\u0432\\u0430\\u043d","last_name":"","username":"ppaaoort","language_code":"ru","allows_write_to_pm":true,"photo_url":"https:\\/\\/t.me\\/i\\/userpic\\/320\\/sYF7nwU-w6y5idaCyvo-LQFoUJ6rQaDFK1pr4PEBnp3n2esxKtCkFFoKFGzFCS5D.svg"}'
].join('\n');

function computeHash(token, dataCheckString) {
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  return crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

function testToken(token) {
  const cleaned = token.replace(/[^\x21-\x7E]/g, '').trim();
  const h1 = computeHash(cleaned, DATA_CHECK_STRING);
  const h2 = computeHash(cleaned, DATA_CHECK_STRING_2);
  
  const match1 = h1 === RECEIVED_HASH;
  const match2 = h2 === RECEIVED_HASH_2;
  
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Токен: ${cleaned.substring(0, 10)}... (len=${cleaned.length})`);
  console.log(`Bot ID: ${cleaned.split(':')[0]}`);
  console.log(`\nТест 1 (Ttaammmo):`);
  console.log(`  Computed : ${h1}`);
  console.log(`  Expected : ${RECEIVED_HASH}`);
  console.log(`  Статус   : ${match1 ? '✅ СОВПАДАЕТ!' : '❌ не совпадает'}`);
  
  console.log(`\nТест 2 (ppaaoort):`);
  console.log(`  Computed : ${h2}`);
  console.log(`  Expected : ${RECEIVED_HASH_2}`);
  console.log(`  Статус   : ${match2 ? '✅ СОВПАДАЕТ!' : '❌ не совпадает'}`);
  
  if (match1 || match2) {
    console.log(`\n🎉 ПРАВИЛЬНЫЙ ТОКЕН: ${cleaned}`);
    console.log(`Используй его в Vercel → TELEGRAM_BOT_TOKEN`);
  }
  
  return match1 || match2;
}

// ─── Читаем токены из аргументов командной строки ────────────────────────────
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Использование:');
  console.log('  node debug-token.mjs TOKEN1 TOKEN2 TOKEN3 ...');
  console.log('\nПример:');
  console.log('  node debug-token.mjs 8635277211:AAFCky0pK...');
  console.log('\nМожно передать несколько токенов — скрипт проверит каждый.');
  console.log('\nTIP: Возьми ВСЕ токены из @BotFather (/mybots → каждый бот → API Token)');
  console.log('     и передай их все сразу — скрипт найдёт правильный.\n');
  process.exit(0);
}

console.log(`\nПроверяем ${args.length} токен(ов)...\n`);
let found = false;
for (const token of args) {
  if (testToken(token)) {
    found = true;
  }
}

if (!found) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('❌ Ни один токен не совпал.');
  console.log('\nВозможные причины:');
  console.log('1. Бот который открывает Mini App — другой (передай его токен)');
  console.log('2. Data check string в скрипте нужно обновить из свежих логов');
  console.log('3. Поле user в data check string сохранено неправильно (спецсимволы)');
}
