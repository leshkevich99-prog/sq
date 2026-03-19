import React, { useState, useEffect } from 'react';
import { 
  Send, 
  Users, 
  User, 
  Shield, 
  Bell, 
  History, 
  Search, 
  Trash2,
  CheckCircle2,
  AlertCircle,
  Info
} from 'lucide-react';
import { db, handleFirestoreError, OperationType, createNotification } from '../../firebase';
import { collection, onSnapshot, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface SentNotification {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning' | 'error';
  target: 'all' | 'pilots' | 'clients' | 'individual';
  sentAt: string;
  sentBy: string;
}

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  const [target, setTarget] = useState<'all' | 'pilots' | 'clients'>('all');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // We'll store broadcast history in a separate collection 'broadcasts'
    const q = query(collection(db, 'broadcasts'), orderBy('sentAt', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snapshot) => {
      const n: SentNotification[] = [];
      snapshot.forEach(doc => {
        n.push({ id: doc.id, ...doc.data() } as SentNotification);
      });
      setNotifications(n);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'broadcasts'));

    return () => unsub();
  }, []);

  const handleSendBroadcast = async () => {
    if (!title || !body) {
      toast.error('Заполните заголовок и текст уведомления');
      return;
    }

    setSending(true);
    const toastId = toast.loading('Рассылка уведомлений...');

    try {
      // 1. Get target users
      let usersQuery;
      if (target === 'all') {
        usersQuery = collection(db, 'users');
      } else if (target === 'pilots') {
        usersQuery = query(collection(db, 'users'), where('role', '==', 'pilot'));
      } else {
        usersQuery = query(collection(db, 'users'), where('role', '==', 'client'));
      }

      const usersSnapshot = await getDocs(usersQuery);
      const userIds: string[] = [];
      usersSnapshot.forEach(doc => userIds.push(doc.id));

      // 2. Send notifications in parallel
      const notificationPromises = userIds.map(userId => 
        createNotification(userId, title, body, type, '/notifications')
      );

      await Promise.all(notificationPromises);

      // 3. Save to broadcast history
      const { addDoc } = await import('firebase/firestore');
      await addDoc(collection(db, 'broadcasts'), {
        title,
        body,
        type,
        target,
        sentAt: new Date().toISOString(),
        sentBy: 'admin', // In a real app, get current admin name
        count: userIds.length
      });

      toast.success(`Уведомление отправлено ${userIds.length} пользователям`, { id: toastId });
      
      // Reset form
      setTitle('');
      setBody('');
    } catch (error) {
      console.error('Broadcast error:', error);
      toast.error('Ошибка при выполнении рассылки', { id: toastId });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="mb-8">
        <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Уведомления</h1>
        <p className="text-zinc-400 text-sm mt-1">Массовые рассылки и системные оповещения</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Broadcast */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <Send className="text-accent" size={24} />
            <h2 className="text-xl font-bold uppercase tracking-tighter">Новая рассылка</h2>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Аудитория</label>
              <div className="grid grid-cols-3 gap-2">
                {(['all', 'pilots', 'clients'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTarget(t)}
                    className={`py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all flex flex-col items-center gap-2 ${
                      target === t 
                        ? 'bg-white border-white text-black' 
                        : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600'
                    }`}
                  >
                    {t === 'all' && <Users size={16} />}
                    {t === 'pilots' && <Shield size={16} />}
                    {t === 'clients' && <User size={16} />}
                    {t === 'all' ? 'Все' : t === 'pilots' ? 'Пилоты' : 'Клиенты'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Тип уведомления</label>
              <div className="flex gap-2">
                {(['info', 'success', 'warning', 'error'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                      type === t 
                        ? 'bg-zinc-800 border-zinc-600 text-white' 
                        : 'bg-black border-zinc-800 text-zinc-600 hover:border-zinc-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Заголовок</label>
              <input 
                type="text" 
                placeholder="Например: Технические работы"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Текст сообщения</label>
              <textarea 
                placeholder="Введите текст уведомления..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full bg-black border border-zinc-800 rounded-xl p-4 text-sm focus:outline-none focus:border-white transition-colors h-32 resize-none"
              ></textarea>
            </div>

            <button 
              onClick={handleSendBroadcast}
              disabled={sending || !title || !body}
              className="w-full py-4 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-2xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send size={18} />
              {sending ? 'Отправка...' : 'Запустить рассылку'}
            </button>
          </div>
        </section>

        {/* Broadcast History */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <History className="text-accent" size={24} />
            <h2 className="text-xl font-bold uppercase tracking-tighter">История рассылок</h2>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-12 text-zinc-500">Загрузка истории...</div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-12 bg-zinc-900/50 rounded-3xl border border-zinc-800/50 text-zinc-500">
                Рассылок еще не было
              </div>
            ) : notifications.map(notif => (
              <div key={notif.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    {notif.type === 'info' && <Info size={16} className="text-blue-500" />}
                    {notif.type === 'success' && <CheckCircle2 size={16} className="text-emerald-500" />}
                    {notif.type === 'warning' && <AlertCircle size={16} className="text-amber-500" />}
                    {notif.type === 'error' && <AlertCircle size={16} className="text-red-500" />}
                    <h3 className="font-bold text-sm text-white">{notif.title}</h3>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {new Date(notif.sentAt).toLocaleDateString()}
                  </span>
                </div>
                
                <p className="text-xs text-zinc-400 mb-4 line-clamp-2">{notif.body}</p>
                
                <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      <Users size={12} />
                      {notif.target === 'all' ? 'Все' : notif.target === 'pilots' ? 'Пилоты' : 'Клиенты'}
                    </div>
                  </div>
                  <button className="text-zinc-600 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
