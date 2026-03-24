// ─── Типы ───────────────────────────────────────────────────────────────────
export interface CarImage {
  id: string;
  sizes: {
    original: string;
    large: string;
    medium: string;
    small: string;
  };
}

export interface Car {
  id: string;
  name: string;
  name_en?: string;
  category?: string;
  pricePerDay: number;
  specs: { hp: number; zeroToSixty: number; maxSpeed: number };
  imageUrl: string;
  images: CarImage[];
  available: boolean;
  isAvailableToday: boolean;
  isHidden: boolean;
  description?: string;
  description_en?: string;
  discountRules: any[];
}

// ─── Firebase SDK ─────────────────────────────────────────────────────────────
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  query,
  where,
  onSnapshot,
  limit,
  orderBy,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  writeBatch,
  setDoc,
  deleteField,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import {
  getStorage,
  FirebaseStorage,
  ref,
  uploadBytesResumable,
  uploadBytes,
  uploadString,
  getDownloadURL,
} from 'firebase/storage';

// ─── Re-export Firestore helpers ──────────────────────────────────────────────
export {
  collection,
  query,
  where,
  onSnapshot,
  limit,
  orderBy,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  writeBatch,
  setDoc,
  deleteField,
};

// ─── Re-export Storage helpers ────────────────────────────────────────────────
export { ref, uploadBytesResumable, uploadBytes, uploadString, getDownloadURL };

// ─── Инициализация ───────────────────────────────────────────────────────────
// Check if all required environment variables are present
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

const missingVars = requiredEnvVars.filter(key => !import.meta.env[key]);

if (missingVars.length > 0) {
  console.error(`[Firebase] Missing environment variables: ${missingVars.join(', ')}`);
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
let app: any;
let db: Firestore;
let auth: Auth;
let storage: FirebaseStorage;

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
} catch (error) {
  console.error("[Firebase] Initialization failed:", error);
  db = null as any;
  auth = null as any;
  storage = null as any;
}

export { app, db, auth, storage };

// ─── OperationType ────────────────────────────────────────────────────────────
export const OperationType = {
  LIST: 'LIST',
  GET: 'GET',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const;

export type OperationType = typeof OperationType[keyof typeof OperationType];

// ─── handleFirestoreError ─────────────────────────────────────────────────────
export const handleFirestoreError = (
  error: unknown,
  operation: OperationType,
  collectionName: string
): void => {
  console.error(`[Firestore] Ошибка ${operation} в коллекции "${collectionName}":`, error);
};

// ─── createNotification ───────────────────────────────────────────────────────
export const createNotification = async (
  userId: string,
  title: string,
  body: string,
  type: string,
  link?: string
): Promise<void> => {
  if (!_db) return;
  try {
    await addDoc(collection(_db, 'notifications'), {
      userId,
      title,
      body,
      type,
      link: link || null,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[Firebase] Ошибка создания уведомления:', e);
  }
};

// ─── Флаги конфигурации ───────────────────────────────────────────────────────
export const isConfigured = true;
export const isUsingEnv = true;

// ─── REST API функции (для флота / каталога авто) ────────────────────────────
const parseImages = (rawImages: any[], fallbackUrl: string): CarImage[] => {
  if (!Array.isArray(rawImages)) return [];
  return rawImages.map((img: any) => {
    const obj = typeof img === 'string'
      ? (() => { try { return JSON.parse(img); } catch { return {}; } })()
      : img;
    return {
      ...obj,
      sizes: obj.sizes || {
        original: obj.url || fallbackUrl,
        large: obj.url || fallbackUrl,
        medium: obj.url || fallbackUrl,
        small: obj.url || fallbackUrl,
      },
    };
  });
};

const mapCarsData = (data: any[]): Car[] => {
  return data.map((car: any) => {
    const imageUrl = car.imageUrl || car.image_url || car.imageurl || '';
    const rawImages = typeof car.images === 'string'
      ? (() => { try { return JSON.parse(car.images); } catch { return []; } })()
      : (car.images || []);
    return {
      id: car.id,
      name: car.name,
      name_en: car.name_en,
      category: car.category,
      pricePerDay: car.pricePerDay || car.price_per_day || car.priceperday || 0,
      specs: car.specs || { hp: 0, zeroToSixty: 0, maxSpeed: 0 },
      imageUrl,
      images: parseImages(rawImages, imageUrl),
      available: !!car.available,
      isAvailableToday: !!(car.isAvailableToday || car.is_available_today || car.isavailabletoday),
      isHidden: !!(car.isHidden || car.hidden || car.ishidden),
      description: car.description,
      description_en: car.description_en,
      discountRules: car.discountRules || car.discount_rules || car.discountrules || [],
    };
  });
};

export const fetchCars = async (): Promise<Car[]> => {
  try {
    const response = await fetch('/api/cars');
    if (response.ok) {
      const data = await response.json();
      return mapCarsData(data);
    }
  } catch (e) {
    console.error('API fetch failed', e);
  }
  throw new Error('Could not fetch cars from API');
};

export const saveCarSecure = async (car: Car, password: string) => {
  const response = await fetch('/api/admin-cars', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save', password, car }),
  });

  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
  }

  if (!response.ok) {
    throw new Error(data.error || `Failed to save car (Status ${response.status})`);
  }
  return data;
};

export const deleteCarSecure = async (id: string, password: string) => {
  const response = await fetch('/api/admin-cars', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', password, id }),
  });

  if (!response.ok) {
    let errData: any = {};
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      errData = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
    }
    throw new Error(errData.error || `Failed to delete car (Status ${response.status})`);
  }
};

const compressImage = async (file: File, maxWidth = 1600, quality = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

export const uploadCarImages = async (files: FileList): Promise<CarImage[]> => {
  const uploadedImages: CarImage[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const base64 = await compressImage(file);
    const filename = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const response = await fetch('/api/upload-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, filename }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error((errorData as any).error || 'Upload failed');
    }
    const data = await response.json();
    uploadedImages.push({
      id: filename,
      sizes: {
        original: data.publicUrl,
        large: data.publicUrl,
        medium: data.publicUrl,
        small: data.publicUrl,
      },
    });
  }
  return uploadedImages;
};

export const deleteImageFromServer = async (imageId: string, password: string) => {
  const response = await fetch('/api/delete-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId, password }),
  });
  if (!response.ok) {
    let errData: any = {};
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      errData = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
    }
    throw new Error(errData.error || 'Failed to delete image');
  }
};

export const checkAdminPassword = async (password: string): Promise<boolean> => {
  try {
    const response = await fetch('/api/admin-cars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_auth', password }),
    });
    return response.ok;
  } catch (e) {
    console.error('Auth check failed', e);
    return false;
  }
};
