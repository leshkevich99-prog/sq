import React, { useState, useEffect, useRef } from 'react';
import { useFirebase } from '../components/FirebaseProvider';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { User, Phone, Mail, Save, ArrowLeft, LogOut, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Profile() {
  const { user } = useFirebase();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: ''
  });

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

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
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFormData({
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            phone: data.phone || '',
            email: data.email || ''
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      } finally {
        setLoading(false);
      }
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
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        email: formData.email
      });
      // Optionally show a success message
      navigate(-1);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
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
        <button onClick={handleLogout} className="p-2 text-red-500 bg-red-500/10 rounded-full hover:bg-red-500/20 transition-colors">
          <LogOut size={20} />
        </button>
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
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Email</label>
                {focusedField === 'email' && (
                  <button 
                    type="button"
                    onClick={() => {
                      emailRef.current?.blur();
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
                  <Mail size={18} className="text-zinc-500" />
                </div>
                <input
                  ref={emailRef}
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onFocus={() => handleFocus('email', emailRef)}
                  onBlur={() => setTimeout(() => setFocusedField(null), 100)}
                  className="w-full bg-black border border-zinc-800 rounded-lg py-3 pl-10 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent transition-colors"
                  placeholder="ivan@example.com"
                />
              </div>
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