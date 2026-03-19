import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { initBot, sendNotification } from './server/bot.js';
import { TARIFFS } from './src/config/tariffs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
const firebaseConfig = JSON.parse(await import('fs/promises').then(f => f.readFile('./firebase-applet-config.json', 'utf-8')));

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: firebaseConfig.storageBucket
    });
    console.log('Firebase Admin initialized with service account');
  } catch (error) {
    console.error('Error parsing FIREBASE_SERVICE_ACCOUNT_KEY:', error);
  }
} else {
  // Try default credentials (works in Cloud Run if configured)
  try {
    admin.initializeApp({
      storageBucket: firebaseConfig.storageBucket
    });
    console.log('Firebase Admin initialized with default credentials');
  } catch (error) {
    console.warn('Firebase Admin could not be initialized. Custom tokens will not work.');
  }
}

// Initialize Telegram Bot
await initBot();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // ==========================================
  // API ROUTES (БЭКЕНД ДЛЯ ВАШЕЙ БАЗЫ ДАННЫХ)
  // ==========================================

  // Quota Reset Endpoint (can be called by Cloud Scheduler)
  app.post('/api/cron/reset-quotas', async (req, res) => {
    try {
      // Optional: Add basic auth or a secret token check here for security
      const authHeader = req.headers.authorization;
      if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const db = firebaseConfig.firestoreDatabaseId 
        ? getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId) 
        : getFirestore(admin.app());

      const usersSnapshot = await db.collection('users').get();
      const batch = db.batch();
      let resetCount = 0;

      // We need to import TARIFFS here or duplicate the logic since it's a backend file
      // For simplicity, we'll just reset usedQuotas to {} and restore quotas from limits if they exist
      
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.subscription) {
          const updates: any = {
            usedQuotas: admin.firestore.FieldValue.delete()
          };
          
          // If the user has custom limits, restore quotas to those limits
          if (userData.limits) {
            updates.quotas = userData.limits;
          } else {
            // Otherwise, restore from TARIFFS
            const tariff = Object.values(TARIFFS).find(t => t.name === userData.subscription) as any;
            if (tariff) {
              updates.quotas = {
                logistics: tariff.logistics,
                wash: tariff.wash,
                valet: tariff.valet || 0,
                parking: tariff.parking || 0,
                bureaucracy: tariff.bureaucracy || 0
              };
            } else {
              updates.quotas = admin.firestore.FieldValue.delete();
            }
          }

          batch.update(doc.ref, updates);
          resetCount++;
        }
      });

      if (resetCount > 0) {
        await batch.commit();
      }

      res.json({ success: true, message: `Reset quotas for ${resetCount} users` });
    } catch (error) {
      console.error('Error resetting quotas:', error);
      res.status(500).json({ error: 'Failed to reset quotas' });
    }
  });

  // Telegram Auth Verification
  app.post('/api/auth/telegram-login', async (req, res) => {
    const { initData } = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
    }

    if (!initData) {
      return res.status(400).json({ error: 'initData is required' });
    }

    try {
      // 1. Parse initData
      const params = new URLSearchParams(initData);
      const hash = params.get('hash');
      params.delete('hash');

      // 2. Sort params alphabetically
      const sortedParams = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      // 3. Create secret key
      const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();

      // 4. Calculate hash
      const calculatedHash = crypto.createHmac('sha256', secretKey)
        .update(sortedParams)
        .digest('hex');

      if (calculatedHash !== hash) {
        console.warn('Telegram auth hash mismatch:', { calculatedHash, hash });
        return res.status(401).json({ error: 'Invalid hash' });
      }

      // 5. Extract user data
      const userStr = params.get('user');
      if (!userStr) {
        console.warn('Telegram auth: User data missing in initData');
        return res.status(400).json({ error: 'User data missing in initData' });
      }

      const tgUser = JSON.parse(userStr);
      const telegramId = tgUser.id.toString();
      console.log(`Telegram login successful for user ${tgUser.username} (${telegramId})`);

      let role = 'client';
      if (tgUser.username?.toLowerCase() === 'ttaammmo') {
        role = 'admin';
      }

      // 6. Create Firebase Custom Token
      // We use telegram_{id} as the UID to avoid collisions with other providers
      const customToken = await admin.auth().createCustomToken(`telegram_${telegramId}`, {
        telegramId: tgUser.id,
        username: tgUser.username,
        firstName: tgUser.first_name,
        role
      });

      res.json({ token: customToken });
    } catch (error) {
      console.error('Telegram auth error:', error);
      res.status(500).json({ error: 'Internal server error during authentication' });
    }
  });

  // 1. Оплата через bePaid (Webhook / Callback)
  app.post('/api/payments/bepaid/callback', (req, res) => {
    const paymentData = req.body;
    console.log('Получен callback от bePaid:', paymentData);
    // TODO: Проверка подписи bePaid
    // TODO: Обновление статуса в БД (Активация тест-драйва или подписки)
    res.status(200).send('OK');
  });

  // 2. Создание ссылки на оплату (bePaid via Telegram)
  app.post('/api/payments/bepaid/create', async (req, res) => {
    const { amount, description, userId, type, tariffName, quotas } = req.body;
    
    if (!userId || !amount) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }

    const { createInvoiceLink } = await import('./server/bot.js');
    
    // Shorten keys to stay under 128 bytes Telegram limit
    const payload = JSON.stringify({
      u: userId,
      t: type || 'dep',
      tn: tariffName,
      q: quotas,
      a: amount,
      bd: req.body.balanceDeduction || 0,
      po: req.body.pendingOrderId
    });

    const title = type === 'subscription' ? `Тариф ${tariffName}` : 'Пополнение депозита';
    const invoiceDescription = description || title;

    console.log(`Creating invoice for user ${userId}, amount: ${amount}, payload size: ${payload.length}`);
    const link = await createInvoiceLink(title, invoiceDescription, payload, amount);

    if (link) {
      res.json({ 
        payment_url: link,
        status: 'pending'
      });
    } else {
      res.status(500).json({ error: 'Failed to create invoice link' });
    }
  });

  // 3. Ручной биллинг (Админ)
  app.post('/api/admin/billing/manual', (req, res) => {
    const { userId, amount, type } = req.body; // type: 'deposit_writeoff' | 'limit_writeoff'
    // TODO: Запись в БД (Списание лимитов и депозита)
    res.json({ success: true, message: 'Списание успешно проведено' });
  });

  // 4. Получение задач (Канбан для админа, Список для пилота)
  app.get('/api/tasks', (req, res) => {
    // TODO: Выборка из БД
    res.json([
      { id: 1, client: 'Иван И.', car: 'Porsche 911', status: 'pending', type: 'logistics' },
      { id: 2, client: 'Анна С.', car: 'Bentley', status: 'in_progress', type: 'wash', pilotId: 5 }
    ]);
  });

  // 6. Send Telegram Notification
  app.post('/api/notifications/send', async (req, res) => {
    const { telegramId, message } = req.body;
    if (!telegramId || !message) {
      return res.status(400).json({ error: 'telegramId and message are required' });
    }
    
    const success = await sendNotification(telegramId, message);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });

  // 7. CORS-Bypassing Upload Proxy
  // This endpoint receives the file and the user's token, and makes the request to Firebase
  // from the server side, completely bypassing browser CORS restrictions.
  app.post('/api/upload-proxy', async (req, res) => {
    const { base64Data, fileName, token, bucket } = req.body;
    
    if (!base64Data || !fileName || !token || !bucket) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const base64String = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64String, 'base64');
      
      const encodedPath = encodeURIComponent(fileName);
      const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodedPath}`;
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'image/jpeg',
          'Content-Length': buffer.length.toString()
        },
        body: buffer
      });
      
      if (!response.ok) {
        const errText = await response.text();
        console.error('Firebase REST Error:', errText);
        if (response.status === 403) {
          return res.status(403).json({ error: 'Доступ запрещен (403). Проверьте правила Storage.' });
        }
        if (response.status === 404) {
          return res.status(404).json({ error: 'Хранилище не включено. Зайдите в Firebase Console -> Storage и нажмите "Get Started".' });
        }
        return res.status(response.status).json({ error: `Firebase error: ${response.status}` });
      }
      
      const data = await response.json();
      const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${data.downloadTokens}`;
      
      res.json({ url: downloadURL });
    } catch (error: any) {
      console.error('Upload proxy error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================
  // VITE MIDDLEWARE (ФРОНТЕНД)
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
