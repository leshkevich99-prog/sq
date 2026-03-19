import TelegramBot from 'node-telegram-bot-api';
import fs from 'node:fs';
import db from './db.js';
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
      await bot.setWebHook(`${webhookUrl}/api/bot/webhook`);
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
    const appUrl = process.env.APP_URL || 'https://t.me/your_bot_username/app';
    
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
    const chatId = msg.chat.id;
    const payment = msg.successful_payment;
    
    if (!payment) return;

    console.log('Successful payment received:', payment);
    
    try {
      const rawPayload = JSON.parse(payment.invoice_payload);
      const userId = rawPayload.u || rawPayload.userId;
      const type = rawPayload.t || rawPayload.type;
      const tariffName = rawPayload.tn || rawPayload.tariffName;
      const quotas = rawPayload.q || rawPayload.quotas;
      const amount = rawPayload.a || rawPayload.amount;
      const balanceDeduction = rawPayload.bd || rawPayload.balanceDeduction;

      if (userId) {
        if (type === 'subscription') {
          console.log(`Updating subscription for user ${userId} to ${tariffName}`);
          db.prepare(`
            UPDATE users 
            SET subscription = ?, quotas = ?, usedQuotas = NULL, limits = NULL, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(tariffName, JSON.stringify(quotas), userId);

          if (balanceDeduction && balanceDeduction > 0) {
            console.log(`Recording balance deduction of ${balanceDeduction} for user ${userId}`);
            db.prepare(`
              INSERT INTO transactions (id, userId, type, amount, description, createdAt)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(uuidv4(), userId, 'deposit_deduction', balanceDeduction, `Доплата за переход на тариф ${tariffName} (списано с депозита)`, new Date().toISOString());
          }
        } else if (type === 'service_order' && rawPayload.po) {
          const pendingOrderId = rawPayload.po;
          const orderData = db.prepare('SELECT * FROM pending_orders WHERE id = ?').get(pendingOrderId) as any;
          
          if (orderData) {
            // 1. Create real request
            const requestId = uuidv4();
            db.prepare(`
              INSERT INTO requests (id, userId, carId, type, description, priority, scheduledDate, status, actualCost, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              requestId, 
              orderData.userId, 
              orderData.carId, 
              orderData.serviceType, 
              orderData.description, 
              orderData.priority, 
              orderData.scheduledDate, 
              'pending', 
              amount || (payment.total_amount / 100), 
              new Date().toISOString()
            );

            // 2. Deduct from balance if needed
            if (orderData.balanceDeduction > 0) {
              db.prepare(`
                INSERT INTO transactions (id, userId, type, amount, description, createdAt)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(uuidv4(), userId, 'deposit_deduction', orderData.balanceDeduction, `Оплата услуги "${orderData.serviceType}" (часть суммы)`, new Date().toISOString());
            }

            // 3. Notify admins
            const admins = db.prepare("SELECT * FROM users WHERE role = 'admin'").all() as any[];
            for (const adminUser of admins) {
              // Add in-app notification
              db.prepare(`
                INSERT INTO notifications (id, userId, title, message, type, link, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                uuidv4(), 
                adminUser.id, 
                'Новое оплаченное поручение', 
                `Поступило оплаченное поручение на "${orderData.serviceType}".`, 
                'info', 
                `/task/${requestId}`, 
                new Date().toISOString()
              );

              // Send Telegram notification
              if (adminUser.telegramId) {
                await sendNotification(adminUser.telegramId, `💰 Новое оплаченное поручение!\n\nУслуга: ${orderData.serviceType}\nОплата: ${orderData.balanceDeduction > 0 ? `Депозит (${orderData.balanceDeduction.toFixed(2)}) + ` : ''}${amount || (payment.total_amount / 100).toFixed(2)} Br\n\nОткройте приложение для деталей.`);
              }
            }

            // 4. Delete pending order
            db.prepare('DELETE FROM pending_orders WHERE id = ?').run(pendingOrderId);
          }
        } else if (type === 'test_drive' && rawPayload.po) {
          const pendingOrderId = rawPayload.po;
          const orderData = db.prepare('SELECT * FROM pending_orders WHERE id = ?').get(pendingOrderId) as any;
          
          if (orderData) {
            // 1. Create real test drive request
            const testDriveId = uuidv4();
            db.prepare(`
              INSERT INTO test_drives (id, userId, name, phone, carModel, status, paidExternally, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              testDriveId, 
              orderData.userId, 
              orderData.name, 
              orderData.phone, 
              orderData.carModel, 
              'pending', 
              amount || (payment.total_amount / 100), 
              new Date().toISOString()
            );

            // 2. Notify admins
            const admins = db.prepare("SELECT * FROM users WHERE role = 'admin'").all() as any[];
            for (const adminUser of admins) {
              // Add in-app notification
              db.prepare(`
                INSERT INTO notifications (id, userId, title, message, type, link, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                uuidv4(), 
                adminUser.id, 
                'Новый тест-драйв', 
                `Поступила оплаченная заявка на тест-драйв от ${orderData.name}.`, 
                'info', 
                `/test-drives`, 
                new Date().toISOString()
              );

              // Send Telegram notification
              if (adminUser.telegramId) {
                await sendNotification(adminUser.telegramId, `🚗 Новый тест-драйв!\n\nКлиент: ${orderData.name}\nТелефон: ${orderData.phone}\nАвто: ${orderData.carModel}\nОплата: ${amount || (payment.total_amount / 100).toFixed(2)} Br\n\nОткройте приложение для деталей.`);
              }
            }

            // 3. Delete pending order
            db.prepare('DELETE FROM pending_orders WHERE id = ?').run(pendingOrderId);
          }
        }

        // Create transaction record for the external payment
        console.log(`Creating transaction record for user ${userId}`);
        db.prepare(`
          INSERT INTO transactions (id, userId, type, amount, description, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(), 
          userId, 
          type === 'subscription' ? 'payment' : type === 'service_order' ? 'payment' : type === 'test_drive' ? 'payment' : 'deposit', 
          amount || (payment.total_amount / 100), 
          type === 'subscription' ? `Оплата тарифа ${tariffName}` : type === 'service_order' ? `Оплата услуги` : type === 'test_drive' ? `Оплата тест-драйва` : 'Пополнение депозита', 
          new Date().toISOString()
        );

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
  });

  return bot;
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

  if (payload.length > 128) {
    console.error(`Invoice creation failed: Payload too long (${payload.length} bytes). Max 128 bytes.`);
    return null;
  }

  try {
    // amount is in Br, Telegram expects smallest units (kopeks)
    const telegramAmount = Math.round(amount * 100);
    if (telegramAmount <= 0) {
      console.error(`Invoice creation failed: Invalid amount ${amount}`);
      return null;
    }

    const prices = [{ label: title, amount: telegramAmount }];
    
    console.log(`Requesting Telegram invoice link for "${title}"...`);
    
    // @ts-ignore
    const link = await bot.createInvoiceLink(
      title,
      description,
      payload,
      providerToken,
      'BYN',
      prices
    );
    
    return link;
  } catch (error) {
    console.error('Telegram API error during createInvoiceLink:', error);
    return null;
  }
}

// Helper to send notifications to users
export async function sendNotification(telegramId: number | string, message: string) {
  if (!bot) {
    console.warn('Cannot send notification: Bot is not initialized');
    return false;
  }
  
  try {
    await bot.sendMessage(telegramId, message);
    return true;
  } catch (error) {
    console.error(`Failed to send notification to ${telegramId}:`, error);
    return false;
  }
}
