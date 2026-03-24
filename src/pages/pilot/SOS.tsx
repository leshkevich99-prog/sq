import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, createNotification, collection, addDoc, onSnapshot, query, where, orderBy, updateDoc, doc, getDocs } from '../../firebase';
import { useFirebase } from '../../components/FirebaseProvider';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface SosAlert {
  id: string;
  pilotId: string;
  status: 'active' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
}

export default function SOS() {
  const { user } = useFirebase();
  const [activeAlert, setActiveAlert] = useState<SosAlert | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'sos_alerts'),
      where('pilotId', '==', user.uid),
      where('status', '==', 'active')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setActiveAlert({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as SosAlert);
      } else {
        setActiveAlert(null);
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sos_alerts'));

    return () => unsub();
  }, [user]);

  const triggerSOS = async () => {
    if (!user) return;
    
    const toastId = toast.loading('Отправка сигнала SOS...');
    try {
      const response = await fetch('/api/sos/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Ошибка сервера при отправке SOS');
      }

      const alertData = await response.json();
      setActiveAlert(alertData);
      toast.success('Сигнал успешно отправлен', { id: toastId });
    } catch (error: any) {
      console.error('SOS Trigger Error:', error);
      toast.error(error.message || 'Ошибка отправки сигнала', { id: toastId });
    }
  };

  const cancelSOS = async () => {
    if (!activeAlert) return;
    
    const toastId = toast.loading('Отмена сигнала...');
    try {
      const response = await fetch('/api/sos/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId: activeAlert.id })
      });

      if (!response.ok) {
        throw new Error('Ошибка сервера при отмене SOS');
      }

      setActiveAlert(null);
      toast.success('Сигнал отменен', { id: toastId });
    } catch (error: any) {
      console.error('SOS Resolve Error:', error);
      toast.error(error.message || 'Ошибка отмены', { id: toastId });
    }
  };

  if (loading) return <div className="p-6 text-center text-zinc-500">Загрузка...</div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col items-center justify-center min-h-[80vh]">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold uppercase tracking-widest mb-2">Экстренная связь</h1>
        <p className="text-zinc-400 text-sm max-w-xs mx-auto">
          Используйте эту кнопку только в случае реальной угрозы жизни, здоровью или сохранности автомобиля.
        </p>
      </div>

      {activeAlert ? (
        <div className="flex flex-col items-center">
          <div className="w-48 h-48 rounded-full bg-red-500/20 flex items-center justify-center mb-8 animate-pulse border-4 border-red-500/50">
            <AlertTriangle size={64} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-red-500 uppercase tracking-wider mb-2">Сигнал отправлен</h2>
          <p className="text-zinc-400 text-sm mb-8 text-center max-w-xs">
            Администратор уже получил уведомление и свяжется с вами в ближайшее время.
          </p>
          <button 
            onClick={cancelSOS}
            className="px-8 py-4 bg-zinc-900 border border-zinc-800 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-zinc-800 transition-colors"
          >
            Отменить сигнал
          </button>
        </div>
      ) : (
        <button 
          onClick={triggerSOS}
          className="relative group"
        >
          <div className="absolute inset-0 bg-red-500 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
          <div className="relative w-48 h-48 rounded-full bg-gradient-to-b from-red-500 to-red-700 flex items-center justify-center shadow-2xl shadow-red-500/20 border-4 border-red-400/30 active:scale-95 transition-transform duration-200">
            <span className="text-4xl font-black text-white tracking-widest drop-shadow-md">SOS</span>
          </div>
        </button>
      )}
    </div>
  );
}
