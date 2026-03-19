// This file now acts as a compatibility layer between the original Firebase code 
// and our new local SQLite/JWT backend.

export const db: any = {
  type: 'firestore',
  app: { name: '[DEFAULT]' },
  toJSON: () => ({})
}; 
export const auth = {
  currentUser: null as any
};
export const storage: any = {
  app: { 
    name: '[DEFAULT]',
    options: { storageBucket: 'local-mock-bucket' }
  }
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
  console.error(`Local DB Error [${type}] at ${path}:`, error);
}

// Helper to make API calls
async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `API Error: ${res.status}`);
  }
  return res.json();
}

// Mocking Firestore functions
export const collection = (db: any, path: string, ...segments: string[]) => {
  const fullPath = segments.length > 0 ? `${path}/${segments.join('/')}` : path;
  return {
    type: 'collection',
    id: fullPath.split('/').pop(),
    path: fullPath,
    parent: null,
    firestore: db
  };
};

export const doc = (db: any, path: string, ...segments: string[]) => {
  const fullPath = segments.length > 0 ? `${path}/${segments.join('/')}` : path;
  return {
    type: 'document',
    id: fullPath.split('/').pop(),
    path: fullPath,
    firestore: db,
    converter: null
  };
};

export const query = (col: any, ...constraints: any[]) => col;
export const where = (field: string, op: string, value: any) => ({ field, op, value });
export const orderBy = (field: string, dir: string = 'asc') => ({ field, dir });
export const limit = (n: number) => ({ limit: n });

export const getDocs = async (col: any) => {
  const path = typeof col === 'string' ? col : col.path;
  const data = await apiFetch(`/api/${path}`);
  const items = data[path] || [];
  return {
    docs: items.map((item: any) => ({
      id: item.id,
      data: () => item,
      exists: () => true
    })),
    forEach: (cb: any) => items.forEach((item: any) => cb({ id: item.id, data: () => item })),
    empty: items.length === 0,
    size: items.length
  };
};

export const getDoc = async (docRef: any) => {
  const path = typeof docRef === 'string' ? docRef : docRef.path;
  const [col, id] = path.split('/');
  const item = await apiFetch(`/api/${col}/${id}`);
  return {
    id: item.id,
    exists: () => !!item,
    data: () => item
  };
};

export const addDoc = async (col: any, data: any) => {
  const path = typeof col === 'string' ? col : col.path;
  return apiFetch(`/api/${path}`, {
    method: 'POST',
    body: JSON.stringify(data)
  });
};

export const updateDoc = async (docRef: any, data: any) => {
  const path = typeof docRef === 'string' ? docRef : docRef.path;
  const [col, id] = path.split('/');
  return apiFetch(`/api/${col}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
};

export const setDoc = async (docRef: any, data: any) => {
  const path = typeof docRef === 'string' ? docRef : docRef.path;
  const [col, id] = path.split('/');
  return apiFetch(`/api/${col}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
};

export const deleteDoc = async (docRef: any) => {
  const path = typeof docRef === 'string' ? docRef : docRef.path;
  const [col, id] = path.split('/');
  return apiFetch(`/api/${col}/${id}`, {
    method: 'DELETE'
  });
};

export const deleteField = () => undefined;
export const arrayUnion = (...elements: any[]) => elements;

export const writeBatch = (db: any) => {
  const operations: any[] = [];
  return {
    update: (docRef: any, data: any) => {
      operations.push({ type: 'update', path: typeof docRef === 'string' ? docRef : docRef.path, data });
    },
    set: (docRef: any, data: any) => {
      operations.push({ type: 'set', path: typeof docRef === 'string' ? docRef : docRef.path, data });
    },
    delete: (docRef: any) => {
      operations.push({ type: 'delete', path: typeof docRef === 'string' ? docRef : docRef.path });
    },
    commit: async () => {
      for (const op of operations) {
        if (op.type === 'update' || op.type === 'set') {
          await updateDoc(op.path, op.data);
        } else if (op.type === 'delete') {
          await deleteDoc(op.path);
        }
      }
    }
  };
};

// Simple polling-based onSnapshot
export const onSnapshot = (pathOrQuery: any, onNext: any, onError?: any) => {
  const colPath = typeof pathOrQuery === 'string' ? pathOrQuery : pathOrQuery.path;
  
  const fetchData = async () => {
    try {
      if (colPath.includes('/')) {
        const data = await getDoc(colPath);
        onNext(data);
      } else {
        const data = await getDocs(colPath);
        onNext(data);
      }
    } catch (err) {
      console.error(`onSnapshot error for ${colPath}:`, err);
      if (onError) onError(err);
    }
  };

  fetchData();
  const interval = setInterval(fetchData, 5000); // Poll every 5 seconds
  return () => clearInterval(interval);
};

export const createNotification = async (userId: string, title: string, message: string, type: string = 'info', link?: string) => {
  try {
    return await addDoc('notifications', { userId, title, message, type, link, createdAt: new Date().toISOString() });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'notifications');
    throw error;
  }
};

// Storage Mocks
export const getStorage = () => storage;
export const ref = (storage: any, path: string) => path;
export const uploadBytes = async (path: string, file: Blob) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  (globalThis as any)._lastUploadUrl = data.url;
  return { ref: path };
};
export const uploadBytesResumable = (path: string, file: Blob) => {
  const promise = uploadBytes(path, file);
  return {
    on: (event: string, progress: any, error: any, complete: any) => {
      promise.then(complete).catch(error);
    },
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise)
  };
};
export const uploadString = async (path: string, data: string, format: string) => {
  // Simple mock for base64 upload
  const blob = await fetch(data).then(r => r.blob());
  return uploadBytes(path, blob);
};
export const getDownloadURL = async (path: string) => {
  return (globalThis as any)._lastUploadUrl || '';
};
