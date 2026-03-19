import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Bell, 
  Moon, 
  Globe, 
  Shield, 
  Smartphone, 
  ChevronRight,
  LogOut,
  User,
  FileText,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useFirebase } from '../../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, doc, getDoc, updateDoc } from '../../firebase';
import toast from 'react-hot-toast';

export default function PilotSettings() {
  const navigate = useNavigate();
  const { user, logout } = useFirebase();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    pushNotifications: true,
    smsNotifications: false,
    darkMode: true,
    language: 'ru'
  });

  useEffect(() => {
    if (!user) return;
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.settings) {
            setSettings(prev => ({ ...prev, ...data.settings }));
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [user]);

  const toggleSetting = async (key: keyof typeof settings) => {
    if (!user) return;
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        settings: newSettings
      });
    } catch (error) {
      toast.error('Ошибка при сохранении настроек');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      toast.error('Ошибка при выходе');
    }
  };

  if (loading) return <div className="p-6 text-center text-zinc-500">Загрузка настроек...</div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 bg-zinc-900 rounded-full border border-zinc-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold uppercase tracking-wider">Настройки</h1>
      </div>

      {/* Profile Summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
            <User size={28} className="text-zinc-500" />
          </div>
          <div>
            <div className="text-lg font-bold">{user?.firstName} {user?.lastName}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">ID: {user?.uid.slice(0, 8)}</div>
          </div>
        </div>
        <button 
          onClick={() => navigate('/profile')}
          className="p-2 bg-zinc-800 rounded-full text-zinc-400"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Documents Status */}
      <div className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 px-2 mb-4">Документы</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl divide-y divide-zinc-800">
          <div className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <FileText size={20} className="text-zinc-500" />
              <span className="text-sm font-medium">Водительское удостоверение</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-500">
              <CheckCircle2 size={16} />
              <span className="text-[10px] font-bold uppercase">Одобрено</span>
            </div>
          </div>
          <div className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Shield size={20} className="text-zinc-500" />
              <span className="text-sm font-medium">Страховой полис</span>
            </div>
            <div className="flex items-center gap-1 text-amber-500">
              <AlertCircle size={16} />
              <span className="text-[10px] font-bold uppercase">Проверка</span>
            </div>
          </div>
        </div>
      </div>

      {/* App Settings */}
      <div className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 px-2 mb-4">Приложение</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl divide-y divide-zinc-800">
          <div className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Bell size={20} className="text-zinc-500" />
              <span className="text-sm font-medium">Push-уведомления</span>
            </div>
            <button 
              onClick={() => toggleSetting('pushNotifications')}
              className={`w-12 h-6 rounded-full transition-colors relative ${settings.pushNotifications ? 'bg-amber-500' : 'bg-zinc-800'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.pushNotifications ? 'right-1' : 'left-1'}`} />
            </button>
          </div>
          
          <div className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Globe size={20} className="text-zinc-500" />
              <span className="text-sm font-medium">Язык</span>
            </div>
            <span className="text-xs text-zinc-500 font-bold uppercase">Русский</span>
          </div>

          <div className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Smartphone size={20} className="text-zinc-500" />
              <span className="text-sm font-medium">Версия приложения</span>
            </div>
            <span className="text-xs text-zinc-500">1.0.4 (beta)</span>
          </div>
        </div>
      </div>

      {/* Logout */}
      <button 
        onClick={handleLogout}
        className="w-full p-5 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center gap-3 text-red-500 font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-transform"
      >
        <LogOut size={18} />
        Выйти из аккаунта
      </button>
    </div>
  );
}
