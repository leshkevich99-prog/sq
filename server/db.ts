import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

let db: any = null;

if (!getApps().length) {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (envJson && envJson !== 'undefined') {
    try {
      const serviceAccount = JSON.parse(envJson);
      initializeApp({
        credential: cert(serviceAccount)
      });
      db = getFirestore();
    } catch (error) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', error);
    }
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT_KEY is missing or undefined.');
  }
} else {
  db = getFirestore();
}

// Helper to convert Firestore data to plain objects
const toData = (doc: any) => {
  if (!doc.exists) return null;
  const data = doc.data();
  // Convert Timestamps to ISO strings
  Object.keys(data).forEach(key => {
    if (data[key] instanceof Timestamp) {
      data[key] = data[key].toDate().toISOString();
    }
  });
  return { id: doc.id, ...data };
};

export const firestore = {
  collection: (path: string) => {
    if (!db) {
      throw new Error('Database not initialized. Missing or invalid FIREBASE_SERVICE_ACCOUNT_KEY.');
    }
    const colRef = db.collection(path);
    return {
      get: async (id: string) => {
        const docRef = colRef.doc(id);
        const snap = await docRef.get();
        return toData(snap);
      },
      all: async (constraints: any[] = []) => {
        let q: any = colRef;
        // Basic constraints handling
        for (const c of constraints) {
          if (c.type === 'where') q = q.where(c.field, c.op, c.value);
          if (c.type === 'orderBy') q = q.orderBy(c.field, c.dir);
          if (c.type === 'limit') q = q.limit(c.limit);
        }
        const snap = await q.get();
        return snap.docs.map(toData);
      },
      add: async (data: any) => {
        const docRef = await colRef.add({ ...data, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
        const snap = await docRef.get();
        return toData(snap);
      },
      set: async (id: string, data: any) => {
        const docRef = colRef.doc(id);
        await docRef.set({ ...data, updatedAt: Timestamp.now() }, { merge: true });
        const snap = await docRef.get();
        return toData(snap);
      },
      update: async (id: string, data: any) => {
        const docRef = colRef.doc(id);
        await docRef.update({ ...data, updatedAt: Timestamp.now() });
        const snap = await docRef.get();
        return toData(snap);
      },
      delete: async (id: string) => {
        const docRef = colRef.doc(id);
        await docRef.delete();
      }
    };
  }
};

export default db;
