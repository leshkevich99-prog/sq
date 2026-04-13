import React, { createContext, useContext, useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { auth, db, doc, onSnapshot } from '../firebase';
import { signInWithCustomToken, signOut } from 'firebase/auth';

interface AppUser {
  id: string;
  uid: string; // For compatibility
  telegramId: string;
  username: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  role: 'client' | 'admin' | 'pilot';
  tariff?: 'telemetry' | 'pitstop' | 'family';
  createdAt: string;
  quotas?: Record<string, number>;
  limits?: Record<string, number>;
  usedQuotas?: Record<string, number>;
  subscription?: string;
}

interface FirebaseContextType {
  user: AppUser | null;
  loading: boolean;
  authError: string | null;
  updateUserRole: (newRole: 'client' | 'admin' | 'pilot') => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType>({ 
  user: null, 
  loading: true,
  authError: null,
  updateUserRole: async () => {},
  refreshAuth: async () => false,
  logout: async () => {}
});

export const useFirebase = () => useContext(FirebaseContext);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchMe = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/auth/me', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (response.ok) {
        const { user: userData, firebaseCustomToken, token } = await response.json();
        
        if (token) {
          localStorage.setItem('auth_token', token);
        }
        
        if (firebaseCustomToken) {
          try {
            await signInWithCustomToken(auth, firebaseCustomToken);
          } catch (fbErr) {
            console.error("Firebase auth error:", fbErr);
          }
        }
        
        const mappedUser = { ...userData, uid: userData.id };
        setUser(mappedUser);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Error fetching user data:", err);
      return false;
    }
  };

  const loginWithTelegram = async () => {
    if (!WebApp.initData) return false;
    
    try {
      const response = await fetch('/api/auth/telegram-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: WebApp.initData })
      });

      if (response.ok) {
        const { user: userData, firebaseCustomToken, token } = await response.json();
        
        if (token) {
          localStorage.setItem('auth_token', token);
        }
        
        if (firebaseCustomToken) {
          try {
            await signInWithCustomToken(auth, firebaseCustomToken);
          } catch (fbErr) {
            console.error("Firebase auth error:", fbErr);
          }
        }
        
        const mappedUser = { ...userData, uid: userData.id };
        setUser(mappedUser);
        return true;
      } else {
        const errorText = await response.text();
        console.error('Telegram login failed, raw response:', errorText);
        setAuthError(`Ошибка сервера: ${errorText.substring(0, 100)}`);
        return false;
      }
    } catch (err) {
      console.error("Telegram login error:", err);
      setAuthError('Ошибка сетевого соединения при входе.');
      return false;
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      setLoading(true);
      const loggedIn = await fetchMe();
      if (!loggedIn && WebApp.initData) {
        await loginWithTelegram();
      }
      setLoading(false);
    };

    initAuth();

    // Re-check auth when app becomes visible (mobile background resume)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchMe();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Subscribe to user document changes in Firestore for real-time quotas/balance
  useEffect(() => {
    if (!user?.id || !db) return;

    const unsub = onSnapshot(doc(db, 'users', user.id), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setUser(prev => prev ? { ...prev, ...data, id: prev.id, uid: prev.id } : null);
      }
    });

    return () => unsub();
  }, [user?.id]);

  const updateUserRole = async (newRole: 'client' | 'admin' | 'pilot') => {
    if (!user) return;
    try {
      const response = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      if (response.ok) {
        setUser(prev => prev ? { ...prev, role: newRole } : null);
      }
    } catch (error) {
      console.error("Error updating user role:", error);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      await signOut(auth);
      localStorage.removeItem('auth_token');
      setUser(null);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <FirebaseContext.Provider value={{ user, loading, authError, updateUserRole, refreshAuth: fetchMe, logout }}>
      {children}
    </FirebaseContext.Provider>
  );
};
