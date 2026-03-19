import React, { useState, useEffect } from 'react';
import { Search, Star, MapPin, Clock, Shield, ChevronRight, UserCheck, UserX, Wallet } from 'lucide-react';
import { BynIcon } from '../../components/BynIcon';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, onSnapshot, query, where, doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface PilotData {
  id: string;
  firstName: string;
  lastName?: string;
  username: string;
  role: string;
  isOnShift?: boolean;
  rating?: number;
  completedTasks?: number;
  balance?: number;
  isVerified?: boolean;
  createdAt: string;
}

export default function AdminPilots() {
  const [search, setSearch] = useState('');
  const [pilots, setPilots] = useState<PilotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'onShift' | 'verified' | 'unverified'>('all');

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'pilot'));
    const unsub = onSnapshot(q, (snapshot) => {
      const p: PilotData[] = [];
      snapshot.forEach(doc => {
        p.push({ id: doc.id, ...doc.data() } as PilotData);
      });
      setPilots(p);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => unsub();
  }, []);

  const toggleVerification = async (pilotId: string, currentStatus: boolean) => {
    const toastId = toast.loading(currentStatus ? 'Снятие верификации...' : 'Верификация пилота...');
    try {
      await updateDoc(doc(db, 'users', pilotId), {
        isVerified: !currentStatus
      });
      toast.success(currentStatus ? 'Верификация снята' : 'Пилот верифицирован', { id: toastId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${pilotId}`);
      toast.error('Ошибка при обновлении', { id: toastId });
    }
  };

  const filteredPilots = pilots.filter(p => {
    const matchesSearch = (p.firstName + p.lastName + p.username).toLowerCase().includes(search.toLowerCase());
    const matchesFilter = 
      filter === 'all' || 
      (filter === 'onShift' && p.isOnShift) ||
      (filter === 'verified' && p.isVerified) ||
      (filter === 'unverified' && !p.isVerified);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6 mt-2">
        <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Реестр Пилотов</h1>
        <p className="text-zinc-400 text-sm mt-1">Управление командой и верификация</p>
      </header>

      <div className="flex flex-col gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input 
            type="text" 
            placeholder="Поиск пилота..." 
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-accent transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {(['all', 'onShift', 'verified', 'unverified'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
                filter === f ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
              }`}
            >
              {f === 'all' ? 'Все' : f === 'onShift' ? 'На смене' : f === 'verified' ? 'Верифицирован' : 'Без верификации'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-zinc-500 py-8">Загрузка пилотов...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPilots.map(pilot => (
            <PilotCard 
              key={pilot.id} 
              pilot={pilot} 
              onToggleVerify={() => toggleVerification(pilot.id, pilot.isVerified || false)}
            />
          ))}
          {filteredPilots.length === 0 && (
            <div className="col-span-full text-center text-zinc-500 py-12 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
              Пилоты не найдены
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PilotCard: React.FC<{ pilot: PilotData, onToggleVerify: () => void }> = ({ pilot, onToggleVerify }) => {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all group">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-xl font-bold border border-zinc-700">
            {pilot.firstName[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white">{pilot.firstName} {pilot.lastName}</h3>
              {pilot.isVerified && <Shield size={14} className="text-blue-500 fill-blue-500/20" />}
            </div>
            <p className="text-xs text-zinc-500">@{pilot.username}</p>
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${pilot.isOnShift ? 'bg-emerald-500/20 text-emerald-500' : 'bg-zinc-800 text-zinc-500'}`}>
          {pilot.isOnShift ? 'На смене' : 'Оффлайн'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
            <Star size={14} className="fill-amber-500" />
            <span className="text-sm font-bold">{pilot.rating || '5.0'}</span>
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Рейтинг</p>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-white mb-1">{pilot.completedTasks || 0}</div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Поручения</p>
        </div>
        <div className="text-center">
          <div className={`text-sm font-bold mb-1 ${(pilot.balance || 0) < 0 ? 'text-red-600' : 'text-white'}`}>
            {(pilot.balance || 0).toFixed(2)} <BynIcon size="0.8em" className="text-zinc-500 ml-0.5" />
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Депозит</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button 
          onClick={onToggleVerify}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors ${
            pilot.isVerified 
              ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' 
              : 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
          }`}
        >
          {pilot.isVerified ? <UserX size={14} /> : <UserCheck size={14} />}
          {pilot.isVerified ? 'Снять верификацию' : 'Верифицировать'}
        </button>
        <button className="w-10 h-10 flex items-center justify-center bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
