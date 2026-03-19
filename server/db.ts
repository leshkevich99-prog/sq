import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'app.db');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    telegramId TEXT UNIQUE,
    username TEXT,
    firstName TEXT,
    lastName TEXT,
    photoUrl TEXT,
    role TEXT DEFAULT 'client',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cars (
    id TEXT PRIMARY KEY,
    userId TEXT,
    brand TEXT,
    model TEXT,
    year INTEGER,
    vin TEXT,
    plateNumber TEXT,
    color TEXT,
    mileage INTEGER,
    engineType TEXT,
    engineVolume TEXT,
    transmission TEXT,
    driveType TEXT,
    notes TEXT,
    photos TEXT, -- JSON array
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    userId TEXT,
    carId TEXT,
    type TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    scheduledDate TEXT,
    estimatedCost REAL,
    actualCost REAL,
    notes TEXT,
    photos TEXT, -- JSON array
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(carId) REFERENCES cars(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    userId TEXT,
    title TEXT,
    message TEXT,
    type TEXT,
    read INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    userId TEXT,
    amount REAL,
    type TEXT,
    description TEXT,
    status TEXT DEFAULT 'completed',
    requestId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    requestId TEXT,
    text TEXT,
    type TEXT DEFAULT 'text',
    senderId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(requestId) REFERENCES requests(id)
  );

  CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    carId TEXT,
    title TEXT,
    description TEXT,
    type TEXT,
    priority TEXT,
    status TEXT DEFAULT 'pending',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(carId) REFERENCES cars(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

export default db;
