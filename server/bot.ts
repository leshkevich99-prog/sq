import TelegramBot from 'node-telegram-bot-api';
import { firestore } from './db.js';
import { v4 as uuidv4 } from 'uuid';

// Helper to fetch official bePaid receipt URL
async function fetchBePaidReceiptUrl(uid: string): Promise<string | null> {
  const shopId = process.env.BEPAID_SHOP_ID;
  const secretKey = process.env.BEPAID_SECRET_KEY;

  if (!shopId || !secretKey || !uid) return null;

  try {
    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    const response = await fetch(`https://gateway.bepaid.by/transactions/${uid}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`bePaid API error: ${response.status} for UID ${uid}`);
      return null;
    }
    const data: any = await response.json();
    return data?.transaction?.receipt_url || null;
  } catch (error) {
    console.error('Error fetching bePaid receipt:', error);
    return null;
  }
}

let bot: TelegramBot | null = null;

export async function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.WEBHOOK_URL;
  
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN is not set. Bot functionality is disabled.');
    return null;
  }

  if (bot) {
    try {
      console.log('Stopping existing bot polling...');
      await bot.stopPolling();
    } catch (e) {
      console.warn('Error stopping existing bot polling:', e);
    }
  }

  // Use webhooks if WEBHOOK_URL is set, otherwise use polling
  if (webhookUrl) {
    console.log(`Telegram Bot: Using webhook at ${webhookUrl}`);
    bot = new TelegramBot(token, { polling: false });
    try {
      const cleanWebhookUrl = webhookUrl.replace(/\/+$/, '');
      await bot.setWebHook(`${cleanWebhookUrl}/api/bot/webhook`);
    } catch (e) {
      console.error('Failed to set Telegram webhook:', e);
    }
  } else {
    console.log('Telegram Bot: Using polling');
    bot = new TelegramBot(token, { polling: true });

    bot.on('polling_error', (error: any) => {
      if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.warn('Telegram Bot: Polling conflict (409). Another instance is likely running with the same token.');
        bot?.stopPolling();
      } else {
        console.error('Telegram Bot Polling Error:', error);
      }
    });
  }

  // Global access to bot for webhooks
  (global as any).tgBot = bot;

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const appUrl = process.env.SQUADRA_URL;
    if (!appUrl) return;
    
    bot?.sendMessage(chatId, 'Добро пожаловать в Squadra! 🏎️\n\nВаш автомобильный консьерж-сервис. Нажмите кнопку ниже, чтобы открыть приложение.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Открыть приложение', web_app: { url: appUrl } }]
        ]
      }
    });
  });

  bot.onText(/\/help/, (msg) => {
    bot?.sendMessage(msg.chat.id, 'Служба поддержки Squadra. Если у вас возникли вопросы, свяжитесь с нашим администратором: @ttaammmo');
  });

  bot.on('pre_checkout_query', (query) => {
    bot?.answerPreCheckoutQuery(query.id, true).catch(err => {
      console.error('Error answering pre_checkout_query:', err);
    });
  });

  bot.on('successful_payment', async (msg) => {
    if (msg.successful_payment) {
      await handleSuccessfulPayment(msg.chat.id, msg.successful_payment);
    }
  });

  return bot;
}

export async function handleSuccessfulPayment(chatId: number, payment: any) {
  const activeBot = bot || (global as any).tgBot;
  if (!payment) return;

  console.log(`[Payment] Webhook received successful_payment for chatId ${chatId}. Amount: ${payment.total_amount / 100} BYN`);
  
  try {
    let rawPayload;
    try {
      rawPayload = JSON.parse(payment.invoice_payload);
    } catch (e) {
      console.log(`[Payment] Fetching payload from Firestore: ${payment.invoice_payload}`);
      const payloadDoc = await firestore.collection('payment_payloads').get(payment.invoice_payload);
      rawPayload = payloadDoc;
    }

    if (!rawPayload) {
      console.error('[Payment] CRITICAL: Payload NOT FOUND for ID:', payment.invoice_payload);
      activeBot?.sendMessage(chatId, '⚠️ Ошибка: данные платежа не найдены. Обратитесь в поддержку.');
      return;
    }

    // MANDATORY STRING CONVERSION FOR IDs
    let userId = (rawPayload.u || rawPayload.userId)?.toString();
    const type = rawPayload.t || rawPayload.type || 'deposit';
    const amount = Number(rawPayload.a || rawPayload.amount || (payment.total_amount / 100));
    const providerPaymentId = payment.provider_payment_charge_id;

    if (!userId) {
      console.error('[Payment] CRITICAL: userId missing in payload');
      return;
    }

    // Double-check if we need to redirect this to a real Document (migration support)
    const userDoc = await firestore.collection('users').get(userId);
    if (!userDoc) {
      const byTg = await firestore.collection('users').all([{ type: 'where', field: 'telegramId', op: '==', value: userId }]);
      if (byTg.length > 0) {
        userId = byTg[0].id; // Redirect to actual doc ID
        console.log(`[Payment] Migrated payment to user ID: ${userId}`);
      }
    }

    // 1. PRIMARY: Record the deposit replenishment (Balance increases)
    const txId = uuidv4();
    await firestore.collection('transactions').set(txId, {
      userId,
      type: 'deposit',
      amount,
      description: `Пополнение через Telegram (${type === 'subscription' ? 'Тариф' : (type === 'service_order' ? 'Услуга' : 'Депозит')})`,
      status: 'completed',
      createdAt: new Date().toISOString(),
      providerPaymentId,
      telegramPaymentId: payment.telegram_payment_charge_id
    });
    console.log(`[Payment] Deposit record ${txId} created for user ${userId}`);

    // 2. SECONDARY: Handle specific type logic
    if (type === 'subscription') {
      const tariff = rawPayload.tariff || 'telemetry';
      const tariffName = rawPayload.tn || rawPayload.tariffName || tariff.toUpperCase();
      
      await firestore.collection('users').set(userId, {
        subscription: tariffName,
        tariff: tariff,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Deduction for the subscription cost
      await firestore.collection('transactions').set(uuidv4(), {
        userId,
        type: 'deposit_deduction',
        amount,
        description: `Списание за тариф: ${tariffName}`,
        status: 'completed',
        createdAt: new Date().toISOString()
      });
    } else if (type === 'service_order' && (rawPayload.po || rawPayload.pendingOrderId)) {
      try {
        const poId = rawPayload.po || rawPayload.pendingOrderId;
        const orderData = await firestore.collection('pending_orders').get(poId);
        if (orderData) {
          const requestId = uuidv4();
          await firestore.collection('requests').set(requestId, {
            ...orderData,
            status: 'pending',
            actualCost: amount,
            createdAt: new Date().toISOString()
          });
          await firestore.collection('transactions').set(uuidv4(), {
            userId,
            type: 'deposit_deduction',
            amount,
            description: `Списание за услугу: ${orderData.serviceType}`,
            status: 'completed',
            createdAt: new Date().toISOString()
          });
          await firestore.collection('pending_orders').delete(poId);
        }
      } catch (e) {
        console.error('[Payment] Service order processing failed:', e);
      }
    }

    // 3. CONFIRM: Send success message to user
    await activeBot?.sendMessage(chatId, `✅ <b>Оплата получена!</b>\n\nСумма <b>${amount.toFixed(2)} BYN</b> зачислена на ваш счет.`, { parse_mode: 'HTML' });

    // 4. BACKGROUND: Async processing (Receipts & Notifications) - Non-blocking
    (async () => {
      try {
        const receiptUrl = await fetchBePaidReceiptUrl(providerPaymentId);
        if (receiptUrl) {
          await firestore.collection('transactions').update(txId, { receiptUrl });
        }
        
        const user = await firestore.collection('users').get(userId);
        const admins = await firestore.collection('users').all([{ type: 'where', field: 'role', op: '==', value: 'admin' }]);
        for (const admin of admins) {
          if (admin.telegramId) {
            activeBot?.sendMessage(admin.telegramId, `💰 <b>Новая оплата!</b>\nКлиент: ${user?.firstName || '---'}\nСумма: ${amount.toFixed(2)} BYN`);
          }
        }
      } catch (err) {
        console.warn('[Payment] Background task failed:', err);
      }
    })();

  } catch (error: any) {
    console.error('[Payment] CRITICAL TOP-LEVEL ERROR:', error);
    const activeBot = bot || (global as any).tgBot;
    activeBot?.sendMessage(chatId, `⚠️ Ошибка при зачислении. Сообщите админу код транзакции: <code>${payment.provider_payment_charge_id}</code>`, { parse_mode: 'HTML' });
  }
}

export function getBot() {
  return bot || (global as any).tgBot;
}

// Create Invoice Link
export async function createInvoiceLink(title: string, description: string, payload: string, amount: number) {
  const activeBot = bot || (global as any).tgBot;
  if (!activeBot) return null;
  
  const providerToken = process.env.BEPAID_TOKEN || process.env.VITE_BEPAID_TOKEN || process.env.BEPAID_PROVIDER_TOKEN;
  if (!providerToken) return null;

  try {
    const telegramAmount = Math.round(amount * 100);
    if (telegramAmount < 328) return null;

    const prices = [{ label: title, amount: telegramAmount }];
    
    // @ts-ignore
    const link = await activeBot.createInvoiceLink(
      title,
      description,
      payload,
      providerToken,
      'BYN',
      prices
    );
    
    return link;
  } catch (error: any) {
    console.error('Telegram API error during createInvoiceLink:', error);
    return null;
  }
}

// Helper to send notifications
export async function sendNotification(telegramId: number | string, message: string, options: any = {}) {
  const activeBot = bot || (global as any).tgBot;
  if (!activeBot) return false;
  
  try {
    await activeBot.sendMessage(telegramId, message, {
      parse_mode: 'HTML',
      ...options
    });
    return true;
  } catch (error) {
    console.error(`Failed to send notification to ${telegramId}:`, error);
    return false;
  }
}
