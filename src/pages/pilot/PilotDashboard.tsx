import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import imageCompression from 'browser-image-compression';
import toast from 'react-hot-toast';
import { 
  Camera, 
  MapPin, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  ChevronRight,
  Car as CarIcon,
  Power,
  Filter,
  Navigation
} from 'lucide-react';
import { useFirebase } from '../../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, createNotification, collection, query, where, onSnapshot, doc, updateDoc, getDoc, orderBy, limit } from '../../firebase';

interface RequestData {
  id: string;
  userId: string;
  carId: string;
  serviceType: string;
  status: string;
  pilotId?: string;
  createdAt: string;
  pickupAddress?: string;
}

interface UserData {
  id: string;
  firstName: string;
  username: string;
  telegramId?: string | number;
}

interface CarData {
  id: string;
  make: string;
  model: string;
  plate: string;
}

const SERVICE_LABELS: Record<string, string> = {
  'logistics': 'Логистика',
  'valet': 'AIRPORT VALET',
  'parking': 'Night Drop',
  'bureaucracy': 'Бюрократия',
  'wash': 'Мойка',
  'service': 'СТО / ТО'
};

export default function PilotDashboard() {
  const navigate = useNavigate();
  const { user } = useFirebase();
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [availableRequests, setAvailableRequests] = useState<RequestData[]>([]);
  const [users, setUsers] = useState<Record<string, UserData>>({});
  const [cars, setCars] = useState<Record<string, CarData>>({});
  const [loading, setLoading] = useState(true);
  const [isOnShift, setIsOnShift] = useState(false);
  const [showNavModal, setShowNavModal] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState('');

  useEffect(() => {
    if (!user) return;

    // Fetch user shift status
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        setIsOnShift(doc.data().isOnShift || false);
      }
    });

    // Active requests (assigned to pilot)
    const qActive = query(
      collection(db, 'requests'), 
      where('pilotId', '==', user.uid), 
      where('status', 'in', ['accepted', 'in_progress', 'review'])
    );
    
    const unsubActive = onSnapshot(qActive, (snapshot) => {
      const reqs: RequestData[] = [];
      snapshot.forEach(doc => reqs.push({ id: doc.id, ...doc.data() } as RequestData));
      setRequests(reqs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
      setLoading(false);
    });

    // Available requests (Exchange) - only if on shift
    const qAvailable = query(
      collection(db, 'requests'),
      where('status', '==', 'pending'),
      limit(50)
    );

    const unsubAvailable = onSnapshot(qAvailable, (snapshot) => {
      const reqs: RequestData[] = [];
      snapshot.forEach(doc => reqs.push({ id: doc.id, ...doc.data() } as RequestData));
      
      // Sort in memory to avoid 412 error (missing composite index)
      reqs.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      setAvailableRequests(reqs.slice(0, 20));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
      setLoading(false);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usrs: Record<string, UserData> = {};
      snapshot.forEach(doc => {
        usrs[doc.id] = { id: doc.id, ...doc.data() } as UserData;
      });
      setUsers(usrs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    const unsubCars = onSnapshot(collection(db, 'cars'), (snapshot) => {
      const crs: Record<string, CarData> = {};
      snapshot.forEach(doc => {
        crs[doc.id] = { id: doc.id, ...doc.data() } as CarData;
      });
      setCars(crs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cars');
      setLoading(false);
    });

    return () => {
      unsubUser();
      unsubActive();
      unsubAvailable();
      unsubUsers();
      unsubCars();
    };
  }, [user]);

  const toggleShift = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        isOnShift: !isOnShift
      });
      toast.success(isOnShift ? 'Вы ушли со смены' : 'Вы вышли на смену');
    } catch (error) {
      toast.error('Ошибка при смене статуса');
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    if (!user) return;
    
    // Check if already has active task
    if (requests.length > 0) {
      toast.error('У вас уже есть активное поручение');
      return;
    }

    try {
      await updateDoc(doc(db, 'requests', requestId), {
        pilotId: user.uid,
        status: 'accepted'
      });
      toast.success('Поручение принято');
    } catch (error) {
      toast.error('Ошибка при принятии поручения');
    }
  };

  const openNavigation = (address: string) => {
    if (!address) return;
    setSelectedAddress(address);
    setShowNavModal(true);
  };

  const getNavLinks = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    return [
      { name: 'Яндекс Карты', url: `yandexmaps://maps.yandex.ru/?text=${encodedAddress}`, fallback: `https://yandex.ru/maps/?text=${encodedAddress}` },
      { name: 'Google Maps', url: `comgooglemaps://?q=${encodedAddress}`, fallback: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}` },
      { name: 'Apple Maps', url: `maps://?q=${encodedAddress}`, fallback: `https://maps.apple.com/?q=${encodedAddress}` }
    ];
  };

  const handleUpdateStatus = async (requestId: string, newStatus: string) => {
    try {
      const reqRef = doc(db, 'requests', requestId);
      const reqSnap = await getDoc(reqRef);
      if (!reqSnap.exists()) return;
      
      const reqData = reqSnap.data();
      await updateDoc(reqRef, { status: newStatus });

      // Create notification for client
      const statusLabels: Record<string, string> = {
        'in_progress': 'взята в работу',
        'completed': 'успешно завершена'
      };

      const title = 'Обновление статуса';
      const serviceName = SERVICE_LABELS[reqData.serviceType] || reqData.serviceType;
      const body = `Ваше поручение на услугу "${serviceName}" ${statusLabels[newStatus] || newStatus}.`;

      await createNotification(
        reqData.userId,
        title,
        body,
        newStatus === 'completed' ? 'success' : 'info',
        `/task/${requestId}`
      );

      const clientUser = users[reqData.userId];
      if (clientUser?.telegramId) {
        try {
          await fetch('/api/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              telegramId: clientUser.telegramId,
              message: `🔄 ${title}\n\n${body}\n\nОткройте приложение для деталей.`
            })
          });
        } catch (e) {
          console.error('Failed to send Telegram notification to client:', e);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-zinc-500">Загрузка поручений...</div>;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6 mt-2 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Кабинет пилота</h1>
          <p className="text-zinc-400 text-sm mt-1">{user?.firstName}</p>
        </div>
        <button 
          onClick={toggleShift}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
            isOnShift 
            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500' 
            : 'bg-zinc-800 border-zinc-700 text-zinc-500'
          }`}
        >
          <Power size={16} className={isOnShift ? 'animate-pulse' : ''} />
          <span className="text-xs font-bold uppercase tracking-widest">
            {isOnShift ? 'На смене' : 'Не на смене'}
          </span>
        </button>
      </header>

      {/* Active Tasks */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Мои активные поручения</h2>
          {requests.length > 0 && (
            <span className="w-5 h-5 bg-amber-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
              {requests.length}
            </span>
          )}
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-8 bg-zinc-900/50 border border-dashed border-zinc-800 rounded-2xl">
            <p className="text-zinc-600 text-xs uppercase tracking-widest">Нет активных поручений</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map(req => {
              const client = users[req.userId];
              const car = cars[req.carId];
              const isAccepted = req.status === 'accepted';
              const isReview = req.status === 'review';
              
              return (
                <div key={req.id} className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 shadow-xl shadow-black/20">
                  <div className="flex justify-between items-start mb-4">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest ${
                      isAccepted ? 'bg-amber-500/20 text-amber-500' : 
                      isReview ? 'bg-blue-500/20 text-blue-500' : 
                      'bg-emerald-500/20 text-emerald-500'
                    }`}>
                      {isAccepted ? 'Назначен' : isReview ? 'На проверке' : 'В работе'}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">{new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="font-bold text-lg text-white">{client?.firstName || 'Клиент'}</h3>
                      <p className="text-zinc-500 text-xs">@{client?.username || 'user'}</p>
                    </div>
                    <Link to={`/task/${req.id}`} className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
                      <ChevronRight size={20} />
                    </Link>
                  </div>

                  <div className="p-3 bg-black/40 rounded-xl border border-zinc-800 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <CarIcon size={16} className="text-zinc-500" />
                        <span className="text-sm text-zinc-300">{car ? `${car.make} ${car.model}` : 'Автомобиль'}</span>
                      </div>
                      <button 
                        onClick={() => openNavigation(req.pickupAddress || '')}
                        className="p-2 bg-zinc-800 rounded-lg text-amber-500 active:scale-90 transition-transform"
                      >
                        <Navigation size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin size={16} className="text-zinc-500" />
                      <span className="text-xs text-zinc-400">
                        {req.serviceType === 'logistics' ? 'Логистика' : 
                         req.serviceType === 'valet' ? 'Валет' : 
                         req.serviceType === 'parking' ? 'Паркинг' : 
                         req.serviceType === 'bureaucracy' ? 'Бюрократия' : 
                         req.serviceType === 'wash' ? 'Мойка' : 'СТО / ТО'}
                      </span>
                    </div>
                  </div>

                  {isAccepted ? (
                    <button 
                      onClick={() => navigate(`/task/${req.id}`)}
                      className="w-full py-3 bg-amber-500 text-black text-xs font-bold uppercase tracking-widest rounded-xl active:scale-[0.98] transition-transform"
                    >
                      Начать выполнение
                    </button>
                  ) : isReview ? (
                    <div className="text-center py-2 text-zinc-500 text-[10px] uppercase tracking-widest">
                      Ожидание подтверждения админом
                    </div>
                  ) : (
                    <Link 
                      to={`/task/${req.id}`}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-xl active:scale-[0.98] transition-transform"
                    >
                      Открыть управление
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available Tasks (Exchange) */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Биржа поручений</h2>
          <button className="p-2 text-zinc-500">
            <Filter size={16} />
          </button>
        </div>

        {!isOnShift ? (
          <div className="text-center py-12 bg-zinc-900/30 border border-zinc-800 rounded-2xl">
            <Power size={32} className="mx-auto mb-4 text-zinc-700" />
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-4">Выйдите на смену,<br/>чтобы видеть поручения</p>
            <button 
              onClick={toggleShift}
              className="px-6 py-2 bg-zinc-800 text-white text-[10px] font-bold uppercase tracking-widest rounded-full"
            >
              Выйти на смену
            </button>
          </div>
        ) : availableRequests.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900/30 border border-zinc-800 rounded-2xl">
            <p className="text-zinc-600 text-xs uppercase tracking-widest">Нет доступных поручений</p>
          </div>
        ) : (
          <div className="space-y-3">
            {availableRequests.map(req => {
              const car = cars[req.carId];
              
              return (
                <div key={req.id} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-tighter">
                        {req.serviceType === 'logistics' ? 'Логистика' : 
                         req.serviceType === 'valet' ? 'Валет' : 
                         req.serviceType === 'parking' ? 'Паркинг' : 
                         req.serviceType === 'bureaucracy' ? 'Бюрократия' : 
                         req.serviceType === 'wash' ? 'Мойка' : 'Сервис'}
                      </span>
                      <span className="text-[10px] text-zinc-600">•</span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white mb-1">
                      {car ? `${car.make} ${car.model}` : 'Автомобиль'}
                    </div>
                    <div className="flex items-center gap-1 text-zinc-500">
                      <MapPin size={10} />
                      <span className="text-[10px] uppercase tracking-tight">Центр • 2.4 км</span>
                    </div>
                  </div>
                  
                  <div className="text-right ml-4">
                    <button 
                      onClick={() => handleAcceptRequest(req.id)}
                      className="px-4 py-2 bg-accent text-white text-[10px] font-bold uppercase tracking-widest rounded-lg active:scale-95 transition-transform"
                    >
                      Взять
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Navigation Modal */}
      {showNavModal && (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 rounded-t-3xl p-6 pb-[max(env(safe-area-inset-bottom),2.5rem)] animate-in slide-in-from-bottom-full duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold uppercase tracking-widest">Выбрать навигатор</h3>
              <button onClick={() => setShowNavModal(false)} className="p-2 bg-zinc-800 rounded-full">
                <AlertTriangle size={20} className="rotate-180" />
              </button>
            </div>
            <div className="space-y-3">
              {getNavLinks(selectedAddress).map((nav) => (
                <button
                  key={nav.name}
                  onClick={() => {
                    window.location.href = nav.url;
                    setTimeout(() => {
                      window.open(nav.fallback, '_blank');
                    }, 500);
                    setShowNavModal(false);
                  }}
                  className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-3"
                >
                  {nav.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
