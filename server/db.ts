import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

let db: any = null;
export let adminAuth: any = null;
export let bucket: any = null;

/**
 * Robustly initializes Firebase Admin.
 * Handles escaped newlines, extra quotes, and serverless cold starts.
 */
function ensureInit() {
  if (db && adminAuth) return;

  console.log('[Firebase Init] Attempting to initialize Firebase Admin...');

  try {
    const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (!rawEnv || rawEnv === 'undefined') {
      console.error('[Firebase Init] CRITICAL: FIREBASE_SERVICE_ACCOUNT_KEY is missing or "undefined".');
      return;
    }

    console.log(`[Firebase Init] Key length: ${rawEnv.length} chars. First 10 chars: "${rawEnv.substring(0, 10)}..."`);

    // NUCLEAR CLEANING:
    // Some hosting environments insert literal \n or \r or \t that break JSON.parse.
    // We replace real control characters with spaces (JSON likes spaces, not raw newlines).
    // Note: this won't break "\n" (escaped), but will fix "
    // " (unescaped newline in string literal).
    let cleaned = rawEnv.replace(/[\n\r\t]/g, ' ').trim();
    
    // Remove wrapping quotes if Vercel dashboard added them
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }
    
    // Ensure all internal escaped \n are preserved if and only if they are true backslashes
    cleaned = cleaned.replace(/\\\\n/g, '\\n');

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(cleaned);
      console.log(`[Firebase Init] JSON parsed successfully. Project ID: ${serviceAccount.project_id}`);
    } catch (parseError: any) {
      console.error(`[Firebase Init] JSON Parse Error: ${parseError.message}`);
      console.error(`[Firebase Init] Cleaned string preview: ${cleaned.substring(0, 50)}...`);
      return;
    }

    const apps = getApps();
    let app;

    if (!apps.length) {
      app = initializeApp({
        credential: cert(serviceAccount),
        storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
      });
      console.log('[Firebase Init] New app initialized.');
    } else {
      app = apps[0];
      console.log('[Firebase Init] Reusing existing app.');
    }

    adminAuth = getAuth(app);
    bucket = getStorage(app).bucket();
    
    const dbId = process.env.FIREBASE_DATABASE_ID || undefined;
    db = getFirestore(app, dbId);
    
    console.log(`[Firebase Init] Firestore initialized (DB ID: ${dbId || '(default)'}).`);
  } catch (err: any) {
    console.error('[Firebase Init] General Error during initialization:', err.message);
    console.error(err.stack);
  }
}

// Lazy-loader for Firestore
function getDb() {
  ensureInit();
  if (!db) {
    throw new Error('Database not initialized. Check server logs for [Firebase Init] errors.');
  }
  return db;
}

// Helper to convert Firestore data to plain objects
const toData = (doc: any) => {
  if (!doc.exists) return null;
  const data = doc.data();
  // Convert Timestamps to ISO strings for JSON compatibility
  Object.keys(data).forEach(key => {
    if (data[key] instanceof Timestamp) {
      data[key] = data[key].toDate().toISOString();
    }
  });
  return { id: doc.id, ...data };
};

export const firestore = {
  collection: (path: string) => {
    return {
      get: async (id: string) => {
        const docRef = getDb().collection(path).doc(id);
        const snap = await docRef.get();
        return toData(snap);
      },
      all: async (constraints: any[] = []) => {
        let q: any = getDb().collection(path);
        for (const c of constraints) {
          if (c.type === 'where') q = q.where(c.field, c.op, c.value);
          if (c.type === 'orderBy') q = q.orderBy(c.field, c.dir);
          if (c.type === 'limit') q = q.limit(c.limit);
        }
        const snap = await q.get();
        return snap.docs.map(toData);
      },
      add: async (data: any) => {
        const docRef = await getDb().collection(path).add({ ...data, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
        const snap = await docRef.get();
        return toData(snap);
      },
      set: async (id: string, data: any) => {
        const docRef = getDb().collection(path).doc(id);
        await docRef.set({ ...data, updatedAt: Timestamp.now() }, { merge: true });
        const snap = await docRef.get();
        return toData(snap);
      },
      update: async (id: string, data: any) => {
        const docRef = getDb().collection(path).doc(id);
        await docRef.update({ ...data, updatedAt: Timestamp.now() });
        const snap = await docRef.get();
        return toData(snap);
      },
      delete: async (id: string) => {
        const docRef = getDb().collection(path).doc(id);
        await docRef.delete();
      }
    };
  }
};

export default getDb;
