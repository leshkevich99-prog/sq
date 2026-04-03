import TelegramBot from 'node-telegram-bot-api';
import fs from 'node:fs';
import { firestore } from './db.js';
import { v4 as uuidv4 } from 'uuid';

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

    // Handle polling errors to avoid noise from 409 conflicts during restarts
    bot.on('polling_error', (error: any) => {
      if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.warn('Telegram Bot: Polling conflict (409). Another instance is likely running with the same token. Stopping current polling.');
        bot?.stopPolling();
      } else {
        console.error('Telegram Bot Polling Error:', error);
      }
    });
  }

  console.log('Telegram Bot initialized');

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    // Use the custom SQUADRA_URL to avoid conflicts with Vercel system variables
    const appUrl = process.env.SQUADRA_URL;
    
    if (!appUrl) {
      console.error('SQUADRA_URL environment variable is missing! Bot cannot provide the link.');
      bot?.sendMessage(chatId, '⚠️ Системная ошибка: SQUADRA_URL не настроен. Пожалуйста, сообщите администратору.');
      return;
    }
    
    bot?.sendMessage(chatId, 'Добро пожаловать в Squadra! 🏎️\n\nВаш автомобильный консьерж-сервис. Нажмите кнопку ниже, чтобы открыть приложение.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Открыть приложение', web_app: { url: appUrl } }]
        ]
      }
    });
  });

  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot?.sendMessage(chatId, 'Служба поддержки Squadra.\n\nЕсли у вас возникли вопросы, пожалуйста, свяжитесь с нашим администратором: @ttaammmo');
  });

  // Handle Pre-Checkout Query
  bot.on('pre_checkout_query', (query) => {
    bot?.answerPreCheckoutQuery(query.id, true).catch(err => {
      console.error('Error answering pre_checkout_query:', err);
    });
  });

// Handle Successful Payment
  bot.on('successful_payment', async (msg) => {
    await handleSuccessfulPayment(msg.chat.id, msg.successful_payment);
  });

  return bot;
}

