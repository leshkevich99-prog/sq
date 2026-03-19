import React, { useState, useEffect } from 'react';
import { Check, X, Clock, DollarSign, User, Calendar } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, onSnapshot, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';

import { BynIcon } from '../../components/BynIcon';

interface PayoutData {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'processed' | 'rejected';
  method: string;
  details: string;
  createdAt: string;
  processedAt?: string;
}

interface UserData {
  id: string;
  firstName: string;
  username: string;
}

export default function AdminPayouts() {
  const [payouts, setPayouts] = useState<PayoutData[]>([]);
  const [users, setUsers] = useState<Record<string, UserData>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'processed' | 'rejected'>('pending');

  useEffect(() => {
    const q = query(collection(db, 'payouts'), orderBy('createdAt', 'desc'));
    const unsubPayouts = onSnapshot(q, (snapshot) => {
      const p: PayoutData[] = [];
      snapshot.forEach(doc => {
        p.push({ id: doc.id, ...doc.data() } as PayoutData);
      });
      setPayouts(p);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'payouts'));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const u: Record<string, UserData> = {};
      snapshot.forEach(doc => {
        u[doc.id] = { id: doc.id, ...doc.data() } as UserData;
      });
      setUsers(u);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => {
      unsubPayouts();
      unsubUsers();
    };
  }, []);

  const handleStatusUpdate = async (payoutId: string, newStatus: 'processed' | 'rejected') => {
    const toastId = toast.loading('Обновление статуса...');
    try {
      await updateDoc(doc(db, 'payouts', payoutId), {
        status: newStatus,
        processedAt: new Date().toISOString()
      });
      toast.success(newStatus === 'processed' ? 'Выплата подтверждена' : 'Выплата отклонена', { id: toastId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `payouts/${payoutId}`);
      toast.error('Ошибка при обновлении', { id: toastId });
    }
  };

  const filteredPayouts = payouts.filter(p => filter === 'all' || p.status === filter);

  const statusStyles = {
    pending: 'bg-amber-500/20 text-amber-500',
    processed: 'bg-emerald-500/20 text-emerald-500',
    rejected: 'bg-red-500/20 text-red-500'
  };

  const statusLabels = {
    pending: 'Ожидает',
    processed: 'Выплачено',
    rejected: 'Отклонено'
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6 mt-2">
        <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Выплаты</h1>
        <p className="text-zinc-400 text-sm mt-1">Управление запросами на вывод средств</p>
      </header>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
        {(['pending', 'processed', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
              filter === f ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
            }`}
          >
            {f === 'all' ? 'Все' : statusLabels[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-zinc-500 py-8">Загрузка выплат...</div>
      ) : filteredPayouts.length === 0 ? (
        <div className="text-center text-zinc-500 py-12 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
          Запросы не найдены
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPayouts.map(payout => {
            const user = users[payout.userId];
            return (
              <div key={payout.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${statusStyles[payout.status]}`}>
                        {statusLabels[payout.status]}
                      </span>
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Calendar size={12} /> {new Date(payout.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-white">
                      {payout.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <BynIcon size="1em" className="text-zinc-500" />
                    </h3>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2 text-sm font-medium text-white mb-1">
                      <User size={14} className="text-zinc-500" />
                      {user ? `${user.firstName} (@${user.username})` : 'Загрузка...'}
                    </div>
                    <div className="text-xs text-zinc-500">Метод: {payout.method}</div>
                  </div>
                </div>

                <div className="bg-black/50 rounded-lg p-3 mb-4 border border-zinc-800/50">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Реквизиты</div>
                  <div className="text-sm font-mono break-all">{payout.details}</div>
                </div>

                {payout.status === 'pending' && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleStatusUpdate(payout.id, 'rejected')}
                      className="flex items-center justify-center gap-2 py-3 bg-red-500/10 text-red-500 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-red-500/20 transition-colors"
                    >
                      <X size={16} /> Отклонить
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(payout.id, 'processed')}
                      className="flex items-center justify-center gap-2 py-3 bg-emerald-500/10 text-emerald-500 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-emerald-500/20 transition-colors"
                    >
                      <Check size={16} /> Подтвердить
                    </button>
                  </div>
                )}

                {payout.status !== 'pending' && payout.processedAt && (
                  <div className="text-center py-2 text-xs text-zinc-500 border-t border-zinc-800 mt-2 pt-3 flex items-center justify-center gap-2">
                    <Clock size={12} /> Обработано: {new Date(payout.processedAt).toLocaleString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
