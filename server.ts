import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { initBot, sendNotification, getBot } from './server/bot.js';
import { firestore } from './server/db.js';
import { generateToken, authenticateToken, AuthRequest, isAdmin } from './server/auth.js';

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
  // API ROUTES (LOCAL DATABASE)
  // ==========================================

  // Telegram Login
  app.post('/api/auth/telegram-login', async (req, res) => {
    try {
      const { initData } = req.body;
      if (!initData) return res.status(400).json({ error: 'Missing initData' });

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        console.error('TELEGRAM_BOT_TOKEN not set');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      const urlParams = new URLSearchParams(initData);
      const hash = urlParams.get('hash');
      urlParams.delete('hash');
      const dataCheckString = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      if (calculatedHash !== hash) {
        console.error('Telegram hash mismatch');
        return res.status(401).json({ error: 'Invalid Telegram data' });
      }

      const userStr = urlParams.get('user');
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

      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({ user });
    } catch (error: any) {
      console.error('Telegram login error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/auth/me', authenticateToken, async (req: AuthRequest, res) => {
    const user = await firestore.collection('users').get(req.user?.id!);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
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
  app.post('/api/bot/webhook', (req, res) => {
    const bot = getBot();
    if (bot) {
      bot.processUpdate(req.body);
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

  // Recommendations
  app.get('/api/recommendations', authenticateToken, async (req: AuthRequest, res) => {
    const cars = await firestore.collection('cars').all([{ type: 'where', field: 'userId', op: '==', value: req.user?.id }]);
    const carIds = cars.map(c => c.id);
    
    if (carIds.length === 0) return res.json({ recommendations: [] });
    
    // Firestore doesn't support 'IN' with many values easily in this helper, 
    // but we can fetch all and filter or do multiple queries.
    // For simplicity, let's fetch all recommendations and filter in memory if needed,
    // or just fetch by carId if we have few cars.
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

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
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