export async function handleSuccessfulPayment(chatId: number, payment: any) {
  if (!bot || !payment) return;

  console.log('Successful payment received:', JSON.stringify(payment));
  
  try {
    let rawPayload;
    try {
      // Try to parse as JSON first (for backward compatibility)
      rawPayload = JSON.parse(payment.invoice_payload);
    } catch (e) {
      // If not JSON, it's likely a payloadId (UUID)
      console.log(`Fetching payload from Firestore for ID: ${payment.invoice_payload}`);
      rawPayload = await firestore.collection('payment_payloads').get(payment.invoice_payload);
      
      if (!rawPayload) {
        console.error(`Payload not found in Firestore for ID: ${payment.invoice_payload}`);
        bot?.sendMessage(chatId, '⚠️ Ошибка: данные платежа не найдены. Пожалуйста, свяжитесь с поддержкой.');
        return;
      }
    }

    if (!rawPayload) {
      console.error('No payload data resolved');
      bot?.sendMessage(chatId, '⚠️ Ошибка: не удалось обработать данные платежа.');
      return;
    }

    const userId = rawPayload.u || rawPayload.userId;
    const type = rawPayload.t || rawPayload.type;
    const tariffName = rawPayload.tn || rawPayload.tariffName;
    const quotas = rawPayload.q || rawPayload.quotas;
    const amount = rawPayload.a || rawPayload.amount;
    const balanceDeduction = rawPayload.bd || rawPayload.balanceDeduction;

    if (userId) {
      if (type === 'subscription') {
        console.log(`[Payment] Updating subscription for user ${userId} to "${tariffName}"`);
        
        try {
          // Map UI name to internal tariff name if needed
          let internalTariff = 'telemetry';
          if (tariffName === 'PIT STOP') internalTariff = 'pitstop';
          if (tariffName === 'SQUADRA FAMILY') internalTariff = 'family';
          
          const updateData = {
            subscription: tariffName,
            tariff: internalTariff,
            quotas: quotas || {},
            usedQuotas: {}, 
            limits: {},     
            updatedAt: new Date().toISOString()
          };
          
          await firestore.collection('users').update(userId, updateData);
          console.log(`[Payment] User ${userId} updated successfully with payload:`, JSON.stringify(updateData));
          
          // FOR CARD PAYMENTS: Record deposit then deduction as requested
          // 1. Record deposit (replenishment)
          const providerPaymentId = payment.provider_payment_charge_id;
          const telegramPaymentId = payment.telegram_payment_charge_id;
          const receiptUrl = payment.receipt_url || null;

          await firestore.collection('transactions').add({
            userId,
            type: 'deposit',
            amount: amount || (payment.total_amount / 100),
            description: `Оплата тарифа ${tariffName} (пополнение)`,
            createdAt: new Date().toISOString(),
            providerPaymentId,
            telegramPaymentId,
            receiptUrl
          });

          // 2. Record deduction (withdrawal)
          await firestore.collection('transactions').add({
            userId,
            type: 'deposit_deduction',
            amount: amount || (payment.total_amount / 100),
            description: `Оплата тарифа ${tariffName} (списание)`,
            createdAt: new Date().toISOString()
          });
        } catch (updateErr) {
          console.error(`[Payment] CRITICAL: Error updating user ${userId}:`, updateErr);
          throw updateErr;
        }

        if (balanceDeduction && balanceDeduction > 0) {
          console.log(`[Payment] Recording balance deduction of ${balanceDeduction} for user ${userId}`);
          await firestore.collection('transactions').add({
            userId,
            type: 'deposit_deduction',
            amount: balanceDeduction,
            description: `Доплата за переход на тариф ${tariffName} (списано с депозита)`,
            createdAt: new Date().toISOString()
          });
        }
      } else if (type === 'service_order' && rawPayload.po) {
        const pendingOrderId = rawPayload.po;
        const orderData = await firestore.collection('pending_orders').get(pendingOrderId);
        
        if (orderData) {
          // 1. Create real request
          const requestId = uuidv4();
          const requestNumber = await firestore.getNextNumber('requests');
          
          await firestore.collection('requests').set(requestId, {
            userId: orderData.userId,
            carId: orderData.carId,
            serviceType: orderData.serviceType,
            requestNumber,
            pickupAddress: orderData.pickupAddress || '',
            deliveryAddress: orderData.deliveryAddress || '',
            orderDate: orderData.orderDate || '',
            orderTime: orderData.orderTime || '',
            washType: orderData.washType || '',
            comment: orderData.comment || '',
            description: orderData.description || '',
            priority: orderData.priority || 'normal',
            scheduledDate: orderData.scheduledDate || '',
            status: 'pending',
            actualCost: amount || (payment.total_amount / 100),
            createdAt: new Date().toISOString()
          });

          // FOR CARD PAYMENTS: Record deposit then deduction as requested
          // 1. Record deposit (replenishment)
          const providerPaymentId = payment.provider_payment_charge_id;
          const telegramPaymentId = payment.telegram_payment_charge_id;
          const receiptUrl = payment.receipt_url || null;

          await firestore.collection('transactions').add({
            userId,
            type: 'deposit',
            amount: amount || (payment.total_amount / 100),
            description: `Оплата услуги "${orderData.serviceType}" (пополнение)`,
            createdAt: new Date().toISOString(),
            providerPaymentId,
            telegramPaymentId,
            receiptUrl
          });

          // 2. Record deduction (withdrawal)
          await firestore.collection('transactions').add({
            userId,
            type: 'deposit_deduction',
            amount: amount || (payment.total_amount / 100),
            description: `Оплата услуги "${orderData.serviceType}" (списание)`,
            createdAt: new Date().toISOString()
          });

          // 2. Deduct from balance if needed
          if (orderData.balanceDeduction > 0) {
            await firestore.collection('transactions').add({
              userId,
              type: 'deposit_deduction',
              amount: orderData.balanceDeduction,
              description: `Оплата услуги "${orderData.serviceType}" (часть суммы)`,
              createdAt: new Date().toISOString()
            });
          }

          // 3. Notify admins
          const admins = await firestore.collection('users').all([{ type: 'where', field: 'role', op: '==', value: 'admin' }]);
          const clientData = await firestore.collection('users').get(orderData.userId);
          const clientName = clientData?.firstName || 'клиент';

          for (const adminUser of admins) {
            // Add in-app notification
            await firestore.collection('notifications').set(uuidv4(), {
              userId: adminUser.id,
              title: `Новая оплаченная задача #${requestNumber}`,
              message: `Поступила оплаченная задача на "${orderData.serviceType}" от ${clientName}.`,
              type: 'info',
              link: `/task/${requestId}`,
              read: false,
              createdAt: new Date().toISOString()
            });

            // Send Telegram notification
            if (adminUser.telegramId) {
              const msg = `🏎️ <b>Новая оплаченная задача #${requestNumber}</b>\n\n` +
                          `<b>Услуга:</b> ${orderData.serviceType}\n` +
                          `<b>Клиент:</b> ${clientName}\n` +
                          `<b>Оплата:</b> ${amount || (payment.total_amount / 100).toFixed(2)} BYN\n\n` +
                          `<i>Откройте приложение для просмотра деталей.</i>`;
              
              await sendNotification(adminUser.telegramId, msg, {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📂 Открыть задачу', url: `https://t.me/squadraby_bot/app?startapp=task_${requestId}` }]
                  ]
                }
              });
            }
          }

          // 4. Delete pending order
          await firestore.collection('pending_orders').delete(pendingOrderId);
        }
      } else if (type === 'test_drive' && rawPayload.po) {
        const pendingOrderId = rawPayload.po;
        const orderData = await firestore.collection('pending_orders').get(pendingOrderId);
        
        if (orderData) {
          // 1. Create real request in common collection 'requests'
          const requestId = uuidv4();
          const requestData = {
            userId: orderData.userId,
            carId: 'none', // Required field
            serviceType: 'test_drive',
            status: 'pending',
            description: `Запись на тест-драйв от ${orderData.name}. Адрес: ${orderData.address || '—'}. Дата: ${orderData.date} ${orderData.time}. Телефон: ${orderData.phone}`,
            actualCost: amount || (payment.total_amount / 100),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await firestore.collection('requests').set(requestId, requestData);

          // FOR CARD PAYMENTS: Record deposit then deduction as requested
          // 1. Record deposit (replenishment)
          const providerPaymentId = payment.provider_payment_charge_id;
          const telegramPaymentId = payment.telegram_payment_charge_id;
          const receiptUrl = payment.receipt_url || null;

          await firestore.collection('transactions').add({
            userId,
            type: 'deposit',
            amount: amount || (payment.total_amount / 100),
            description: `Оплата тест-драйва (пополнение)`,
            createdAt: new Date().toISOString(),
            providerPaymentId,
            telegramPaymentId,
            receiptUrl
          });

          // 2. Record deduction (withdrawal)
          await firestore.collection('transactions').add({
            userId,
            type: 'deposit_deduction',
            amount: amount || (payment.total_amount / 100),
            description: `Оплата тест-драйва (списание)`,
            createdAt: new Date().toISOString()
          });
          console.log(`[Payment] Test drive request ${requestId} created for user ${orderData.userId}`);

          // 2. Notify admins
          const admins = await firestore.collection('users').all([{ type: 'where', field: 'role', op: '==', value: 'admin' }]);
          for (const adminUser of admins) {
            // Add in-app notification
            await firestore.collection('notifications').set(uuidv4(), {
              userId: adminUser.id,
              title: 'Новый тест-драйв',
              message: `Поступила оплаченная заявка на тест-драйв от ${orderData.name}.`,
              type: 'info',
              link: `/task/${requestId}`,
              read: false,
              createdAt: new Date().toISOString()
            });

            // Send Telegram notification
            if (adminUser.telegramId) {
              await sendNotification(adminUser.telegramId, `🚗 Новый тест-драйв!\n\nКлиент: ${orderData.name}\nТелефон: ${orderData.phone}\nАвто: ${orderData.carModel}\nОплата: ${amount || (payment.total_amount / 100).toFixed(2)} Br\n\nОткройте приложение для деталей.`);
            }
          }

          // 3. Delete pending order
          await firestore.collection('pending_orders').delete(pendingOrderId);
        }
      }

      // Record generic deposit if it was a simple deposit replenishment
      if (type === 'deposit' || (!['subscription', 'service_order', 'test_drive'].includes(type))) {
        console.log(`Creating deposit record for user ${userId}`);
        const providerPaymentId = payment.provider_payment_charge_id;
        const telegramPaymentId = payment.telegram_payment_charge_id;
        
        // We cannot reliably guess the receipt URL without a hash. 
        // Real receipt_url should be fetched via bePaid API if credentials were provided.
        const receiptUrl = payment.receipt_url || null; 

        await firestore.collection('transactions').add({
          userId,
          type: 'deposit',
          amount: amount || (payment.total_amount / 100),
          description: 'Пополнение депозита',
          createdAt: new Date().toISOString(),
          providerPaymentId,
          telegramPaymentId,
          receiptUrl
        });
      }

      bot?.sendMessage(chatId, '✅ Оплата прошла успешно! Ваш профиль обновлен.');
    } else {
      console.error('No userId in payment payload');
      bot?.sendMessage(chatId, '⚠️ Ошибка: в данных платежа отсутствует ID пользователя.');
    }
  } catch (error) {
    console.error('Error processing successful payment:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    bot?.sendMessage(chatId, `⚠️ Оплата получена, но возникла ошибка при обновлении профиля: ${errorMessage}. Пожалуйста, свяжитесь с поддержкой.`);
  }
}

