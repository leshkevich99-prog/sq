import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, query, where, orderBy, limit, getDocs, getDoc, addDoc, updateDoc, setDoc, deleteDoc, deleteField, arrayUnion, writeBatch, onSnapshot, Timestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage, ref, uploadBytes, uploadBytesResumable, uploadString, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

export { 
  collection, doc, query, where, orderBy, limit, getDocs, getDoc, addDoc, updateDoc, setDoc, deleteDoc, deleteField, arrayUnion, writeBatch, onSnapshot, Timestamp,
  ref, uploadBytes, uploadBytesResumable, uploadString, getDownloadURL
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: any, type: OperationType, path: string) {
  console.error(`Firestore Error [${type}] at ${path}:`, error);
}

export const createNotification = async (userId: string, title: string, message: string, type: string = 'info', link?: string) => {
  try {
    return await addDoc(collection(db, 'notifications'), {
      userId,
      title,
      message,
      type,
      link: link || null,
      read: false,
      createdAt: Timestamp.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'notifications');
    throw error;
  }
};
