import { auth, db } from '../firebase';
import { signInWithCustomToken } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export const handleTestAccountLogin = async (code: string) => {
  const response = await fetch('/api/auth/test-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Ошибка авторизации');
  }

  const { token } = await response.json();
  const userCredential = await signInWithCustomToken(auth, token);
  
  return userCredential.user;
};