export function getBot() {
  return bot;
}

// Create Invoice Link
export async function createInvoiceLink(title: string, description: string, payload: string, amount: number) {
  if (!bot) {
    console.error('Invoice creation failed: Bot not initialized');
    return null;
  }
  
  const providerToken = process.env.BEPAID_TOKEN || process.env.VITE_BEPAID_TOKEN || process.env.BEPAID_PROVIDER_TOKEN;
  if (!providerToken) {
    console.error('Invoice creation failed: BEPAID_TOKEN is not set in environment variables');
    return null;
  }

  try {
    // amount is in Br, Telegram expects smallest units (kopeks)
    const telegramAmount = Math.round(amount * 100);
    
    // Telegram requires a minimum of 3.28 BYN (328 kopeks)
    if (telegramAmount < 328) {
      console.error(`Invoice creation failed: Amount ${amount} BYN is below Telegram's minimum allowed amount of 3.28 BYN.`);
      return null;
    }
    if (telegramAmount > 3275501) {
      console.error(`Invoice creation failed: Amount ${amount} BYN is above Telegram's maximum allowed amount of 32,755.01 BYN.`);
      return null;
    }

    const prices = [{ label: title, amount: telegramAmount }];
    
    console.log(`Requesting Telegram invoice link for "${title}" with payload length ${payload.length}...`);
    
    // @ts-ignore
    const link = await bot.createInvoiceLink(
      title,
      description,
      payload,
      providerToken,
      'BYN',
      prices
    );
    
    if (!link) {
      console.error('Telegram API returned empty link for createInvoiceLink');
    }

    return link;
  } catch (error: any) {
    console.error('Telegram API error during createInvoiceLink:', error);
    if (error.response && error.response.body) {
      console.error('Telegram API error body:', error.response.body);
    }
    return null;
  }
}

// Helper to send notifications to users with HTML support and optional markup
export async function sendNotification(telegramId: number | string, message: string, options: any = {}) {
  if (!bot) {
    console.warn('Cannot send notification: Bot is not initialized');
    return false;
  }
  
  try {
    await bot.sendMessage(telegramId, message, {
      parse_mode: 'HTML',
      ...options
    });
    return true;
  } catch (error) {
    console.error(`Failed to send notification to ${telegramId}:`, error);
    return false;
  }
}
