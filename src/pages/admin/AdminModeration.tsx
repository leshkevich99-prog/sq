import React, { useState, useEffect } from 'react';
import { Check, X, Car, Info } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { db, handleFirestoreError, OperationType, collection, onSnapshot, doc, updateDoc, deleteDoc, query, where } from '../../firebase';
import toast from 'react-hot-toast';

interface CarData {
  id: string;
  userId: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  isApproved: boolean;
  createdAt: string;
}

interface UserData {
  id: string;
  firstName: string;
  username: string;
}

export default function AdminModeration() {
  const [activeTab, setActiveTab] = useState<'cars' | 'pilots'>('cars');
  const [cars, setCars] = useState<CarData[]>([]);
  const [unverifiedPilots, setUnverifiedPilots] = useState<UserData[]>([]);
  const [users, setUsers] = useState<Record<string, UserData>>({});
  const [loading, setLoading] = useState(true);
  const [selectedCar, setSelectedCar] = useState<CarData | null>(null);

  useEffect(() => {
    // Fetch unapproved cars
    const qCars = query(collection(db, 'cars'), where('isApproved', '==', false));
    const unsubCars = onSnapshot(qCars, (snapshot) => {
      const unapprovedCars: CarData[] = [];
      snapshot.forEach(doc => {
        unapprovedCars.push({ id: doc.id, ...doc.data() } as CarData);
      });
      setCars(unapprovedCars);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'cars'));

    // Fetch unverified pilots
    const qPilots = query(collection(db, 'users'), where('role', '==', 'pilot'), where('isVerified', '==', false));
    const unsubPilots = onSnapshot(qPilots, (snapshot) => {
      const unvPilots: UserData[] = [];
      snapshot.forEach(doc => {
        unvPilots.push({ id: doc.id, ...doc.data() } as UserData);
      });
      setUnverifiedPilots(unvPilots);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    // Fetch users for mapping
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const userMap: Record<string, UserData> = {};
      snapshot.forEach(doc => {
        userMap[doc.id] = { id: doc.id, ...doc.data() } as UserData;
      });
      setUsers(userMap);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => {
      unsubCars();
      unsubPilots();
      unsubUsers();
    };
  }, []);

  const handleApprovePilot = async (pilotId: string) => {
    const toastId = toast.loading('Верификация пилота...');
    try {
      await updateDoc(doc(db, 'users', pilotId), { isVerified: true });
      toast.success('Пилот верифицирован', { id: toastId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${pilotId}`);
      toast.error('Ошибка при верификации', { id: toastId });
    }
  };

  const handleApprove = async (carId: string) => {
    const toastId = toast.loading('Одобрение автомобиля...');
    try {
      await updateDoc(doc(db, 'cars', carId), { isApproved: true });
      if (selectedCar?.id === carId) setSelectedCar(null);
      toast.success('Автомобиль одобрен', { id: toastId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cars/${carId}`);
      toast.error('Ошибка при одобрении', { id: toastId });
    }
  };

  const handleReject = async (carId: string) => {
    const confirmMsg = 'Вы уверены, что хотите отклонить и удалить этот автомобиль?';
    const proceed = await new Promise<boolean>((resolve) => {
      try {
        WebApp.showConfirm(confirmMsg, (ok) => resolve(ok));
      } catch (e) {
        resolve(window.confirm(confirmMsg));
      }
    });

    if (!proceed) return;

    const toastId = toast.loading('Отклонение автомобиля...');
    try {
      await deleteDoc(doc(db, 'cars', carId));
      if (selectedCar?.id === carId) setSelectedCar(null);
      toast.success('Автомобиль отклонен и удален', { id: toastId });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `cars/${carId}`);
      toast.error('Ошибка при отклонении', { id: toastId });
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6 mt-2">
        <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Модерация</h1>
        <p className="text-zinc-400 text-sm mt-1">Проверка автомобилей и пилотов</p>
      </header>

      <div className="flex gap-2 mb-6">
        <button 
          onClick={() => setActiveTab('cars')}
          className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'cars' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'}`}
        >
          Автомобили ({cars.length})
        </button>
        <button 
          onClick={() => setActiveTab('pilots')}
          className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'pilots' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'}`}
        >
          Пилоты ({unverifiedPilots.length})
        </button>
      </div>

      {loading ? (
        <div className="text-center text-zinc-500 py-8">Загрузка...</div>
      ) : activeTab === 'cars' ? (
        cars.length === 0 ? (
          <div className="text-center text-zinc-500 py-8 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
            Нет автомобилей, ожидающих проверки
          </div>
        ) : (
          <div className="space-y-4">
            {cars.map(car => {
              const owner = users[car.userId];
              const ownerName = owner ? `${owner.firstName} (@${owner.username})` : 'Неизвестный клиент';
              
              return (
                <div key={car.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-zinc-800">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-medium px-2 py-1 bg-amber-500/20 text-amber-500 rounded uppercase tracking-wider">Ожидает проверки</span>
                      <span className="text-xs text-zinc-500">{new Date(car.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h3 className="font-bold text-lg mb-1">{car.make} {car.model} ({car.year})</h3>
                    <p className="text-sm text-zinc-400">Владелец: {ownerName}</p>
                  </div>
                  
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-4 text-sm font-medium">
                      <Car size={16} className="text-zinc-400" />
                      <span>Гос. номер: <span className="text-white uppercase">{car.plate}</span></span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button 
                        onClick={() => setSelectedCar(car)}
                        className="flex items-center justify-center gap-2 py-3 bg-zinc-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-zinc-700 transition-colors"
                      >
                        <Info size={16} /> Детали
                      </button>
                      <button 
                        onClick={() => handleReject(car.id)}
                        className="flex items-center justify-center gap-2 py-3 bg-red-500/10 text-red-500 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-red-500/20 transition-colors"
                      >
                        <X size={16} /> Отклонить
                      </button>
                      <button 
                        onClick={() => handleApprove(car.id)}
                        className="flex items-center justify-center gap-2 py-3 bg-emerald-500/10 text-emerald-500 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-emerald-500/20 transition-colors"
                      >
                        <Check size={16} /> Одобрить
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        unverifiedPilots.length === 0 ? (
          <div className="text-center text-zinc-500 py-8 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
            Нет пилотов, ожидающих верификации
          </div>
        ) : (
          <div className="space-y-4">
            {unverifiedPilots.map(pilot => (
              <div key={pilot.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold">
                      {pilot.firstName[0]}
                    </div>
                    <div>
                      <h3 className="font-bold">{pilot.firstName}</h3>
                      <p className="text-xs text-zinc-500">@{pilot.username}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 bg-amber-500/20 text-amber-500 rounded uppercase tracking-wider">Новый пилот</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    className="flex items-center justify-center gap-2 py-3 bg-zinc-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-zinc-700 transition-colors"
                  >
                    <Info size={16} /> Документы
                  </button>
                  <button 
                    onClick={() => handleApprovePilot(pilot.id)}
                    className="flex items-center justify-center gap-2 py-3 bg-emerald-500/10 text-emerald-500 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-emerald-500/20 transition-colors"
                  >
                    <Check size={16} /> Верифицировать
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {selectedCar && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold uppercase tracking-tighter">Детали автомобиля</h2>
              <button onClick={() => setSelectedCar(null)} className="text-zinc-500 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="bg-black rounded-xl p-4 border border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1 uppercase tracking-wider">Марка и модель</div>
                <div className="font-medium text-lg">{selectedCar.make} {selectedCar.model}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black rounded-xl p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 mb-1 uppercase tracking-wider">Год выпуска</div>
                  <div className="font-mono text-lg">{selectedCar.year}</div>
                </div>
                <div className="bg-black rounded-xl p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 mb-1 uppercase tracking-wider">Гос. номер</div>
                  <div className="font-mono text-lg uppercase">{selectedCar.plate}</div>
                </div>
              </div>

              <div className="bg-black rounded-xl p-4 border border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1 uppercase tracking-wider">Владелец</div>
                <div className="font-medium">
                  {users[selectedCar.userId] ? `${users[selectedCar.userId].firstName} (@${users[selectedCar.userId].username})` : 'Неизвестно'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => handleReject(selectedCar.id)}
                className="flex items-center justify-center gap-2 py-3 bg-red-500/10 text-red-500 text-sm font-bold uppercase tracking-wider rounded-xl hover:bg-red-500/20 transition-colors"
              >
                <X size={18} /> Отклонить
              </button>
              <button 
                onClick={() => handleApprove(selectedCar.id)}
                className="flex items-center justify-center gap-2 py-3 bg-emerald-500/10 text-emerald-500 text-sm font-bold uppercase tracking-wider rounded-xl hover:bg-emerald-500/20 transition-colors"
              >
                <Check size={18} /> Одобрить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
