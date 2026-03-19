import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, collection, query, where, onSnapshot, orderBy, doc, updateDoc, writeBatch } from '../firebase';
import { useFirebase } from '../components/FirebaseProvider';
import { Bell, Check, Trash2, Clock, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
  link?: string;
}

export default function Notifications() {
  const { user } = useFirebase();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const notifs: Notification[] = [];
      snapshot.forEach(doc => notifs.push({ id: doc.id, ...doc.data() } as Notification));
      setNotifications(notifs);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'notifications'));

    return () => unsub();
  }, [user]);

  const markAllAsRead = async () => {
    if (!user || notifications.length === 0) return;
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  };

  const markAsRead = async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  };

  if (loading) return <div className="p-6 text-center text-zinc-500">Загрузка...</div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 bg-zinc-900 rounded-full border border-zinc-800">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold uppercase tracking-wider">Уведомления</h1>
        </div>
        {notifications.some(n => !n.read) && (
          <button 
            onClick={markAllAsRead}
            className="text-xs text-amber-500 font-bold uppercase tracking-widest hover:text-amber-400 transition-colors"
          >
            Прочитать все
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-20 bg-zinc-900 rounded-2xl border border-zinc-800">
          <Bell size={48} className="mx-auto text-zinc-800 mb-4" />
          <p className="text-zinc-500">У вас пока нет уведомлений</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map(n => (
            <div 
              key={n.id} 
              onClick={() => {
                markAsRead(n.id);
                if (n.link) navigate(n.link);
              }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                n.read 
                ? 'bg-zinc-900/50 border-zinc-800/50 opacity-60' 
                : 'bg-zinc-900 border-zinc-800 shadow-lg shadow-amber-500/5'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className={`font-bold text-sm ${n.read ? 'text-zinc-400' : 'text-white'}`}>{n.title}</h3>
                <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                  <Clock size={10} /> {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${n.read ? 'text-zinc-500' : 'text-zinc-400'}`}>{n.message}</p>
              {!n.read && (
                <div className="mt-2 flex justify-end">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
