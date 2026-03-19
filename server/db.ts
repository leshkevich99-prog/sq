import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, addDoc, Timestamp } from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../firebase-applet-config.json'), 'utf-8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Helper to convert Firestore data to plain objects
const toData = (doc: any) => {
  if (!doc.exists()) return null;
  const data = doc.data();
  // Convert Timestamps to ISO strings for compatibility with SQLite-based code
  Object.keys(data).forEach(key => {
    if (data[key] instanceof Timestamp) {
      data[key] = data[key].toDate().toISOString();
    }
  });
  return { id: doc.id, ...data };
};

export const firestore = {
  collection: (path: string) => {
    const colRef = collection(db, path);
    return {
      get: async (id: string) => {
        const docRef = doc(db, path, id);
        const snap = await getDoc(docRef);
        return toData(snap);
      },
      all: async (constraints: any[] = []) => {
        let q = query(colRef);
        // Basic constraints handling
        for (const c of constraints) {
          if (c.type === 'where') q = query(q, where(c.field, c.op, c.value));
          if (c.type === 'orderBy') q = query(q, orderBy(c.field, c.dir));
          if (c.type === 'limit') q = query(q, limit(c.limit));
        }
        const snap = await getDocs(q);
        return snap.docs.map(toData);
      },
      add: async (data: any) => {
        const docRef = await addDoc(colRef, { ...data, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
        const snap = await getDoc(docRef);
        return toData(snap);
      },
      set: async (id: string, data: any) => {
        const docRef = doc(db, path, id);
        await setDoc(docRef, { ...data, updatedAt: Timestamp.now() }, { merge: true });
        const snap = await getDoc(docRef);
        return toData(snap);
      },
      update: async (id: string, data: any) => {
        const docRef = doc(db, path, id);
        await updateDoc(docRef, { ...data, updatedAt: Timestamp.now() });
        const snap = await getDoc(docRef);
        return toData(snap);
      },
      delete: async (id: string) => {
        const docRef = doc(db, path, id);
        await deleteDoc(docRef);
      }
    };
  }
};

export default db;
