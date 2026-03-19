import React, { useState } from 'react';
import { useFirebase } from './FirebaseProvider';
import { Settings, User, Shield, Zap, X, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { handleTestAccountLogin } from '../utils/testAuth';

export default function DevTools() {
  const { user, updateUserRole } = useFirebase();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Show for any test user
  const isTestUser = user?.uid?.startsWith('test_');
  
  // Persist dev status in localStorage so if they switch to client they don't lose the button
  if (user?.role === 'admin') {
    localStorage.setItem('isDev', 'true');
  }
  
  const isDev = user?.role === 'admin' || localStorage.getItem('isDev') === 'true';
  
  if (!isDev && !isTestUser) return null;

  const switchTestAccount = async (code: string) => {
    setLoading(true);
    try {
      await handleTestAccountLogin(code);
      setIsOpen(false);
      toast.success('Аккаунт изменен');
    } catch (error) {
      console.error(error);
      toast.error('Не удалось сменить аккаунт');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-24 right-4 z-50">
      {isOpen ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl w-56 animate-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Dev Menu</h3>
            <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white">
              <X size={16} />
            </button>
          </div>
          
          {isDev && (
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Сменить роль (текущий юзер)</div>
              <div className="space-y-1">
                <button 
                  onClick={() => { updateUserRole('client'); setIsOpen(false); }}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors ${user.role === 'client' ? 'bg-white text-black' : 'hover:bg-zinc-800 text-zinc-400'}`}
                >
                  <User size={16} /> Клиент
                </button>
                <button 
                  onClick={() => { updateUserRole('pilot'); setIsOpen(false); }}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors ${user.role === 'pilot' ? 'bg-white text-black' : 'hover:bg-zinc-800 text-zinc-400'}`}
                >
                  <Zap size={16} /> Пилот
                </button>
                <button 
                  onClick={() => { updateUserRole('admin'); setIsOpen(false); }}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors ${user.role === 'admin' ? 'bg-white text-black' : 'hover:bg-zinc-800 text-zinc-400'}`}
                >
                  <Shield size={16} /> Админ
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Тестовые аккаунты</div>
            <div className="space-y-1">
              <button 
                disabled={loading}
                onClick={() => switchTestAccount('cl')}
                className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors ${user?.uid === 'test_client' ? 'bg-amber-500 text-black' : 'hover:bg-zinc-800 text-zinc-400'}`}
              >
                <Users size={16} /> Виталий (Клиент)
              </button>
              <button 
                disabled={loading}
                onClick={() => switchTestAccount('pi')}
                className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors ${user?.uid === 'test_pilot' ? 'bg-amber-500 text-black' : 'hover:bg-zinc-800 text-zinc-400'}`}
              >
                <Users size={16} /> Петя (Пилот)
              </button>
              <button 
                disabled={loading}
                onClick={() => switchTestAccount('ad')}
                className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors ${user?.uid === 'test_admin' ? 'bg-amber-500 text-black' : 'hover:bg-zinc-800 text-zinc-400'}`}
              >
                <Users size={16} /> Саша (Админ)
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button 
          onClick={() => setIsOpen(true)}
          className="w-12 h-12 bg-amber-500 text-black rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <Settings size={24} />
        </button>
      )}
    </div>
  );
}
