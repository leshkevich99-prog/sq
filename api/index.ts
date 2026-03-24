import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { initBot, sendNotification, getBot, createInvoiceLink } from '../server/bot.js';
import { firestore, adminAuth } from '../server/db.js';
import { generateToken, authenticateToken, AuthRequest, isAdmin } from '../server/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

async function startServer() {
  console.log('Starting server initialization...');
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
  console.log('Express middleware configured');

  // Initialize Telegram Bot asynchronously
  initBot().then(() => {
    console.log('Telegram Bot initialization completed');
  }).catch(err => {
    console.error('Failed to initialize Telegram Bot:', err);
  });

  // ==========================================
  // DIAGNOSTIC ENDPOINT
  // ==========================================
  app.get('/api/debug-env', async (req, res) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
    const botId = botToken.split(':')[0] || 'none';
    
    let tgInfo = null;
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      tgInfo = await resp.json();
    } catch (e: any) {
      tgInfo = { error: e.message };
    }

    res.json({
      bot_id_env: botId,
      token_length: botToken.length,
      token_prefix: botToken.substring(0, 10) + '...',
      telegram_api_status: tgInfo,
      node_version: process.version,
      timestamp: new Date().toISOString()
    });
  });

  // ==========================================
  // API ROUTES (LOCAL DATABASE)
  // ==========================================

  // Telegram Login
  app.post('/api/auth/telegram-login', async (req, res) => {
    try {
      const { initData } = req.body;
      if (!initData) return res.status(400).json({ error: 'Missing initData' });

      const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
      if (!botToken) {
        console.error('TELEGRAM_BOT_TOKEN not set or empty');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      // Log token prefix for debugging (safe)
      console.log(`Verifying with bot token starting with: ${botToken.substring(0, 4)}... (length: ${botToken.length})`);
      console.log(`Raw initData length: ${initData.length}`);

      // Ручной парсинг initData через decodeURIComponent (НЕ URLSearchParams)
      // URLSearchParams декодирует + как пробел (HTML form encoding) — это неверно для Telegram
      let receivedHash = '';
      const params: Record<string, string> = {};
      for (const part of String(initData).split('&')) {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) continue;
        const key = decodeURIComponent(part.slice(0, eqIdx));
        const value = decodeURIComponent(part.slice(eqIdx + 1));
        if (key === 'hash') { receivedHash = value; continue; }
        if (key === 'signature') continue;
        params[key] = value;
      }

      // Сортировка и построение data check string
      const dataCheckString = Object.entries(params)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      let calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      console.log(`Hash check: calculated=${calculatedHash.slice(0, 8)}... received=${receivedHash.slice(0, 8)}...`);

      if (calculatedHash !== receivedHash) {
        // ПОПЫТКА №2: Некоторые версии Telegram Mini Apps могут не экранировать слэши в user JSON
        const altDataCheckString = dataCheckString.replace(/\\\//g, '/');
        const altHash = crypto.createHmac('sha256', secretKey).update(altDataCheckString).digest('hex');
        
        if (altHash === receivedHash) {
          console.log('Hash matched on attempt #2 (unescaped slashes)');
          calculatedHash = altHash;
        }
      }

      if (calculatedHash !== receivedHash) {
        console.error('Telegram hash mismatch!');
        console.log(`Bot ID in TELEGRAM_BOT_TOKEN: ${botToken.split(':')[0]}`);
        console.log('Data check string:', dataCheckString);
        console.log('Calculated hash:', calculatedHash);
        console.log('Received hash:', receivedHash);
        return res.status(401).json({ error: 'Invalid Telegram data' });
      }

      const userStr = params['user'];
      if (!userStr) return res.status(400).json({ error: 'Missing user data' });
      const tgUser = JSON.parse(userStr);

      // Check if user exists in Firestore
      let user = await firestore.collection('users').all([{ type: 'where', field: 'telegramId', op: '==', value: tgUser.id.toString() }]);
      let userData = user[0];

      if (!userData) {
        const id = uuidv4();
        // Default admin check
        const role = (tgUser.username?.toLowerCase() === 'ttaammmo' || tgUser.id.toString() === '123456789') ? 'admin' : 'client';
        userData = await firestore.collection('users').set(id, {
          telegramId: tgUser.id.toString(),
          username: tgUser.username || '',
          firstName: tgUser.first_name || '',
          lastName: tgUser.last_name || '',
          photoUrl: tgUser.photo_url || '',
          role
        });
      } else {
        userData = await firestore.collection('users').set(userData.id, {
          username: tgUser.username || '',
          firstName: tgUser.first_name || '',
          lastName: tgUser.last_name || '',
          photoUrl: tgUser.photo_url || ''
        });
      }

      const token = generateToken({ id: userData.id, telegramId: userData.telegramId, role: userData.role });

      let firebaseCustomToken = null;
      try {
        if (adminAuth) {
          firebaseCustomToken = await adminAuth.createCustomToken(userData.id);
        }
      } catch (authErr) {
        console.error('Error creating custom token:', authErr);
      }

      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({ user: userData, firebaseCustomToken, token });
    } catch (error: any) {
      console.error('Telegram login error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/auth/me', authenticateToken, async (req: AuthRequest, res) => {
    const user = await firestore.collection('users').get(req.user?.id!);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let firebaseCustomToken = null;
    try {
      if (adminAuth) {
        firebaseCustomToken = await adminAuth.createCustomToken(user.id);
      }
    } catch (authErr) {
      console.error('Error creating custom token:', authErr);
    }

    // Refresh token
    const token = generateToken({ id: user.id, telegramId: user.telegramId, role: user.role });

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ user, firebaseCustomToken, token });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
  });

  // Cars API
  app.get('/api/cars', authenticateToken, async (req: AuthRequest, res) => {
    const cars = await firestore.collection('cars').all([{ type: 'where', field: 'userId', op: '==', value: req.user?.id }]);
    res.json({ cars: cars.map((c: any) => ({ ...c, photos: typeof c.photos === 'string' ? JSON.parse(c.photos || '[]') : (c.photos || []) })) });
  });

  app.post('/api/cars', authenticateToken, async (req: AuthRequest, res) => {
    const id = uuidv4();
    const data = req.body;
    const car = await firestore.collection('cars').set(id, { ...data, userId: req.user?.id });
    res.json({ car: { ...car, photos: typeof car.photos === 'string' ? JSON.parse(car.photos || '[]') : (car.photos || []) } });
  });

  // Requests API
  app.get('/api/requests', authenticateToken, async (req: AuthRequest, res) => {
    const requests = await firestore.collection('requests').all([{ type: 'where', field: 'userId', op: '==', value: req.user?.id }]);
    res.json({ requests: requests.map((r: any) => ({ ...r, photos: typeof r.photos === 'string' ? JSON.parse(r.photos || '[]') : (r.photos || []) })) });
  });

  app.post('/api/requests', authenticateToken, async (req: AuthRequest, res) => {
    const id = uuidv4();
    const data = req.body;
    const request = await firestore.collection('requests').set(id, { ...data, userId: req.user?.id });
    res.json({ request: { ...request, photos: typeof request.photos === 'string' ? JSON.parse(request.photos || '[]') : (request.photos || []) } });
  });

  // File Upload
  app.post('/api/upload', authenticateToken, upload.single('file'), (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });

  // Notifications
  app.get('/api/notifications', authenticateToken, async (req: AuthRequest, res) => {
    const notifications = await firestore.collection('notifications').all([
      { type: 'where', field: 'userId', op: '==', value: req.user?.id },
      { type: 'orderBy', field: 'createdAt', dir: 'desc' },
      { type: 'limit', limit: 50 }
    ]);
    res.json({ notifications });
  });

  app.post('/api/notifications', authenticateToken, async (req: AuthRequest, res) => {
    const id = uuidv4();
    const data = req.body;
    const notification = await firestore.collection('notifications').set(id, { ...data, userId: data.userId || req.user?.id });
    res.json(notification);
  });

  app.put('/api/notifications/:id', authenticateToken, async (req: AuthRequest, res) => {
    const { read } = req.body;
    await firestore.collection('notifications').update(req.params.id, { read: !!read });
    res.json({ success: true });
  });

  // Bot Webhook
  app.post('/api/bot/webhook', async (req, res) => {
    const bot = getBot();
    if (bot) {
      try {
        console.log('Webhook received update:', JSON.stringify(req.body));
        let handled = false;

        // Explicitly handle and await critical payment events before Vercel kills the function
        if (req.body.pre_checkout_query) {
          console.log('Webhook received pre_checkout_query, answering...');
          await bot.answerPreCheckoutQuery(req.body.pre_checkout_query.id, true);
          handled = true;
        }

        if (req.body.message) {
          const msg = req.body.message;
          const chatId = msg.chat?.id;

          if (msg.successful_payment) {
            console.log('Webhook received successful_payment, processing...');
            const { handleSuccessfulPayment: processPayment } = await import('../server/bot');
            await processPayment(chatId, msg.successful_payment);
            handled = true;
          } else if (msg.text) {
            if (msg.text.startsWith('/start')) {
              console.log('Webhook received /start command');
              const appUrl = 'https://sq-topaz.vercel.app/';
              await bot.sendMessage(chatId, 'Добро пожаловать в Squadra! 🏎️\n\nВаш автомобильный консьерж-сервис. Нажмите кнопку ниже, чтобы открыть приложение.', {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: 'Открыть приложение', web_app: { url: appUrl } }]
                  ]
                }
              });
              handled = true;
            } else if (msg.text.startsWith('/help')) {
              console.log('Webhook received /help command');
              await bot.sendMessage(chatId, 'Служба поддержки Squadra.\n\nЕсли у вас возникли вопросы, пожалуйста, свяжитесь с нашим администратором: @ttaammmo');
              handled = true;
            }
          }
        }

        // Process other updates normally only if not handled explicitly
        if (!handled) {
          bot.processUpdate(req.body);
        }
      } catch (err) {
        console.error('Error processing webhook update:', err);
      }
    }
    res.sendStatus(200);
  });

  // Settings
  app.get('/api/settings/:key', async (req, res) => {
    const setting = await firestore.collection('settings').get(req.params.key);
    res.json(setting ? JSON.parse(setting.value) : {});
  });

  app.put('/api/settings/:key', authenticateToken, isAdmin, async (req, res) => {
    const value = JSON.stringify(req.body);
    await firestore.collection('settings').set(req.params.key, { value });
    res.json({ success: true });
  });

  // Transactions
  app.get('/api/transactions', authenticateToken, async (req: AuthRequest, res) => {
    const transactions = await firestore.collection('transactions').all([
      { type: 'where', field: 'userId', op: '==', value: req.user?.id },
      { type: 'orderBy', field: 'createdAt', dir: 'desc' }
    ]);
    res.json({ transactions });
  });

  app.post('/api/transactions', authenticateToken, async (req: AuthRequest, res) => {
    const id = uuidv4();
    const data = req.body;
    const tx = await firestore.collection('transactions').set(id, { ...data, userId: req.user?.id, status: data.status || 'completed' });
    res.json(tx);
  });

  // Messages
  app.get('/api/messages', authenticateToken, async (req: AuthRequest, res) => {
    const { requestId } = req.query;
    const messages = await firestore.collection('messages').all([
      { type: 'where', field: 'requestId', op: '==', value: requestId },
      { type: 'orderBy', field: 'createdAt', dir: 'asc' }
    ]);
    res.json({ messages });
  });

  app.post('/api/messages', authenticateToken, async (req: AuthRequest, res) => {
    const id = uuidv4();
    const data = req.body;
    const msg = await firestore.collection('messages').set(id, { ...data, senderId: data.senderId || req.user?.id, type: data.type || 'text' });
    res.json(msg);
  });

  // Payments API
  app.post('/api/payments/bepaid/create', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { amount, type, description, pendingOrderId } = req.body;
      const userId = req.user?.id;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (amount === undefined || amount === null || isNaN(Number(amount))) {
        console.error('Invalid or missing amount in request:', amount);
        return res.status(400).json({ error: 'Invalid or missing amount' });
      }

      const numAmount = Number(amount);
      if (numAmount < 0) {
        console.error('Negative amount in request:', numAmount);
        return res.status(400).json({ error: 'Amount cannot be negative' });
      }

      // Payload must be < 128 bytes. Use compact keys.
      // u: userId, t: type, po: pendingOrderId, a: amount, tn: tariffName, q: quotas, bd: balanceDeduction
      const payloadObj: any = {
        u: userId,
        t: type,
        a: numAmount
      };

      if (pendingOrderId) payloadObj.po = pendingOrderId;
      if (req.body.tariffName) payloadObj.tn = req.body.tariffName;
      if (req.body.quotas) payloadObj.q = req.body.quotas;
      if (req.body.balanceDeduction) payloadObj.bd = req.body.balanceDeduction;

      // Store full payload in Firestore to avoid 128-byte limit
      const payloadId = uuidv4();
      await firestore.collection('payment_payloads').set(payloadId, {
        ...payloadObj,
        createdAt: new Date().toISOString()
      });

      console.log(`Creating invoice for user ${userId}, amount ${numAmount}, payloadId ${payloadId}, type ${type}`);

      const invoiceLink = await createInvoiceLink(
        type === 'service_order' ? 'Оплата услуги Squadra' :
          type === 'subscription' ? 'Оплата тарифа Squadra' :
            type === 'test_drive' ? 'Оплата тест-драйва' : 'Пополнение депозита',
        description || 'Оплата услуг консьерж-сервиса',
        payloadId,
        numAmount
      );

      console.log(`Invoice link result: ${invoiceLink}`);

      if (invoiceLink) {
        console.log('Invoice link created successfully:', invoiceLink);
        return res.json({ payment_url: invoiceLink, isNative: true });
      }

      console.warn('createInvoiceLink returned null, falling back to external bePaid URL');
      const token = process.env.VITE_BEPAID_TOKEN || process.env.BEPAID_TOKEN;
      console.log(`Using bePaid token: ${token ? 'present' : 'missing'}`);
      const payment_url = `https://checkout.bepaid.by/v2/checkout?token=${token || 'mock_token'}&amount=${Math.round(numAmount * 100)}&currency=BYN&description=${encodeURIComponent(description || 'Payment')}`;

      res.json({ payment_url, isNative: false });
    } catch (error: any) {
      console.error('Payment creation error details:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Recommendations
  app.get('/api/recommendations', authenticateToken, async (req: AuthRequest, res) => {
    const cars = await firestore.collection('cars').all([{ type: 'where', field: 'userId', op: '==', value: req.user?.id }]);
    const carIds = cars.map(c => c.id);

    if (carIds.length === 0) return res.json({ recommendations: [] });

    const allRecs = await firestore.collection('recommendations').all();
    const recommendations = allRecs.filter((r: any) => carIds.includes(r.carId));

    res.json({ recommendations });
  });

  app.post('/api/recommendations', authenticateToken, async (req: AuthRequest, res) => {
    const id = uuidv4();
    const data = req.body;
    const rec = await firestore.collection('recommendations').set(id, { ...data, status: data.status || 'pending' });
    res.json(rec);
  });

  // Admin Routes
  app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    const users = await firestore.collection('users').all();
    res.json({ users });
  });

  app.get('/api/admin/requests', authenticateToken, isAdmin, async (req, res) => {
    const requests = await firestore.collection('requests').all([{ type: 'orderBy', field: 'createdAt', dir: 'desc' }]);
    res.json({ requests: requests.map((r: any) => ({ ...r, photos: typeof r.photos === 'string' ? JSON.parse(r.photos || '[]') : (r.photos || []) })) });
  });

  app.get('/api/admin/transactions', authenticateToken, isAdmin, async (req, res) => {
    const transactions = await firestore.collection('transactions').all([{ type: 'orderBy', field: 'createdAt', dir: 'desc' }]);
    res.json({ transactions });
  });

  // Generic CRUD for Firestore
  app.get('/api/:collection', authenticateToken, async (req: AuthRequest, res) => {
    const { collection } = req.params;
    try {
      const items = await firestore.collection(collection).all();
      res.json({ [collection]: items });
    } catch (e) {
      res.status(400).json({ error: 'Database error' });
    }
  });

  app.post('/api/:collection', authenticateToken, async (req: AuthRequest, res) => {
    const { collection } = req.params;
    const data = req.body;
    const id = data.id || uuidv4();

    try {
      const created = await firestore.collection(collection).set(id, data);
      res.json(created);
    } catch (e) {
      res.status(400).json({ error: 'Failed to create item' });
    }
  });

  app.get('/api/:collection/:id', authenticateToken, async (req: AuthRequest, res) => {
    const { collection, id } = req.params;
    try {
      const item = await firestore.collection(collection).get(id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    } catch (e) {
      res.status(400).json({ error: 'Database error' });
    }
  });

  app.put('/api/:collection/:id', authenticateToken, async (req: AuthRequest, res) => {
    const { collection, id } = req.params;
    const data = req.body;

    try {
      const item = await firestore.collection(collection).get(id);
      if (!item) return res.status(404).json({ error: 'Not found' });

      if (item.userId && item.userId !== req.user?.id && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (collection === 'users' && id !== req.user?.id && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const updated = await firestore.collection(collection).update(id, data);
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: 'Failed to update item' });
    }
  });

  app.delete('/api/:collection/:id', authenticateToken, async (req: AuthRequest, res) => {
    const { collection, id } = req.params;
    try {
      const item = await firestore.collection(collection).get(id);
      if (!item) return res.status(404).json({ error: 'Not found' });

      if (item.userId && item.userId !== req.user?.id && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await firestore.collection(collection).delete(id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'Failed to delete item' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

const appPromise = startServer().catch(err => {
  console.error('CRITICAL: Server failed to start:', err);
  process.exit(1);
});

export default async (req: any, res: any) => {
  const app = await appPromise;
  if (app) {
    app(req, res);
  }
};
