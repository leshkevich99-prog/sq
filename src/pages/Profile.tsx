import React, { useState, useEffect, useRef } from 'react';
import { useFirebase } from '../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, doc, getDoc, updateDoc } from '../firebase';
import { User, Phone, Save, ArrowLeft, LogOut, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Profile() {
  const { user, logout } = useFirebase();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    tariff: ''
  });

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const handleFocus = (field: string, ref: React.RefObject<HTMLInputElement>) => {
    setFocusedField(field);
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  const [tapCount, setTapCount] = useState(0);

  const handleSecretTap = () => {
    /*
    const newCount = tapCount + 1;
    setTapCount(newCount);
    if (newCount === 5) {
      localStorage.setItem('isDev', 'true');
      toast.success('Режим разработчика активирован! Обновите страницу.');
      setTapCount(0);
    }
    */
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        tariff: user.tariff || user.subscription || ''
      });
      setLoading(false);
    };

    fetchProfile();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true);
    const toastId = toast.loading('Сохранение...');
    try {
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to update profile');
      
      // Update global user state
      if (typeof (user as any).refresh === 'function') {
        await (user as any).refresh();
      }
      
      toast.success('Профиль обновлен', { id: toastId });
      navigate(-1);
    } catch (error) {
      console.error('Profile update error:', error);
      toast.error('Ошибка при сохранении', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-zinc-500">Загрузка профиля...</div>;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6 mt-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 bg-zinc-900 rounded-full hover:bg-zinc-800 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-serif font-normal tracking-wide uppercase select-none">Профиль</h1>
            <p className="text-zinc-400 text-sm mt-1">Личные данные</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Имя</label>
                {focusedField === 'firstName' && (
                  <button 
                    type="button"
                    onClick={() => {
                      firstNameRef.current?.blur();
                      setFocusedField(null);
                    }}
                    className="text-[10px] font-bold uppercase text-accent flex items-center gap-1 bg-accent/10 px-2 py-1 rounded-lg"
                  >
                    Готово <Check size={10} />
                  </button>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={18} className="text-zinc-500" />
                </div>
                <input
                  ref={firstNameRef}
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  onFocus={() => handleFocus('firstName', firstNameRef)}
                  onBlur={() => setTimeout(() => setFocusedField(null), 100)}
                  className="w-full bg-black border border-zinc-800 rounded-lg py-3 pl-10 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent transition-colors"
                  placeholder="Иван"
                />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Фамилия</label>
                {focusedField === 'lastName' && (
                  <button 
                    type="button"
                    onClick={() => {
                      lastNameRef.current?.blur();
                      setFocusedField(null);
                    }}
                    className="text-[10px] font-bold uppercase text-accent flex items-center gap-1 bg-accent/10 px-2 py-1 rounded-lg"
                  >
                    Готово <Check size={10} />
                  </button>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={18} className="text-zinc-500" />
                </div>
                <input
                  ref={lastNameRef}
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  onFocus={() => handleFocus('lastName', lastNameRef)}
                  onBlur={() => setTimeout(() => setFocusedField(null), 100)}
                  className="w-full bg-black border border-zinc-800 rounded-lg py-3 pl-10 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent transition-colors"
                  placeholder="Иванов"
                />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Телефон</label>
                {focusedField === 'phone' && (
                  <button 
                    type="button"
                    onClick={() => {
                      phoneRef.current?.blur();
                      setFocusedField(null);
                    }}
                    className="text-[10px] font-bold uppercase text-accent flex items-center gap-1 bg-accent/10 px-2 py-1 rounded-lg"
                  >
                    Готово <Check size={10} />
                  </button>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone size={18} className="text-zinc-500" />
                </div>
                <input
                  ref={phoneRef}
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  onFocus={() => handleFocus('phone', phoneRef)}
                  onBlur={() => setTimeout(() => setFocusedField(null), 100)}
                  className="w-full bg-black border border-zinc-800 rounded-lg py-3 pl-10 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent transition-colors"
                  placeholder="+375 (29) 123-45-67"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Ваш тариф</label>
              <select
                name="tariff"
                value={formData.tariff}
                onChange={(e) => setFormData({ ...formData, tariff: e.target.value })}
                className="w-full bg-black border border-zinc-800 rounded-lg py-3 px-4 text-white focus:outline-none focus:border-accent appearance-none transition-colors"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.2em' }}
              >
                <option value="">Без тарифа</option>
                <option value="telemetry">TELEMETRY</option>
                <option value="pitstop">PIT STOP</option>
                <option value="family">SQUADRA FAMILY</option>
              </select>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-white text-black font-bold uppercase tracking-wider py-4 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save size={20} />
          {saving ? 'Сохранение...' : 'Сохранить изменения'}
        </button>
      </form>
    </div>
  );
}