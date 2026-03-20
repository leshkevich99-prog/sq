import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType, collection, query, where, orderBy, onSnapshot, addDoc, getDoc, doc, limit } from '../firebase';
import { useFirebase } from '../components/FirebaseProvider';
import { ArrowLeft, Send } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  requestId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useFirebase();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
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
        const reqData = reqSnap.data();
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !id || !user) return;

    const text = newMessage.trim();
    setNewMessage('');

    try {
      await addDoc(collection(db, 'messages'), {
        requestId: id,
        senderId: user.uid,
        text,
        createdAt: new Date().toISOString()
      });
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
      await addDoc(collection(db, 'messages'), {
        requestId: id,
        senderId: user.uid,
        text,
        createdAt: new Date().toISOString()
      });
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      toast.error('Ошибка отправки');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-900 px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 bg-zinc-900 rounded-full border border-zinc-800">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold uppercase tracking-wider">Чат по поручению</h1>
          <p className="text-xs text-zinc-500">ID: {id?.slice(0, 8)}...</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {messages.length === 0 ? (
          <div className="text-center text-zinc-500 mt-10 text-sm">
            Здесь пока нет сообщений. Напишите первым!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user?.uid;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div 
                  className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                    isMe 
                    ? 'bg-amber-500 text-black rounded-tr-sm' 
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
            placeholder="Сообщение..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-3 text-sm focus:outline-none focus:border-amber-500 transition-colors"
          />
          <button 
            type="submit"
            disabled={!newMessage.trim()}
            className="w-12 h-12 bg-amber-500 text-black rounded-full flex items-center justify-center disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 transition-colors"
          >
            <Send size={20} className="ml-1" />
          </button>
        </form>
      </div>
    </div>
  );
}
