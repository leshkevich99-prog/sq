import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, collection, query, where, orderBy, onSnapshot, addDoc, getDoc, doc, limit, getDocs } from '../firebase';
import { useFirebase } from '../components/FirebaseProvider';
import { ArrowLeft, Send } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  requestId: string;
  senderId: string;
  senderName?: string;
  text: string;
  type: 'public' | 'internal';
  createdAt: string;
}

interface RequestData {
  userId: string;
  pilotId?: string;
  serviceType: string;
  status: 'pending' | 'accepted' | 'driving' | 'in_progress' | 'review' | 'completed' | 'cancelled';
}

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useFirebase();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'public' | 'internal'>('public');
  const [request, setRequest] = useState<RequestData | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id || !user) return;

    // Verify access to the request
    const checkAccess = async () => {
      try {
        const reqSnap = await getDoc(doc(db, 'requests', id));
        if (!reqSnap.exists()) {
          toast.error('Поручение не найдено');
          navigate(-1);
          return;
        }
        const reqData = reqSnap.data() as RequestData;
        setRequest(reqData);
        if (user.role !== 'admin' && reqData.userId !== user.uid && reqData.pilotId !== user.uid) {
          toast.error('Нет доступа к чату');
          navigate(-1);
        }
      } catch (error) {
        console.error(error);
      }
    };
    checkAccess();

    const q = query(
      collection(db, 'messages'),
      where('requestId', '==', id),
      limit(200)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach(doc => msgs.push({ id: doc.id, ...doc.data() } as Message));
      
      // Sort in memory to avoid 412 error (missing composite index)
      msgs.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateA - dateB; // Ascending for chat
      });
      
      setMessages(msgs);
      setLoading(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
      setLoading(false);
    });

    return () => unsub();
  }, [id, user, navigate]);

  const triggerNotifications = async (text: string, type: 'public' | 'internal') => {
    if (!id || !user || !request) return;

    try {
      const recipients: string[] = [];
      
      if (type === 'public') {
        // Public chat recipients: Client, Pilot, Admins (excluding sender)
        if (request.userId !== user.uid) recipients.push(request.userId);
        if (request.pilotId && request.pilotId !== user.uid) recipients.push(request.pilotId);
      } else {
        // Internal chat recipients: Pilot, Admins (excluding sender)
        if (request.pilotId && request.pilotId !== user.uid) recipients.push(request.pilotId);
      }

      // Add Admins to both types (excluding sender)
      const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
      const adminsSnap = await getDocs(adminsQuery);
      adminsSnap.docs.forEach(doc => {
        if (doc.id !== user.uid && !recipients.includes(doc.id)) recipients.push(doc.id);
      });

      const senderName = user.firstName || user.username || 'Пользователь';
      const notificationTitle = type === 'internal' ? `Внутренний чат (#${id.slice(-4)})` : `Чат по задаче (#${id.slice(-4)})`;
      const notificationBody = `${senderName}: ${text}`;
      const link = `/task/${id}/chat`;

      await Promise.all(recipients.map(async (recipientId) => {
        // 1. In-app notification
        await addDoc(collection(db, 'notifications'), {
          userId: recipientId,
          title: notificationTitle,
          message: notificationBody,
          type: 'info',
          link,
          read: false,
          createdAt: new Date().toISOString()
        });

        // 2. Telegram notification
        const recipientSnap = await getDoc(doc(db, 'users', recipientId));
        const recipientData = recipientSnap.data();
        if (recipientData?.telegramId) {
          try {
            await fetch('/api/notifications/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                telegramId: recipientData.telegramId,
                message: `💬 ${notificationTitle}\n\n${notificationBody}\n\n🔗 Открыть чат: https://t.me/squadraby_bot/app?startapp=task_chat_${id}`
              })
            });
          } catch (e) {}
        }
      }));
    } catch (e) {
      console.error('Notification error:', e);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !id || !user) return;

    const text = newMessage.trim();
    const type = activeTab;
    setNewMessage('');

    try {
      await addDoc(collection(db, 'messages'), {
        requestId: id,
        senderId: user.uid,
        senderName: user.firstName || user.username || 'Admin',
        text,
        type,
        createdAt: new Date().toISOString()
      });
      triggerNotifications(text, type);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'messages');
      toast.error('Ошибка отправки сообщения');
      setNewMessage(text); // restore text
    }
  };

  if (loading) return <div className="p-6 text-center text-zinc-500">Загрузка чата...</div>;

  const quickResponses = [
    'Я на месте',
    'Начинаю работу',
    'Задерживаюсь на 5-10 мин',
    'Работа завершена',
    'Автомобиль принят',
    'Нужно уточнение по поручению'
  ];

  const sendQuickResponse = async (text: string) => {
    if (!id || !user) return;
    try {
      const type = activeTab;
      await addDoc(collection(db, 'messages'), {
        requestId: id,
        senderId: user.uid,
        senderName: user.firstName || user.username || 'Admin',
        text,
        type,
        createdAt: new Date().toISOString()
      });
      triggerNotifications(text, type);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      toast.error('Ошибка отправки');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md px-4 pt-4 pb-0 border-b border-zinc-900/50">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => navigate(-1)} className="p-2 bg-zinc-900 rounded-full border border-zinc-800 active:scale-90 transition-transform">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold uppercase tracking-wider">Чат по поручению</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-tighter">ID: #{id?.slice(-8)}</p>
          </div>
        </div>

        {/* Tab Switcher */}
        {(user?.role === 'admin' || user?.role === 'pilot') && (
          <div className="flex gap-4 px-2">
            <button 
              onClick={() => setActiveTab('public')}
              className={`pb-3 text-[10px] font-black uppercase tracking-[0.2em] relative transition-colors ${
                activeTab === 'public' ? 'text-amber-500' : 'text-zinc-500'
              }`}
            >
              С клиентом (Общий)
              {activeTab === 'public' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />}
            </button>
            <button 
              onClick={() => setActiveTab('internal')}
              className={`pb-3 text-[10px] font-black uppercase tracking-[0.2em] relative transition-colors ${
                activeTab === 'internal' ? 'text-purple-500' : 'text-zinc-500'
              }`}
            >
              Внутренний (Админ-Пилот)
              {activeTab === 'internal' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />}
            </button>
          </div>
        )}
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {messages.filter(m => m.type === activeTab || (!m.type && activeTab === 'public')).length === 0 ? (
          <div className="text-center text-zinc-500 mt-10 text-sm">
            Здесь пока нет сообщений. Напишите первым!
          </div>
        ) : (
          messages
            .filter(m => m.type === activeTab || (!m.type && activeTab === 'public'))
            .map((msg) => {
              const isMe = msg.senderId === user?.uid;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && msg.senderName && (
                    <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1 px-1">
                      {msg.senderName}
                    </span>
                  )}
                  <div 
                    className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                      isMe 
                      ? `${activeTab === 'internal' ? 'bg-purple-600' : 'bg-amber-500'} text-black rounded-tr-sm` 
                      : 'bg-zinc-900 border border-zinc-800 text-white rounded-tl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-zinc-600 mt-1 px-1">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-900 p-4 pb-safe">
        {request?.status !== 'completed' && request?.status !== 'cancelled' ? (
          <>
            {user?.role === 'pilot' && (
              <div className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar">
                {quickResponses.map((text) => (
                  <button
                    key={text}
                    onClick={() => sendQuickResponse(text)}
                    className="whitespace-nowrap px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-[10px] font-bold uppercase tracking-widest text-zinc-400 active:bg-amber-500 active:text-black transition-colors"
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={
                  activeTab === 'internal' 
                    ? "Внутреннее сообщение..." 
                    : (user?.role === 'client' ? "Сообщение пилоту..." : "Сообщение в чат...")
                }
                className={`flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-3 text-sm focus:outline-none ${
                  activeTab === 'internal' ? 'focus:border-purple-500' : 'focus:border-amber-500'
                } transition-colors`}
              />
              <button 
                type="submit"
                disabled={!newMessage.trim()}
                className={`w-12 h-12 ${activeTab === 'internal' ? 'bg-purple-600' : 'bg-amber-500'} text-black rounded-full flex items-center justify-center disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 transition-colors`}
              >
                <Send size={20} className="ml-1" />
              </button>
            </form>
          </>
        ) : (
          <div className="py-2 text-center">
            <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">
              Это архивное поручение. Чат доступен только для чтения.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
