import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { initBot, sendNotification, getBot, createInvoiceLink, handleSuccessfulPayment } from '../server/bot.js';
import { firestore, adminAuth, bucket } from '../server/db.js';
import { generateToken, authenticateToken, AuthRequest, isAdmin } from '../server/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure multer for memory storage (for Vercel compatibility)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

async function startServer() {
  console.log('Starting server initialization...');
  const app = express();
  const PORT = 3000;

  // Middlewares with increased limits for Base64 photos
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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
  // DIAGNOSTIC ENDPOINTS
  // ==========================================
  app.get('/api/status', async (req, res) => {
    const status: any = {
      timestamp: new Date().toISOString(),
      env: {
        node_version: process.version,
        has_bot_token: !!process.env.TELEGRAM_BOT_TOKEN,
        has_service_account: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        db_id: process.env.FIREBASE_DATABASE_ID || '(default)',
        project_id: 'unknown',
        squadra_url: !!process.env.SQUADRA_URL
      },
      firestore: 'checking...',
      auth: !!adminAuth,
      storage: !!bucket
    };

    try {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        status.env.project_id = sa.project_id;
      }
      
      // Test firestore write/read
      const testRef = firestore.collection('_system_health');
      const testId = 'last_check';
      await testRef.set(testId, { time: new Date().toISOString() });
      const verify = await testRef.get(testId);
      status.firestore = verify ? 'connected' : 'write_failed';
    } catch (e: any) {
      status.firestore = `error: ${e.message}`;
    }

    res.json(status);
  });

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
      const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

      if (!botToken) {
        console.error('[AUTH] TELEGRAM_BOT_TOKEN missing in ENV');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      // 1. Classical Telegram Verification (Manual parse is more stable for TG)
      const params: Record<string, string> = {};
      let receivedHash = '';
      
      const parts = String(initData).split('&');
      for (const part of parts) {
        const [key, ...valueParts] = part.split('=');
        const value = decodeURIComponent(valueParts.join('='));
        if (key === 'hash') {
          receivedHash = value;
        } else {
          params[key] = value;
        }
      }

      const dataCheckString = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      if (calculatedHash !== receivedHash) {
        console.warn('[AUTH] Hash mismatch. Received:', receivedHash, 'Calculated:', calculatedHash);
        return res.status(401).json({ error: 'Invalid Telegram authentication' });
      }

      // 2. Extract user data safely
      const userStr = params['user'];
      if (!userStr) return res.status(400).json({ error: 'Missing user data' });
      
      const tgUser = JSON.parse(userStr);
      const tgIdStr = tgUser.id.toString();

      // 3. Find or Create user in Firestore
      console.log(`[AUTH] Checking user existence for TG ID: ${tgIdStr}`);
      let userData = null;
      
      const userQuery = await firestore.collection('users').all([
        { type: 'where', field: 'telegramId', op: '==', value: tgIdStr }
      ]);
      
      if (userQuery && userQuery.length > 0) {
        userData = userQuery[0];
        console.log(`[AUTH] Existing user found: ${userData.id}`);
        // Update user profile info
        userData = await firestore.collection('users').set(userData.id, {
          username: tgUser.username || userData.username || '',
          firstName: tgUser.first_name || userData.firstName || '',
          lastName: tgUser.last_name || userData.lastName || '',
          photoUrl: tgUser.photo_url || userData.photoUrl || ''
        });
      } else {
        console.log(`[AUTH] Creating NEW user for TG ID: ${tgIdStr}`);
        const newId = uuidv4();
        // Default role based on specific TG account or client
        const role = (tgUser.username?.toLowerCase() === 'ttaammmo' || tgIdStr === '123456789') ? 'admin' : 'client';
        
        userData = await firestore.collection('users').set(newId, {
          telegramId: tgIdStr,
          username: tgUser.username || '',
          firstName: tgUser.first_name || '',
          lastName: tgUser.last_name || '',
          photoUrl: tgUser.photo_url || '',
          role,
          createdAt: new Date().toISOString()
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

  // ==========================================
  // DEBUG / TESTING AUTH (DEVELOPMENT ONLY)
  // ==========================================
  
  // Setup standard test accounts for 3 testers
  app.post('/api/auth/setup-test-accounts', async (req, res) => {
    try {
      const testers = [
        { id: 'tester1', name: 'Иван' },
        { id: 'tester2', name: 'Виталий' },
        { id: 'tester3', name: 'Александр' }
      ];
      const roles = ['admin', 'pilot', 'client'];
      const results = [];

      for (const tester of testers) {
        for (const role of roles) {
          const testId = `${tester.id}_${role}`.toLowerCase();
          
          const userData = {
            id: testId,
            telegramId: `test_${testId}`,
            username: testId,
            firstName: tester.name,
            lastName: role.toUpperCase(),
            photoUrl: '',
            role,
            createdAt: new Date().toISOString(),
            isTestAccount: true
          };
          
          await firestore.collection('users').set(testId, userData);
          results.push({ id: testId, status: 'updated' });
        }
      }
      res.json({ success: true, accounts: results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Direct login as any user (for testing)
  app.post('/api/auth/debug-login', async (req, res) => {
    try {
      const { userId } = req.body;

      const userData = await firestore.collection('users').get(userId);
      if (!userData) {
        return res.status(404).json({ error: 'User not found' });
      }

      const token = generateToken({ 
        id: userData.id, 
        telegramId: userData.telegramId, 
        role: userData.role 
      });

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
      res.status(500).json({ error: error.message });
    }
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




  // Unified File Upload Handler for /api/upload and /api/upload-proxy
  const handleUpload = async (req: any, res: any) => {
    console.log(`[UPLOAD] Request to ${req.path} received. Body keys:`, Object.keys(req.body || {}));
    try {
      let fileBuffer: Buffer;
      let mimetype: string;
      let originalName: string;

      if (req.file) {
        console.log('[UPLOAD] Detected multipart/form-data file');
        fileBuffer = req.file.buffer;
        mimetype = req.file.mimetype;
        originalName = req.file.originalname;
      } else if (req.body.base64Data) {
        console.log('[UPLOAD] Detected base64Data in body');
        const base64String = req.body.base64Data;
        
        // Handle potential data URL format or raw base64
        const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        
        if (matches && matches.length === 3) {
          mimetype = matches[1];
          fileBuffer = Buffer.from(matches[2], 'base64');
        } else {
          // Assume raw base64 if no matches, use generic mimetype
          mimetype = 'image/jpeg';
          fileBuffer = Buffer.from(base64String, 'base64');
        }
        
        originalName = req.body.fileName ? path.basename(req.body.fileName) : `upload_${Date.now()}.jpg`;
        console.log(`[UPLOAD] Decoded base64: ${mimetype}, size: ${fileBuffer.length}`);
      } else {
        console.error('[UPLOAD] No file or base64Data found');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!bucket) {
        console.error('[UPLOAD] Firebase Bucket is NULL');
        return res.status(500).json({ error: 'Storage not initialized' });
      }

      // Use fileName from body if provided (for upload-proxy consistency)
      const fileName = req.body.fileName || `uploads/${Date.now()}-${originalName}`;
      const blob = bucket.file(fileName);
      console.log(`[UPLOAD] Saving to bucket: ${bucket.name}, path: ${fileName}`);

      await blob.save(fileBuffer, {
        metadata: { contentType: mimetype },
        resumable: false
      });
      console.log('[UPLOAD] Blob saved successfully');

      // Attempt to get signed URL
      try {
        const [signedUrl] = await blob.getSignedUrl({
          action: 'read',
          expires: '01-01-2099'
        });
        console.log('[UPLOAD] Signed URL generated successfully');
        return res.json({ url: signedUrl });
      } catch (urlErr: any) {
        console.warn('[UPLOAD] Signed URL failed, using public fallback:', urlErr.message);
        // Fallback to official public URL format
        const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
        return res.json({ url: publicUrl });
      }

    } catch (e: any) {
      console.error('[UPLOAD] CRITICAL ERROR:', e);
      res.status(500).json({ 
        url: null,
        error: e.message || 'File upload failed',
        details: e.toString()
      });
    }
  };

  app.post('/api/upload', authenticateToken, upload.single('file'), handleUpload);
  app.post('/api/upload-proxy', authenticateToken, upload.single('file'), handleUpload);

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

  // Send direct Telegram notification
  app.post('/api/notifications/send', authenticateToken, async (req, res) => {
    try {
      const { telegramId, message, options } = req.body;
      if (!telegramId || !message) {
        return res.status(400).json({ error: 'Missing telegramId or message' });
      }
      
      console.log(`[NOTIFY] Sending Telegram message to ${telegramId}`);
      const success = await sendNotification(telegramId.toString(), message, options || {});
      
      if (success) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: 'Failed to send Telegram notification' });
      }
    } catch (e: any) {
      console.error('[NOTIFY] Error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // SOS System Endpoints (bypass client rules)
  app.post('/api/sos/trigger', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const id = uuidv4();
      const alert = {
        id,
        pilotId: req.user?.id,
        status: 'active',
        createdAt: new Date().toISOString()
      };
      
      await firestore.collection('sos_alerts').set(id, alert);
      
      // Notify admins via Bot
      const admins = await firestore.collection('users').all([{type: 'where', field: 'role', op: '==', value: 'admin'}]);
      for (const admin of admins) {
        if (admin.telegramId) {
          await sendNotification(admin.telegramId.toString(), `🚨 ВНИМАНИЕ: СИГНАЛ SOS 🚨\n\nПилот: ${req.user?.id}\n\nТребуется срочная помощь!`);
        }
      }
      
      res.json(alert);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/sos/resolve', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { alertId } = req.body;
      await firestore.collection('sos_alerts').update(alertId, {
        status: 'resolved',
        resolvedAt: new Date().toISOString()
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
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
            await handleSuccessfulPayment(chatId, msg.successful_payment);
            handled = true;
          } else if (msg.text) {
            if (msg.text.startsWith('/start')) {
              console.log('Webhook received /start command');
              // Priority: Header host > Environment SQUADRA_URL
              const host = req.headers.host;
              const protocol = req.headers['x-forwarded-proto'] || 'https';
              const appUrl = host ? `${protocol}://${host}/` : (process.env.SQUADRA_URL || '');
              
              if (!appUrl) {
                console.error('No host header and no SQUADRA_URL set. Cannot send link.');
                return;
              }

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

  app.get('/api/admin/cars', authenticateToken, isAdmin, async (req, res) => {
    const cars = await firestore.collection('cars').all();
    res.json({ cars: cars.map((c: any) => ({ ...c, photos: typeof c.photos === 'string' ? JSON.parse(c.photos || '[]') : (c.photos || []) })) });
  });

  app.get('/api/admin/requests', authenticateToken, isAdmin, async (req, res) => {
    const requests = await firestore.collection('requests').all([{ type: 'orderBy', field: 'createdAt', dir: 'desc' }]);
    res.json({ requests: requests.map((r: any) => ({ ...r, photos: typeof r.photos === 'string' ? JSON.parse(r.photos || '[]') : (r.photos || []) })) });
  });

  app.get('/api/admin/transactions', authenticateToken, isAdmin, async (req, res) => {
    const transactions = await firestore.collection('transactions').all([{ type: 'orderBy', field: 'createdAt', dir: 'desc' }]);
    res.json({ transactions });
  });

  app.post('/api/admin/broadcast', authenticateToken, isAdmin, async (req, res) => {
    const { title, body, type, target } = req.body;
    
    try {
      let users: any[] = [];
      if (target === 'all') {
        users = await firestore.collection('users').all();
      } else if (target === 'pilots') {
        users = await firestore.collection('users').all([{ type: 'where', field: 'role', op: '==', value: 'pilot' }]);
      } else if (target === 'clients') {
        users = await firestore.collection('users').all([{ type: 'where', field: 'role', op: '==', value: 'client' }]);
      }

      const sentBy = (req as any).user?.username || 'Admin';
      const sentAt = new Date().toISOString();

      // Create notifications for each user
      const promises = users.map(u => 
        firestore.collection('notifications').set(uuidv4(), {
          userId: u.id,
          title,
          body,
          type,
          link: '/notifications',
          read: false,
          createdAt: sentAt
        })
      );

      await Promise.all(promises);

      // Save to history
      await firestore.collection('broadcasts').set(uuidv4(), {
        title, body, type, target, sentAt, sentBy,
        count: users.length
      });

      res.json({ success: true, count: users.length });
    } catch (e) {
      console.error('Broadcast failed:', e);
      res.status(500).json({ error: 'Broadcast failed' });
    }
  });

  // User Profile
  app.put('/api/users/profile', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { firstName, lastName, phone, tariff } = req.body;
      const updated = await firestore.collection('users').update(req.user?.id!, {
        firstName, lastName, phone, tariff,
        updatedAt: new Date().toISOString()
      });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Filtered SOS Alerts for Admin
  app.get('/api/sos_alerts', authenticateToken, async (req: AuthRequest, res) => {
    try {
      // If admin, show only active ones (or all but mostly we want active for the dash)
      const alerts = await firestore.collection('sos_alerts').all([
        { type: 'where', field: 'status', op: '==', value: 'active' },
        { type: 'orderBy', field: 'createdAt', dir: 'desc' }
      ]);
      res.json({ sos_alerts: alerts });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Cars with VIN and TechPassport
  app.post('/api/cars', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const id = uuidv4();
      const carData = {
        ...req.body,
        id,
        userId: req.user?.id,
        createdAt: new Date().toISOString()
      };
      const created = await firestore.collection('cars').set(id, carData);
      res.json(created);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Specialized Request Creation (Handles Quotas & Balance safer on backend)
  app.post('/api/requests', authenticateToken, async (req: AuthRequest, res) => {
    try {
      const id = uuidv4();
      const { 
        useQuota, 
        serviceType, 
        totalPrice, 
        balanceDeduction,
        ...rest 
      } = req.body;
      const userId = req.user?.id;

      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      // 1. If using quota or balance, process it here
      if (useQuota || (balanceDeduction && balanceDeduction > 0)) {
        const userDoc = await firestore.collection('users').get(userId);
        if (!userDoc) return res.status(404).json({ error: 'User not found' });
        const userData = userDoc;

        // 1a. Process Quota
        if (useQuota) {
          const limits = userData?.limits || {};
          const quotas = userData?.quotas || {};
          const usedQuotas = userData?.usedQuotas || {};
          const updateData: any = {};

          if (limits[serviceType] > 0) {
            updateData[`limits.${serviceType}`] = limits[serviceType] - 1;
            updateData[`usedQuotas.${serviceType}`] = (usedQuotas[serviceType] || 0) + 1;
          } else if (quotas[serviceType] > 0) {
            updateData[`quotas.${serviceType}`] = quotas[serviceType] - 1;
            updateData[`usedQuotas.${serviceType}`] = (usedQuotas[serviceType] || 0) + 1;
          } else {
            return res.status(400).json({ error: 'No quotas available' });
          }

          if (Object.keys(updateData).length > 0) {
            await firestore.collection('users').update(userId, updateData);
          }
        }

        // 1b. Process Balance Deduction
        if (balanceDeduction && balanceDeduction > 0) {
          await firestore.collection('transactions').set(uuidv4(), {
            userId,
            type: 'deposit_deduction',
            amount: balanceDeduction,
            description: `Оплата услуги "${serviceType}"`,
            createdAt: new Date().toISOString(),
            status: 'completed'
          });
        }
      }

      // 2. Create the actual request
      const taskData = {
        ...rest,
        id,
        userId,
        serviceType,
        totalPrice: useQuota ? 0 : totalPrice,
        createdAt: new Date().toISOString(),
        status: 'pending'
      };

      await firestore.collection('requests').set(id, taskData);
      res.json(taskData);
    } catch (e: any) {
      console.error('[API] Create Request Error:', e);
      res.status(500).json({ error: e.message });
    }
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

      if (collection === 'requests') {
        const isOwner = item.userId === req.user?.id;
        const isAssignedPilot = item.pilotId === req.user?.id;
        const isAdmin = req.user?.role === 'admin';
        
        if (!isOwner && !isAssignedPilot && !isAdmin) {
          return res.status(403).json({ error: 'Forbidden: You are not assigned to this task' });
        }
      } else {
        if (item.userId && item.userId !== req.user?.id && req.user?.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (collection === 'users' && id !== req.user?.id && req.user?.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
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
