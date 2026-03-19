import TelegramBot from 'node-telegram-bot-api';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

let bot: TelegramBot | null = null;

export async function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
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

  // Use polling for development, webhooks for production if needed
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

  console.log('Telegram Bot initialized');

  // Load firebase config to get databaseId
  let firestoreDatabaseId: string | undefined;
  try {
    const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    firestoreDatabaseId = config.firestoreDatabaseId;
    console.log(`Bot using Firestore database: ${firestoreDatabaseId}`);
  } catch (e) {
    console.warn('Failed to load firebase config for bot, using default db');
  }

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
    
    // The payload should contain the userId and tariff/amount info
    try {
      const rawPayload = JSON.parse(payment.invoice_payload);
      // Support both short and long keys for backward compatibility during transition
      const userId = rawPayload.u || rawPayload.userId;
      const type = rawPayload.t || rawPayload.type;
      const tariffName = rawPayload.tn || rawPayload.tariffName;
      const quotas = rawPayload.q || rawPayload.quotas;
      const amount = rawPayload.a || rawPayload.amount;
      const balanceDeduction = rawPayload.bd || rawPayload.balanceDeduction;

      if (userId) {
        // Update user in Firestore
        // We need to use the specific database ID from the config
        const db = firestoreDatabaseId ? getFirestore(admin.app(), firestoreDatabaseId) : getFirestore(admin.app());

        const userRef = db.collection('users').doc(userId);
        
        if (type === 'subscription') {
          console.log(`Updating subscription for user ${userId} to ${tariffName}`);
          await userRef.update({
            subscription: tariffName,
            quotas: quotas,
            limits: admin.firestore.FieldValue.delete(),
            usedQuotas: admin.firestore.FieldValue.delete()
          });

          // If there was a balance deduction, record it
          if (balanceDeduction && balanceDeduction > 0) {
            console.log(`Recording balance deduction of ${balanceDeduction} for user ${userId}`);
            await db.collection('transactions').add({
              userId,
              type: 'deposit_deduction',
              amount: balanceDeduction,
              description: `Доплата за переход на тариф ${tariffName} (списано с депозита)`,
              createdAt: new Date().toISOString()
            });
          }
        } else if (type === 'service_order' && rawPayload.po) {
          const pendingOrderId = rawPayload.po;
          const pendingOrderSnap = await db.collection('pending_orders').doc(pendingOrderId).get();
          
          if (pendingOrderSnap.exists) {
            const orderData = pendingOrderSnap.data();
            if (orderData) {
              // 1. Create real request
              const requestRef = await db.collection('requests').add({
                ...orderData,
                status: 'pending',
                paidExternally: amount || (payment.total_amount / 100),
                createdAt: new Date().toISOString()
              });

              // 2. Deduct from balance if needed
              if (orderData.balanceDeduction > 0) {
                await db.collection('transactions').add({
                  userId,
                  type: 'deposit_deduction',
                  amount: orderData.balanceDeduction,
                  description: `Оплата услуги "${orderData.serviceType}" (часть суммы)`,
                  createdAt: new Date().toISOString()
                });
              }

              // 3. Notify admins
              const adminSnaps = await db.collection('users').where('role', '==', 'admin').get();
              for (const adminDoc of adminSnaps.docs) {
                const adminData = adminDoc.data();
                
                // Add in-app notification
                await db.collection('notifications').add({
                  userId: adminDoc.id,
                  title: 'Новое оплаченное поручение',
                  message: `Поступило оплаченное поручение на "${orderData.serviceType}".`,
                  type: 'info',
                  link: `/task/${requestRef.id}`,
                  read: false,
                  createdAt: new Date().toISOString()
                });

                // Send Telegram notification
                if (adminData.telegramId) {
                  await sendNotification(adminData.telegramId, `💰 Новое оплаченное поручение!\n\nУслуга: ${orderData.serviceType}\nОплата: ${orderData.balanceDeduction > 0 ? `Депозит (${orderData.balanceDeduction.toFixed(2)}) + ` : ''}${amount || (payment.total_amount / 100).toFixed(2)} Br\n\nОткройте приложение для деталей.`);
                }
              }

              // 4. Delete pending order
              await db.collection('pending_orders').doc(pendingOrderId).delete();
            }
          }
        } else if (type === 'test_drive' && rawPayload.po) {
          const pendingOrderId = rawPayload.po;
          const pendingOrderSnap = await db.collection('pending_orders').doc(pendingOrderId).get();
          
          if (pendingOrderSnap.exists) {
            const orderData = pendingOrderSnap.data();
            if (orderData) {
              // 1. Create real test drive request
              const requestRef = await db.collection('test_drives').add({
                ...orderData,
                status: 'pending',
                paidExternally: amount || (payment.total_amount / 100),
                createdAt: new Date().toISOString()
              });

              // 2. Notify admins
              const adminSnaps = await db.collection('users').where('role', '==', 'admin').get();
              for (const adminDoc of adminSnaps.docs) {
                const adminData = adminDoc.data();
                
                // Add in-app notification
                await db.collection('notifications').add({
                  userId: adminDoc.id,
                  title: 'Новый тест-драйв',
                  message: `Поступила оплаченная заявка на тест-драйв от ${orderData.name}.`,
                  type: 'info',
                  link: `/test-drives`,
                  read: false,
                  createdAt: new Date().toISOString()
                });

                // Send Telegram notification
                if (adminData.telegramId) {
                  await sendNotification(adminData.telegramId, `🚗 Новый тест-драйв!\n\nКлиент: ${orderData.name}\nТелефон: ${orderData.phone}\nАвто: ${orderData.carModel}\nОплата: ${amount || (payment.total_amount / 100).toFixed(2)} Br\n\nОткройте приложение для деталей.`);
                }
              }

              // 3. Delete pending order
              await db.collection('pending_orders').doc(pendingOrderId).delete();
            }
          }
        }

        // Create transaction record for the external payment
        console.log(`Creating transaction record for user ${userId}`);
        await db.collection('transactions').add({
          userId,
          type: type === 'subscription' ? 'payment' : type === 'service_order' ? 'payment' : type === 'test_drive' ? 'payment' : 'deposit',
          amount: amount || (payment.total_amount / 100),
          description: type === 'subscription' ? `Оплата тарифа ${tariffName}` : type === 'service_order' ? `Оплата услуги` : type === 'test_drive' ? `Оплата тест-драйва` : 'Пополнение депозита',
          createdAt: new Date().toISOString(),
          telegramPaymentId: payment.telegram_payment_charge_id
        });

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
