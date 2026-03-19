import React, { useState, useEffect } from 'react';
import { useFirebase } from '../components/FirebaseProvider';
import { Car, MessageCircle, AlertCircle } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import toast from 'react-hot-toast';

export default function Login() {
  const { authError } = useFirebase();
  const [isTelegram, setIsTelegram] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => {
    if (WebApp.initData) {
      setIsTelegram(true);
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

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <div 
          onClick={handleSecretTap}
          className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 border border-zinc-800 transition-transform active:scale-95 cursor-pointer"
        >
          <Car size={40} className="text-amber-500" />
        </div>
        
        <h1 className="text-4xl font-serif font-normal tracking-widest uppercase mb-2">Squadra</h1>
        <p className="text-zinc-400 text-xs uppercase tracking-[0.2em] mb-12">Автомобильный консьерж</p>

        {isTelegram && !authError ? (
          <div className="animate-pulse flex flex-col items-center mb-8">
            <div className="h-4 w-48 bg-zinc-800 rounded mb-4"></div>
            <p className="text-zinc-500 text-sm">Автоматический вход через Telegram...</p>
          </div>
        ) : (
          <div className="w-full mb-8">
            <p className="text-zinc-400 text-sm mb-6">
              {!isTelegram 
                ? 'Для входа используйте кнопку ниже.'
                : 'Автоматический вход не удался. Пожалуйста, воспользуйтесь кнопкой ниже или обратитесь к администратору.'}
            </p>
            {!isTelegram && (
              <div id="telegram-login-widget" className="flex justify-center">
                <script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="YOUR_BOT_USERNAME" data-size="large" data-onauth="onTelegramAuth(user)" data-request-access="write"></script>
              </div>
            )}
          </div>
        )}

        {authError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-xl w-full mb-6 flex items-start gap-3 text-left">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{authError}</span>
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
        </div>
      </div>
    </div>
  );
}
