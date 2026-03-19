import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { getFirestore, getDocFromServer, doc, addDoc, collection } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
// @ts-ignore
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app, firebaseConfig.storageBucket);

export { RecaptchaVerifier, signInWithPhoneNumber };

export async function createNotification(userId: string, title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', link?: string) {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      title,
      message,
      type,
      link,
      read: false,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

// Test connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  const errStr = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errStr);
  
  // Dispatch custom event for ErrorBoundary to catch async errors
  window.dispatchEvent(new CustomEvent('firestore-error', { detail: new Error(errStr) }));
  
  throw new Error(errStr);
}
