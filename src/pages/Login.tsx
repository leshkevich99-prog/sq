import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { signInWithCustomToken } from 'firebase/auth';
import { Car, MessageCircle, KeyRound, ArrowRight, AlertCircle } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import toast from 'react-hot-toast';
import { handleTestAccountLogin } from '../utils/testAuth';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isTelegram, setIsTelegram] = useState(false);
  const [telegramLoginFailed, setTelegramLoginFailed] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [testCode, setTestCode] = useState('');
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => {
    if (WebApp.initData) {
      setIsTelegram(true);
      // Listen for a custom event from FirebaseProvider if telegram login fails
      const handleTelegramError = () => {
        setTelegramLoginFailed(true);
        setError('Не удалось войти через Telegram. Возможно, не настроен TELEGRAM_BOT_TOKEN.');
      };
      window.addEventListener('telegram-login-failed', handleTelegramError);
      return () => window.removeEventListener('telegram-login-failed', handleTelegramError);
    }
  }, []);

  const handleSecretTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);
    if (newCount === 5) {
      localStorage.setItem('isDev', 'true');
      toast.success('Режим разработчика активирован!');
      setTapCount(0);
    }
  };

  const handleCodeLogin = async () => {
    if (!testCode) return;
    setLoading(true);
    setError('');

    const code = testCode.toLowerCase().trim();

    try {
      await handleTestAccountLogin(code);
    } catch (err: any) {
      console.error('Code login error:', err);
      setError(err.message || 'Ошибка при входе по коду');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <div 
          className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 border border-zinc-800 transition-transform"
        >
          <Car size={40} className="text-amber-500" />
        </div>
        
        <h1 className="text-4xl font-serif font-normal tracking-widest uppercase mb-2">Squadra</h1>
        <p className="text-zinc-400 text-xs uppercase tracking-[0.2em] mb-12">Автомобильный консьерж</p>

        {isTelegram && !telegramLoginFailed ? (
          <div className="animate-pulse flex flex-col items-center mb-8">
            <div className="h-4 w-48 bg-zinc-800 rounded mb-4"></div>
            <p className="text-zinc-500 text-sm">Автоматический вход через Telegram...</p>
          </div>
        ) : (
          <div className="w-full mb-8">
            <p className="text-zinc-400 text-sm mb-6">
              {!isTelegram 
                ? 'Пожалуйста, откройте приложение через Telegram для автоматической авторизации.'
                : 'Автоматический вход не удался. Пожалуйста, обратитесь к администратору.'}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-xl w-full mb-6 flex items-start gap-3 text-left">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="w-full space-y-4">
          <a
            href="https://t.me/ttaammmo"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-zinc-900 text-white font-bold uppercase tracking-wider py-4 rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-3 border border-zinc-800"
          >
            <MessageCircle size={18} /> Связаться с админом
          </a>

          {/* Test login temporarily disabled
          {!showCodeInput ? (
            <button
              onClick={() => setShowCodeInput(true)}
              className="w-full bg-transparent text-zinc-500 font-bold uppercase tracking-wider py-4 rounded-xl hover:text-white transition-colors flex items-center justify-center gap-3"
            >
              <KeyRound size={18} /> Войти по коду (Тест)
            </button>
          ) : (
            <div className="w-full animate-in fade-in slide-in-from-top-2">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Введите код (ad, pi, cl, new)" 
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCodeLogin()}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-4 pr-12 text-white focus:outline-none focus:border-amber-500 transition-colors text-center uppercase tracking-widest"
                />
                <button 
                  onClick={handleCodeLogin}
                  disabled={loading || !testCode}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white text-black rounded-lg flex items-center justify-center disabled:opacity-50"
                >
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}
          */}
        </div>
      </div>
    </div>
  );
}
