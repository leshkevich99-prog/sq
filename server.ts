import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { initBot, sendNotification, getBot } from './server/bot.js';
import db from './server/db.js';
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

      // Check if user exists in local DB
      let user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(tgUser.id.toString()) as any;

      if (!user) {
        const id = uuidv4();
        // Default admin check
        const role = (tgUser.username?.toLowerCase() === 'ttaammmo' || tgUser.id.toString() === '123456789') ? 'admin' : 'client';
        db.prepare(`
          INSERT INTO users (id, telegramId, username, firstName, lastName, photoUrl, role)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, tgUser.id.toString(), tgUser.username || '', tgUser.first_name || '', tgUser.last_name || '', tgUser.photo_url || '', role);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      } else {
        db.prepare(`
          UPDATE users SET username = ?, firstName = ?, lastName = ?, photoUrl = ?, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(tgUser.username || '', tgUser.first_name || '', tgUser.last_name || '', tgUser.photo_url || '', user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }

      const token = generateToken({ id: user.id, telegramId: user.telegramId, role: user.role });

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

  app.get('/api/auth/me', authenticateToken, (req: AuthRequest, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user?.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
  });

  // Cars API
  app.get('/api/cars', authenticateToken, (req: AuthRequest, res) => {
    const cars = db.prepare('SELECT * FROM cars WHERE userId = ?').all(req.user?.id);
    res.json({ cars: cars.map((c: any) => ({ ...c, photos: JSON.parse(c.photos || '[]') })) });
  });

  app.post('/api/cars', authenticateToken, (req: AuthRequest, res) => {
    const id = uuidv4();
    const { brand, model, year, vin, plateNumber, color, mileage, engineType, engineVolume, transmission, driveType, notes, photos } = req.body;
    db.prepare(`
      INSERT INTO cars (id, userId, brand, model, year, vin, plateNumber, color, mileage, engineType, engineVolume, transmission, driveType, notes, photos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user?.id, brand, model, year, vin, plateNumber, color, mileage, engineType, engineVolume, transmission, driveType, notes, JSON.stringify(photos || []));
    const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(id) as any;
    res.json({ car: { ...car, photos: JSON.parse(car.photos || '[]') } });
  });

  // Requests API
  app.get('/api/requests', authenticateToken, (req: AuthRequest, res) => {
    const requests = db.prepare('SELECT * FROM requests WHERE userId = ?').all(req.user?.id);
    res.json({ requests: requests.map((r: any) => ({ ...r, photos: JSON.parse(r.photos || '[]') })) });
  });

  app.post('/api/requests', authenticateToken, (req: AuthRequest, res) => {
    const id = uuidv4();
    const { carId, type, description, priority, scheduledDate, photos } = req.body;
    db.prepare(`
      INSERT INTO requests (id, userId, carId, type, description, priority, scheduledDate, photos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user?.id, carId, type, description, priority, scheduledDate, JSON.stringify(photos || []));
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
    res.json({ request: { ...request, photos: JSON.parse(request.photos || '[]') } });
  });

  // File Upload
  app.post('/api/upload', authenticateToken, upload.single('file'), (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });

  // Notifications
  app.get('/api/notifications', authenticateToken, (req: AuthRequest, res) => {
    const notifications = db.prepare('SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 50').all(req.user?.id);
    res.json({ notifications });
  });

  app.post('/api/notifications', authenticateToken, (req: AuthRequest, res) => {
    const id = uuidv4();
    const { userId, title, message, type, link } = req.body;
    db.prepare(`
      INSERT INTO notifications (id, userId, title, message, type, link)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId || req.user?.id, title, message, type || 'info', link || null);
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    res.json(notification);
  });

  app.put('/api/notifications/:id', authenticateToken, (req: AuthRequest, res) => {
    const { read } = req.body;
    db.prepare('UPDATE notifications SET read = ? WHERE id = ? AND userId = ?').run(read ? 1 : 0, req.params.id, req.user?.id);
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
  app.get('/api/settings/:key', (req, res) => {
    const setting = db.prepare('SELECT * FROM settings WHERE key = ?').get(req.params.key) as any;
    res.json(setting ? JSON.parse(setting.value) : {});
  });

  app.put('/api/settings/:key', authenticateToken, isAdmin, (req, res) => {
    const value = JSON.stringify(req.body);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(req.params.key, value);
    res.json({ success: true });
  });

  // Transactions
  app.get('/api/transactions', authenticateToken, (req: AuthRequest, res) => {
    const transactions = db.prepare('SELECT * FROM transactions WHERE userId = ? ORDER BY createdAt DESC').all(req.user?.id);
    res.json({ transactions });
  });

  app.post('/api/transactions', authenticateToken, (req: AuthRequest, res) => {
    const id = uuidv4();
    const { amount, type, description, status, requestId } = req.body;
    db.prepare(`
      INSERT INTO transactions (id, userId, amount, type, description, status, requestId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user?.id, amount, type, description, status || 'completed', requestId);
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    res.json(tx);
  });

  // Messages
  app.get('/api/messages', authenticateToken, (req: AuthRequest, res) => {
    const { requestId } = req.query;
    const messages = db.prepare('SELECT * FROM messages WHERE requestId = ? ORDER BY createdAt ASC').all(requestId);
    res.json({ messages });
  });

  app.post('/api/messages', authenticateToken, (req: AuthRequest, res) => {
    const id = uuidv4();
    const { requestId, text, type, senderId } = req.body;
    db.prepare(`
      INSERT INTO messages (id, requestId, text, type, senderId)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, requestId, text, type || 'text', senderId || req.user?.id);
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    res.json(msg);
  });

  // Recommendations
  app.get('/api/recommendations', authenticateToken, (req: AuthRequest, res) => {
    const recommendations = db.prepare('SELECT * FROM recommendations WHERE carId IN (SELECT id FROM cars WHERE userId = ?)').all(req.user?.id);
    res.json({ recommendations });
  });

  app.post('/api/recommendations', authenticateToken, (req: AuthRequest, res) => {
    const id = uuidv4();
    const { carId, title, description, type, priority, status } = req.body;
    db.prepare(`
      INSERT INTO recommendations (id, carId, title, description, type, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, carId, title, description, type, priority, status || 'pending');
    const rec = db.prepare('SELECT * FROM recommendations WHERE id = ?').get(id);
    res.json(rec);
  });

  // Admin Routes
  app.get('/api/admin/users', authenticateToken, isAdmin, (req, res) => {
    const users = db.prepare('SELECT * FROM users').all();
    res.json({ users });
  });

  app.get('/api/admin/requests', authenticateToken, isAdmin, (req, res) => {
    const requests = db.prepare(`
      SELECT r.*, u.username, u.firstName, u.lastName, c.brand, c.model, c.plateNumber
      FROM requests r
      JOIN users u ON r.userId = u.id
      JOIN cars c ON r.carId = c.id
      ORDER BY r.createdAt DESC
    `).all();
    res.json({ requests: requests.map((r: any) => ({ ...r, photos: JSON.parse(r.photos || '[]') })) });
  });

  app.get('/api/admin/transactions', authenticateToken, isAdmin, (req, res) => {
    const transactions = db.prepare(`
      SELECT t.*, u.username, u.firstName, u.lastName
      FROM transactions t
      JOIN users u ON t.userId = u.id
      ORDER BY t.createdAt DESC
    `).all();
    res.json({ transactions });
  });

  // Generic CRUD for mocked Firestore
  app.get('/api/:collection', authenticateToken, (req: AuthRequest, res) => {
    const { collection } = req.params;
    try {
      // Basic validation of collection name to prevent SQL injection
      if (!/^[a-z_]+$/.test(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
      }
      const items = db.prepare(`SELECT * FROM ${collection}`).all();
      res.json({ [collection]: items });
    } catch (e) {
      res.status(400).json({ error: 'Invalid collection or database error' });
    }
  });

  app.post('/api/:collection', authenticateToken, (req: AuthRequest, res) => {
    const { collection } = req.params;
    const data = req.body;
    const id = data.id || uuidv4();
    
    try {
      if (!/^[a-z_]+$/.test(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
      }

      // Get table info to filter keys
      const tableInfo = db.prepare(`PRAGMA table_info(${collection})`).all() as any[];
      const validColumns = tableInfo.map(c => c.name);
      
      const keys = Object.keys(data).filter(k => k !== 'id' && validColumns.includes(k));
      const columns = ['id', ...keys].join(', ');
      const placeholders = ['?', ...keys.map(() => '?')].join(', ');
      const values = [id, ...keys.map(k => typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k])];

      db.prepare(`INSERT INTO ${collection} (${columns}) VALUES (${placeholders})`).run(...values);
      const created = db.prepare(`SELECT * FROM ${collection} WHERE id = ?`).get(id);
      res.json(created);
    } catch (e) {
      console.error(`Error creating item in ${collection}:`, e);
      res.status(400).json({ error: 'Failed to create item' });
    }
  });

  app.get('/api/:collection/:id', authenticateToken, (req: AuthRequest, res) => {
    const { collection, id } = req.params;
    try {
      if (!/^[a-z_]+$/.test(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
      }
      const item = db.prepare(`SELECT * FROM ${collection} WHERE id = ?`).get(id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    } catch (e) {
      res.status(400).json({ error: 'Invalid collection or database error' });
    }
  });

  app.put('/api/:collection/:id', authenticateToken, (req: AuthRequest, res) => {
    const { collection, id } = req.params;
    const data = req.body;
    
    try {
      if (!/^[a-z_]+$/.test(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
      }

      // Check if user is allowed to update this item
      const item = db.prepare(`SELECT * FROM ${collection} WHERE id = ?`).get(id) as any;
      if (!item) return res.status(404).json({ error: 'Not found' });
      
      // Basic security: only owner or admin can update
      if (item.userId && item.userId !== req.user?.id && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (collection === 'users' && id !== req.user?.id && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Get table info to filter keys
      const tableInfo = db.prepare(`PRAGMA table_info(${collection})`).all() as any[];
      const validColumns = tableInfo.map(c => c.name);

      const keys = Object.keys(data).filter(k => 
        k !== 'id' && 
        k !== 'createdAt' && 
        k !== 'updatedAt' && 
        validColumns.includes(k)
      );
      
      if (keys.length === 0) {
        return res.json(item);
      }

      const sets = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k]);
      
      db.prepare(`UPDATE ${collection} SET ${sets}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, id);
      const updated = db.prepare(`SELECT * FROM ${collection} WHERE id = ?`).get(id);
      res.json(updated);
    } catch (e) {
      console.error(`Error updating item in ${collection}:`, e);
      res.status(400).json({ error: 'Failed to update item' });
    }
  });

  app.delete('/api/:collection/:id', authenticateToken, (req: AuthRequest, res) => {
    const { collection, id } = req.params;
    try {
      if (!/^[a-z_]+$/.test(collection)) {
        return res.status(400).json({ error: 'Invalid collection name' });
      }
      
      // Check if user is allowed to delete this item
      const item = db.prepare(`SELECT * FROM ${collection} WHERE id = ?`).get(id) as any;
      if (!item) return res.status(404).json({ error: 'Not found' });
      
      if (item.userId && item.userId !== req.user?.id && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      db.prepare(`DELETE FROM ${collection} WHERE id = ?`).run(id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'Failed to delete item' });
    }
  });

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

startServer().catch(err => {
  console.error('CRITICAL: Server failed to start:', err);
  process.exit(1);
});
