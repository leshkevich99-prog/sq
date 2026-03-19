import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { onAuthStateChanged, User as FirebaseUser, signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import WebApp from '@twa-dev/sdk';

interface AppUser {
  uid: string;
  telegramId: number;
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
}

const FirebaseContext = createContext<FirebaseContextType>({ 
  user: null, 
  loading: true,
  authError: null,
  updateUserRole: async () => {} 
});

export const useFirebase = () => useContext(FirebaseContext);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let userUnsubscribe: (() => void) | null = null;
    let telegramLoginAttempted = false;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up existing user listener
      if (userUnsubscribe) {
        userUnsubscribe();
        userUnsubscribe = null;
      }

      if (firebaseUser) {
        setAuthError(null);
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Use onSnapshot for real-time updates and initial fetch
        userUnsubscribe = onSnapshot(userRef, async (docSnap) => {
          try {
            if (docSnap.exists()) {
              const userData = docSnap.data() as AppUser;
              setUser(userData);
              setLoading(false);
            } else {
              // User doesn't exist in Firestore yet. Create it.
              const tokenResult = await firebaseUser.getIdTokenResult();
              const roleFromToken = tokenResult.claims.role as string;
              
              const tgUser = WebApp.initDataUnsafe?.user;
              
              // Fallback for local testing if not in Telegram
              const telegramId = tgUser?.id || Math.floor(Math.random() * 1000000);
              const username = tgUser?.username || firebaseUser.displayName || `user_${firebaseUser.uid.slice(0, 5)}`;
              const firstName = tgUser?.first_name || firebaseUser.displayName || 'Пользователь';
              
              const isAdminUsername = username.toLowerCase() === 'ttaammmo' || username.toLowerCase() === '@ttaammmo';
              const role = roleFromToken || (isAdminUsername ? 'admin' : 'client');
              
              const newUser: AppUser = {
                uid: firebaseUser.uid,
                telegramId,
                username,
                firstName,
                role: role as any,
                createdAt: new Date().toISOString()
              };
              
              await setDoc(userRef, newUser);
              // Next snapshot will handle the state update and setLoading(false)
            }
          } catch (err) {
            console.error("Error in user data processing:", err);
            setAuthError("Ошибка при обработке данных пользователя.");
            setLoading(false);
          }
        }, (error) => {
          console.error("Firestore user listener error:", error);
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          setLoading(false);
        });
      } else {
        // Not logged in. Try Telegram login if possible.
        if (WebApp.initData && !telegramLoginAttempted) {
          telegramLoginAttempted = true;
          setLoading(true);
          setAuthError(null);
          try {
            const response = await fetch('/api/auth/telegram-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ initData: WebApp.initData })
            });

            if (response.ok) {
              const { token } = await response.json();
              await signInWithCustomToken(auth, token);
              // This will trigger onAuthStateChanged again
            } else {
              const errorText = await response.text();
              console.warn('Telegram login failed:', errorText);
              setAuthError(errorText || 'Не удалось войти через Telegram. Обратитесь к администратору.');
              setUser(null);
              setLoading(false);
            }
          } catch (error) {
            console.error('Error during Telegram login:', error);
            setAuthError('Ошибка сетевого соединения при входе.');
            setUser(null);
            setLoading(false);
          }
        } else if (!WebApp.initData) {
          setUser(null);
          setLoading(false);
        }
        // If telegramLoginAttempted is true but we are still here, it means we are waiting for custom token login to trigger onAuthStateChanged
      }
    });

    return () => {
      unsubscribeAuth();
      if (userUnsubscribe) userUnsubscribe();
    };
  }, []);

  const updateUserRole = async (newRole: 'client' | 'admin' | 'pilot') => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <FirebaseContext.Provider value={{ user, loading, authError, updateUserRole }}>
      {children}
    </FirebaseContext.Provider>
  );
};
