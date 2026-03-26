import React, { useState } from 'react';
import { Shield, User, Hammer, Key, RefreshCw, X, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface DebugSwitcherProps {
  onClose: () => void;
}

const TESTERS = ['Tester1', 'Tester2', 'Tester3'];
const ROLES = [
  { id: 'admin', label: 'Админ', icon: Shield, color: 'text-red-400' },
  { id: 'pilot', label: 'Пилот', icon: Hammer, color: 'text-blue-400' },
  { id: 'client', label: 'Клиент', icon: User, color: 'text-green-400' },
];

export default function DebugSwitcher({ onClose }: DebugSwitcherProps) {
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);

  const handleSetup = async () => {
    setSetupLoading(true);
    try {
      const res = await fetch('/api/auth/setup-test-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Тестовые аккаунты созданы/проверены');
      } else {
        toast.error(data.error || 'Ошибка настройки');
      }
    } catch (e) {
      toast.error('Сетевая ошибка');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleLogin = async (tester: string, role: string) => {
    const userId = `${tester}_${role}`.toLowerCase();
    setLoading(true);
    const tid = toast.loading(`Вход как ${userId}...`);
    
    try {
      const res = await fetch('/api/auth/debug-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem('auth_token', data.token);
        toast.success('Успешный вход!', { id: tid });
        setTimeout(() => window.location.reload(), 500);
      } else {
        toast.error(data.error || 'Ошибка входа', { id: tid });
      }
    } catch (e) {
      toast.error('Сетевая ошибка', { id: tid });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-zinc-900 flex justify-between items-center bg-zinc-900/50">
          <div>
            <h2 className="text-xl font-serif uppercase tracking-widest text-white">Debug Panel</h2>
            <p className="text-xs text-zinc-500 mt-1 uppercase tracking-tighter">Переключатель тестовых ролей</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Setup Button */}
          <div className="flex justify-between items-center bg-zinc-900/40 p-4 rounded-2xl border border-zinc-900">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-800 rounded-lg">
                <Shield size={18} className="text-accent" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-white">Инициализация</p>
                <p className="text-[10px] text-zinc-500">Создать 9 тестовых аккаунтов</p>
              </div>
            </div>
            <button 
              onClick={handleSetup}
              disabled={setupLoading}
              className="bg-accent hover:bg-accent/90 disabled:opacity-50 px-6 py-2 rounded-xl text-xs font-bold uppercase text-black transition-colors flex items-center gap-2"
            >
              {setupLoading ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Setup
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 gap-4">
            {TESTERS.map((tester) => (
              <div key={tester} className="space-y-2">
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] px-1">{tester}</p>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map((role) => (
                    <button
                      key={role.id}
                      onClick={() => handleLogin(tester, role.id)}
                      disabled={loading}
                      className="group flex flex-col items-center justify-center p-4 bg-zinc-900/40 border border-zinc-900 rounded-2xl hover:border-zinc-700 hover:bg-zinc-900 transition-all active:scale-95 disabled:opacity-50"
                    >
                      <role.icon size={20} className={`${role.color} mb-2 group-hover:scale-110 transition-transform`} />
                      <span className="text-[10px] font-bold uppercase text-zinc-400">{role.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 bg-zinc-900/30 text-center border-t border-zinc-900">
          <p className="text-[8px] text-zinc-600 uppercase tracking-widest">Squadra QA Engine v1.0</p>
        </div>
      </div>
    </div>
  );
}
