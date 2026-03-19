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
  email?: string;
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
  updateUserRole: (newRole: 'client' | 'admin' | 'pilot') => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType>({ 
  user: null, 
  loading: true,
  updateUserRole: async () => {} 
});

export const useFirebase = () => useContext(FirebaseContext);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

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
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Use onSnapshot for real-time updates and initial fetch
        userUnsubscribe = onSnapshot(userRef, async (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data() as AppUser;
            
            // Check if we should upgrade to admin based on email or username
            const isAdminEmail = firebaseUser.email === 'leshkevich.99@gmail.com';
            const isAdminUsername = userData.username?.toLowerCase() === 'ttaammmo' || userData.username?.toLowerCase() === '@ttaammmo';
            
            if (userData.role !== 'admin' && (isAdminEmail || isAdminUsername)) {
              await setDoc(userRef, { role: 'admin', email: firebaseUser.email || userData.email }, { merge: true });
              // Next snapshot will handle the state update
            } else {
              setUser(userData);
              setLoading(false);
            }
          } else {
            // User doesn't exist in Firestore yet. Create it.
            // Check for custom claims first (especially for test accounts)
            const tokenResult = await firebaseUser.getIdTokenResult();
            const roleFromToken = tokenResult.claims.role as string;
            
            const tgUser = WebApp.initDataUnsafe?.user;
            
            // Fallback for local testing if not in Telegram
            const telegramId = tgUser?.id || Math.floor(Math.random() * 1000000);
            const username = tgUser?.username || firebaseUser.displayName || `user_${firebaseUser.uid.slice(0, 5)}`;
            const firstName = tgUser?.first_name || firebaseUser.displayName || 'Пользователь';
            
            const isAdminEmail = firebaseUser.email === 'leshkevich.99@gmail.com';
            const isAdminUsername = username.toLowerCase() === 'ttaammmo' || username.toLowerCase() === '@ttaammmo';
            const role = roleFromToken || ((isAdminUsername || isAdminEmail) ? 'admin' : 'client');
            
            const newUser: AppUser = {
              uid: firebaseUser.uid,
              telegramId,
              username,
              firstName,
              role: role as any,
              email: firebaseUser.email || undefined,
              createdAt: new Date().toISOString()
            };
            
            await setDoc(userRef, newUser);
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
              console.warn('Telegram login failed:', await response.text());
              window.dispatchEvent(new Event('telegram-login-failed'));
              setUser(null);
              setLoading(false);
            }
          } catch (error) {
            console.error('Error during Telegram login:', error);
            window.dispatchEvent(new Event('telegram-login-failed'));
            setUser(null);
            setLoading(false);
          }
        } else {
          setUser(null);
          setLoading(false);
        }
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
    <FirebaseContext.Provider value={{ user, loading, updateUserRole }}>
      {children}
    </FirebaseContext.Provider>
  );
};
