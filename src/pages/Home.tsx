import React, { useState, useEffect } from 'react';
import { ArrowRight, ShieldCheck, MapPin, User, Car as CarIcon, Phone, Plus, Clock, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, collection, query, where, onSnapshot, limit, orderBy, getDocs, doc, getDoc } from '../firebase';
import { TARIFFS, TariffType } from '../config/tariffs';

interface ServiceRequest {
  id: string;
  serviceType: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  carId: string;
  createdAt: string;
  pilotId?: string;
}

interface Car {
  id: string;
  make: string;
  model: string;
  plate: string;
}

import { BynIcon } from '../components/BynIcon';
import { Skeleton } from '../components/Skeleton';

export default function Home() {
  const { user } = useFirebase();
  const [activeRequest, setActiveRequest] = useState<ServiceRequest | null>(null);
  const [pilot, setPilot] = useState<any>(null);
  const [recentRequests, setRecentRequests] = useState<ServiceRequest[]>([]);
  const [cars, setCars] = useState<Record<string, Car>>({});
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Fetch cars to map carId to car details
    const fetchCars = async () => {
      try {
        const q = query(collection(db, 'cars'), where('userId', '==', user.uid));
        const snapshot = await getDocs(q);
        const carsMap: Record<string, Car> = {};
        snapshot.forEach(doc => {
          carsMap[doc.id] = { id: doc.id, ...doc.data() } as Car;
        });
        setCars(carsMap);
      } catch (error) {
        console.error("Error fetching cars:", error);
      }
    };

    fetchCars();

    // Fetch transactions for balance
    const txQuery = query(collection(db, 'transactions'), where('userId', '==', user.uid));
    const unsubscribeTx = onSnapshot(txQuery, (snapshot) => {
      let currentBalance = 0;
      snapshot.forEach(doc => {
        const tx = doc.data();
        if (tx.type === 'deposit') currentBalance += tx.amount;
        if (tx.type === 'deposit_deduction') currentBalance -= tx.amount;
      });
      setBalance(currentBalance);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    // Listen to active and recent requests
    const q = query(
      collection(db, 'requests'), 
      where('userId', '==', user.uid),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests: ServiceRequest[] = [];
      snapshot.forEach((doc) => {
        requests.push({ id: doc.id, ...doc.data() } as ServiceRequest);
      });

      // Sort in memory to avoid 412 error (missing composite index)
      requests.sort((a, b) => {
        const parseDate = (val: any) => {
          if (!val) return 0;
          if (typeof val === 'object' && val.seconds) return val.seconds * 1000;
          if (typeof val.toDate === 'function') return val.toDate().getTime();
          return new Date(val).getTime() || 0;
        };
        return parseDate(b.createdAt) - parseDate(a.createdAt);
      });

      // Find active request (first one that is not completed or cancelled)
      const active = requests.find(r => r.status !== 'completed' && r.status !== 'cancelled');
      setActiveRequest(active || null);
      
      // Specifically look for active test-drive to update the banner independently if needed
      const hasActiveTestDrive = requests.some(r => r.serviceType === 'test_drive' && r.status !== 'completed' && r.status !== 'cancelled');
      (window as any).hasActiveTestDrive = hasActiveTestDrive; // Optional: for global access if needed
      
      // If there's an active request with a pilot, fetch pilot data
      if (active?.pilotId) {
        getDoc(doc(db, 'users', active.pilotId)).then(pilotSnap => {
          if (pilotSnap.exists()) {
            setPilot(pilotSnap.data());
          }
        });
      } else {
        setPilot(null);
      }
      
      // Filter out active from recent for the bottom list
      setRecentRequests(requests.filter(r => r.id !== active?.id).slice(0, 3));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
      setLoading(false);
    });

    return () => {
      unsubscribe();
      unsubscribeTx();
    };
  }, [user]);

  if (loading) {
    return (
      <div className="p-4 space-y-6">
        <div className="flex flex-col items-center mt-4 mb-8">
          <Skeleton className="w-48 h-10 mb-3" />
          <Skeleton className="w-32 h-3 mb-4" />
          <Skeleton className="w-24 h-3" />
        </div>
        <Skeleton className="w-full h-48 rounded-2xl" />
        <Skeleton className="w-full h-32 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="w-full h-24 rounded-xl" />
          <Skeleton className="w-full h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  const getTariffTotals = (subscriptionName?: string) => {
    if (!subscriptionName) return null;
    const tariff = Object.values(TARIFFS).find(t => t.name === subscriptionName);
    return tariff || null;
  };

  const tariffTotals = getTariffTotals(user?.subscription);

  const hasCars = Object.keys(cars).length > 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8 mt-4 relative flex flex-col items-center text-center">
        <h1 className="text-5xl font-serif font-normal tracking-widest uppercase mb-3 text-white">Squadra</h1>
        <p className="text-zinc-400 text-[9px] sm:text-[10px] uppercase tracking-[0.25em] font-medium mb-4">Автомобильный консьерж-сервис</p>
        <p className="text-amber-500 text-[11px] uppercase tracking-[0.3em] font-serif">Вы только водите</p>
      </header>

      {/* Balance Warning */}
      {balance !== null && balance < 400 && user?.subscription && (
        <section className="mb-8">
          <Link to="/finances" className="block">
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center justify-between hover:bg-red-500/20 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <div className="text-sm font-bold text-red-500 uppercase tracking-wider">Низкий баланс</div>
                  <div className="text-xs text-red-400/80">Остаток: {balance.toFixed(2)} <BynIcon size="0.6em" className="text-red-400/80" />. Пополните депозит.</div>
                </div>
              </div>
              <ArrowRight size={20} className="text-red-500" />
            </div>
          </Link>
        </section>
      )}

      {/* New User Welcome / Onboarding */}
      {!hasCars && !activeRequest && (
        <section className="mb-8">
          <div className="bg-gradient-to-br from-zinc-900 to-black rounded-2xl p-6 border border-zinc-800 relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-xl font-bold mb-2 uppercase tracking-tighter">Начните с первого авто</h2>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                Чтобы пользоваться услугами консьержа, добавьте ваш первый автомобиль в бортовой журнал.
              </p>
              <Link 
                to="/garage" 
                className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-zinc-200 transition-colors"
              >
                <Plus size={18} /> Добавить авто
              </Link>
            </div>
            <CarIcon className="absolute -right-10 -bottom-10 text-zinc-800/20 w-48 h-48 -rotate-12" />
          </div>
        </section>
      )}

      {/* Active Task Tracker */}
      {activeRequest ? (
        <section className="mb-8">
          <Link to={`/task/${activeRequest.id}`} className="block group">
            <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 relative overflow-hidden group-hover:border-amber-500/50 transition-colors">
              <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-500">Активное поручение</span>
              </div>
              <span className="text-xs text-zinc-500">
                {activeRequest.status === 'pending' ? 'Ожидание пилота' : 
                 activeRequest.status === 'accepted' ? 'Пилот назначен' :
                 activeRequest.status === 'in_progress' ? 'В процессе' : 'Завершено'}
              </span>
            </div>
            
            <h3 className="font-bold text-lg mb-1">
              {activeRequest.serviceType === 'logistics' ? 'Логистика' : 
               activeRequest.serviceType === 'valet' ? 'Валет' : 
               activeRequest.serviceType === 'parking' ? 'Паркинг' : 
               activeRequest.serviceType === 'bureaucracy' ? 'Бюрократия' : 
               activeRequest.serviceType === 'wash' ? 'Мойка' : 'СТО / ТО'}
            </h3>
            <p className="text-sm text-zinc-400 mb-5">
              {cars[activeRequest.carId]?.make} {cars[activeRequest.carId]?.model}
            </p>

            <div className="relative pt-2">
              <div className="absolute top-4 left-0 w-full h-0.5 bg-zinc-800"></div>
              <div 
                className="absolute top-4 left-0 h-0.5 bg-amber-500 transition-all duration-1000"
                style={{ 
                  width: activeRequest.status === 'pending' ? '10%' : 
                         activeRequest.status === 'accepted' ? '33%' : 
                         activeRequest.status === 'in_progress' ? '66%' : '100%' 
                }}
              ></div>
              
              <div className="relative flex justify-between">
                <StatusStep label="Поручение" active={true} />
                <StatusStep label="В работе" active={activeRequest.status === 'accepted' || activeRequest.status === 'in_progress'} />
                <StatusStep label="Возврат" active={activeRequest.status === 'completed'} />
              </div>
            </div>

            {/* Pilot Info */}
            {(activeRequest.status === 'accepted' || activeRequest.status === 'in_progress') && (
              <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden">
                    {pilot?.photoUrl ? (
                      <img src={pilot.photoUrl} alt={pilot.firstName} className="w-full h-full object-cover" />
                    ) : (
                      <User size={20} className="text-zinc-500" />
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-tighter">Ваш пилот</div>
                    <div className="text-sm font-bold">{pilot?.firstName || 'Загрузка...'}</div>
                  </div>
                </div>
                {pilot?.phone && (
                  <a href={`tel:${pilot.phone}`} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-colors">
                    <Phone size={18} />
                  </a>
                )}
              </div>
            )}
          </div>
          </Link>
        </section>
      ) : (
        <section className="mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
            <p className="text-zinc-400 text-sm mb-4">У вас нет активных поручений</p>
            <Link 
              to="/order" 
              className="inline-flex items-center justify-center px-6 py-2 bg-white text-black rounded-full text-sm font-bold uppercase tracking-wider"
            >
              Вызвать пилота
            </Link>
          </div>
        </section>
      )}

      {user?.subscription ? (
        <section className="mb-8">
          <div className="bg-zinc-900 rounded-2xl p-5 relative overflow-hidden border border-zinc-800">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <ShieldCheck size={120} />
            </div>
            <div className="relative z-10">
              <div className="inline-block px-2 py-1 bg-zinc-800 text-xs rounded-md text-zinc-300 mb-3 uppercase tracking-wider font-medium">
                Активный тариф
              </div>
              <h2 className="text-2xl font-bold mb-1">
                {user.subscription}
              </h2>
              <div className="flex gap-4 mb-4 mt-2">
                <div className="bg-black/50 rounded-lg px-3 py-2 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Логистика</div>
                  <div className="text-sm font-bold text-white">
                    {(user.limits?.logistics ?? user.quotas?.logistics ?? 0)} {tariffTotals ? `/ ${tariffTotals.logistics}` : ''}
                  </div>
                </div>
                <div className="bg-black/50 rounded-lg px-3 py-2 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Мойки</div>
                  <div className="text-sm font-bold text-white">
                    {(user.limits?.wash ?? user.quotas?.wash ?? 0)} {tariffTotals ? `/ ${tariffTotals.wash}` : ''}
                  </div>
                </div>
              </div>
              <p className="text-zinc-400 text-sm mb-4">
                Управляйте вашими лимитами и услугами
              </p>
              <Link 
                to="/tariffs"
                className="inline-flex items-center text-sm font-medium text-white hover:text-zinc-300 transition-colors"
              >
                Управление тарифом <ArrowRight size={16} className="ml-1" />
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          {recentRequests.some(r => r.serviceType === 'test_drive' && r.status !== 'completed' && r.status !== 'cancelled') || activeRequest?.serviceType === 'test_drive' ? (
            <section className="mb-8">
              <Link to={`/task/${activeRequest.id}`} className="block">
                <div className="bg-zinc-900 rounded-2xl p-5 relative overflow-hidden border border-emerald-500/30 hover:border-emerald-500/50 transition-colors">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <CarIcon size={120} />
                  </div>
                  <div className="relative z-10">
                    <div className="inline-block px-2 py-1 bg-emerald-500/20 text-emerald-500 text-[10px] rounded-md mb-3 uppercase tracking-wider font-bold">
                      {activeRequest?.status === 'pending' ? 'Заявка принята' : 
                       activeRequest?.status === 'accepted' ? 'Пилот назначен' :
                       activeRequest?.status === 'in_progress' ? 'Пилот в пути' : 'Вы записаны'}
                    </div>
                    <h2 className="text-2xl font-bold mb-1 uppercase tracking-tighter">TEST DRIVE</h2>
                    <p className="text-zinc-400 text-sm mb-4">
                      {activeRequest?.status === 'pending' ? 'Ожидайте звонка для подтверждения деталей' : 
                       activeRequest?.status === 'accepted' ? 'Ваш пилот скоро свяжется с вами' :
                       activeRequest?.status === 'in_progress' ? 'Тест-драйв уже начался!' : 
                       'Ожидайте подтверждения или звонка пилота'}
                    </p>
                    <div className="inline-flex items-center text-sm font-bold text-emerald-500 uppercase tracking-wider">
                      {activeRequest?.status === 'in_progress' ? 'Смотреть статус' : 'Детали записи'} <ArrowRight size={16} className="ml-1" />
                    </div>
                  </div>
                </div>
              </Link>
            </section>
          ) : (
            <section className="mb-8">
              <Link to="/test-drive" className="block">
                <div className="bg-zinc-900 rounded-2xl p-5 relative overflow-hidden border border-amber-500/30 hover:border-amber-500/50 transition-colors">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <CarIcon size={120} />
                  </div>
                  <div className="relative z-10">
                    <div className="inline-block px-2 py-1 bg-amber-500/20 text-amber-500 text-[10px] rounded-md mb-3 uppercase tracking-wider font-bold">
                      Доступен тест-драйв
                    </div>
                    <h2 className="text-2xl font-bold mb-1 uppercase tracking-tighter">TEST DRIVE</h2>
                    <p className="text-zinc-400 text-sm mb-4">
                      Попробуйте наш сервис за 500 Br
                    </p>
                    <div className="inline-flex items-center text-sm font-bold text-amber-500 uppercase tracking-wider">
                      Записаться <ArrowRight size={16} className="ml-1" />
                    </div>
                  </div>
                </div>
              </Link>
            </section>
          )}

          <section className="mb-8">
            <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">Выбор тарифа</h3>
              <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
                Выберите подходящий тарифный план для постоянного обслуживания вашего автомобиля.
              </p>
              <Link 
                to="/tariffs"
                className="inline-flex items-center justify-center w-full bg-white text-black py-3 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-zinc-200 transition-colors"
              >
                Посмотреть тарифы <ArrowRight size={16} className="ml-2" />
              </Link>
            </div>
          </section>

          <section className="mb-8">
            <div className="bg-zinc-900/40 rounded-2xl p-5 border border-zinc-800/50 flex items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white mb-1">Squadra на главном экране</h3>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Добавьте ярлык на рабочий стол для мгновенного доступа к сервису
                </p>
              </div>
              <button 
                onClick={() => {
                  const WebApp = (window as any).Telegram?.WebApp;
                  if (WebApp) {
                    if (typeof WebApp.addToHomeScreen === 'function') {
                      WebApp.addToHomeScreen();
                    } else {
                      WebApp.showAlert('Чтобы добавить приложение на главный экран:\n\n1. Нажмите на три точки (⋮) в верхнем углу\n2. Выберите "Добавить на гл. экран"\n\nТеперь Squadra всегда под рукой!');
                    }
                  }
                }}
                className="px-4 py-2 bg-zinc-800 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-zinc-700 transition-colors shrink-0"
              >
                Добавить
              </button>
            </div>
          </section>
        </>
      )}

      <section className="mb-8">
        <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">Быстрые действия</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <QuickAction to="/order" icon={<MapPin size={20} />} label="Вызвать пилота" />
          <QuickAction to="/garage" icon={<CarIcon size={20} />} label={`Бортовой журнал (${Object.keys(cars).length})`} />
        </div>
      </section>

      {recentRequests.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">Последние события</h3>
          <div className="space-y-3">
            {recentRequests.map(req => (
              <EventCard 
                key={req.id}
                id={req.id}
                title={req.serviceType === 'logistics' ? 'Логистика' : 
                       req.serviceType === 'valet' ? 'Валет' : 
                       req.serviceType === 'parking' ? 'Паркинг' : 
                       req.serviceType === 'bureaucracy' ? 'Бюрократия' : 
                       req.serviceType === 'wash' ? 'Мойка' : 'СТО / ТО'} 
                date={new Date(req.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} 
                car={`${cars[req.carId]?.make || ''} ${cars[req.carId]?.model || ''}`} 
                status={req.status === 'completed' ? 'Выполнено' : req.status === 'cancelled' ? 'Отменено' : req.status} 
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusStep({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`w-5 h-5 rounded-full border-4 border-zinc-900 z-10 ${active ? 'bg-amber-500' : 'bg-zinc-800'}`}></div>
      <span className={`text-[10px] uppercase font-medium ${active ? 'text-zinc-300' : 'text-zinc-500'}`}>{label}</span>
    </div>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-zinc-800 transition-colors active:scale-95">
      <div className="text-white">{icon}</div>
      <span className="text-xs font-medium text-center">{label}</span>
    </Link>
  );
}

function EventCard({ id, title, date, car, status }: { id: string; title: string; date: string; car: string; status: string }) {
  return (
    <Link to={`/task/${id}`} className="block">
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex justify-between items-center hover:bg-zinc-800 transition-colors">
        <div>
          <h4 className="font-medium text-sm">{title}</h4>
          <p className="text-xs text-zinc-500 mt-1">{car} • {date}</p>
        </div>
        <div className="text-[10px] uppercase tracking-wider px-2 py-1 bg-zinc-800 text-zinc-300 rounded">
          {status}
        </div>
      </div>
    </Link>
  );
}
