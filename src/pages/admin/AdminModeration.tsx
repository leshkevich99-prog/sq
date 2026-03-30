import React, { useState, useEffect } from 'react';
import { 
  Check, 
  X, 
  Car, 
  User, 
  Shield, 
  FileText, 
  Info,
  Calendar,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { db, handleFirestoreError, OperationType, collection, onSnapshot, query, where, updateDoc, doc, deleteDoc, getDoc } from '../../firebase';
import WebApp from '@twa-dev/sdk';
import toast from 'react-hot-toast';

interface CarData {
  id: string;
  userId: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  vin?: string;
  status: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  techPassportFront?: string;
  techPassportBack?: string;
  insuranceDate?: string;
  inspectionDate?: string;
  maintenanceSchedule?: string;
}

interface UserData {
  id: string;
  firstName: string;
  username: string;
  isPilot?: boolean;
  pilotStatus?: 'unverified' | 'verified' | 'rejected';
}

export default function AdminModeration() {
  const [cars, setCars] = useState<CarData[]>([]);
  const [unverifiedPilots, setUnverifiedPilots] = useState<UserData[]>([]);
  const [users, setUsers] = useState<Record<string, UserData>>({});
  const [activeTab, setActiveTab] = useState<'cars' | 'pilots'>('cars');
  const [loading, setLoading] = useState(true);
  const [selectedCar, setSelectedCar] = useState<CarData | null>(null);

  useEffect(() => {
    const qCars = query(collection(db, 'cars'), where('status', '==', 'pending'));
    const unsubCars = onSnapshot(qCars, (snapshot) => {
      const cList: CarData[] = [];
      snapshot.forEach(doc => {
        cList.push({ id: doc.id, ...doc.data() } as CarData);
      });
      setCars(cList);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'cars'));

    const qPilots = query(collection(db, 'users'), where('pilotStatus', '==', 'unverified'));
    const unsubPilots = onSnapshot(qPilots, (snapshot) => {
      const pList: UserData[] = [];
      snapshot.forEach(doc => {
        pList.push({ id: doc.id, ...doc.data() } as UserData);
      });
      setUnverifiedPilots(pList);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users/pilots'));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const uMap: Record<string, UserData> = {};
      snapshot.forEach(doc => {
        uMap[doc.id] = { id: doc.id, ...doc.data() } as UserData;
      });
      setUsers(uMap);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => {
      unsubCars();
      unsubPilots();
      unsubUsers();
    };
  }, []);

  const handleApprove = async (carId: string, updatedData?: Partial<CarData>) => {
    const toastId = toast.loading('Одобрение автомобиля...');
    try {
      await updateDoc(doc(db, 'cars', carId), {
        ...(updatedData || {}),
        status: 'verified',
        updatedAt: new Date().toISOString()
      });
      if (selectedCar?.id === carId) setSelectedCar(null);
      toast.success('Автомобиль успешно верифицирован', { id: toastId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cars/${carId}`);
      toast.error('Ошибка при верификации', { id: toastId });
    }
  };

  const handleApprovePilot = async (userId: string) => {
    const toastId = toast.loading('Верификация пилота...');
    try {
      await updateDoc(doc(db, 'users', userId), {
        pilotStatus: 'verified',
        isPilot: true
      });
      toast.success('Пилот верифицирован', { id: toastId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      toast.error('Ошибка при верификации', { id: toastId });
    }
  };

  const handleReject = async (carId: string) => {
    const proceed = await new Promise((resolve) => {
      const confirmMsg = 'Вы уверены, что хотите отклонить и удалить этот автомобиль?';
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
    <div className="animate-in fade-in duration-500 pb-20">
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md -mx-4 px-4 py-4 mb-6 border-b border-zinc-800">
        <h1 className="text-xl font-serif font-normal tracking-wide uppercase">Модерация</h1>
        <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-0.5">Проверка новых данных</p>
      </header>

      <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800 mb-6 mx-1">
        <button 
          onClick={() => setActiveTab('cars')}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'cars' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
        >
          Автомобили ({cars.length})
        </button>
        <button 
          onClick={() => setActiveTab('pilots')}
          className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'pilots' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
        >
          Пилоты ({unverifiedPilots.length})
        </button>
      </div>

      {loading ? (
        <div className="text-center text-zinc-500 py-12 flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-zinc-800 border-t-white rounded-full animate-spin" />
          <span className="text-[10px] uppercase tracking-widest">Загрузка...</span>
        </div>
      ) : activeTab === 'cars' ? (
        cars.length === 0 ? (
          <div className="text-center text-zinc-600 py-12 px-6 bg-zinc-900/30 rounded-3xl border border-dashed border-zinc-800 text-[10px] uppercase tracking-[0.2em] mt-4">
            Нет новых автомобилей
          </div>
        ) : (
          <div className="space-y-4 px-1">
            {cars.map(car => {
              const owner = users[car.userId];
              const ownerName = owner ? owner.firstName : 'Клиент';
              
              return (
                <div key={car.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
                  <div className="p-5 border-b border-zinc-800 bg-zinc-950/50">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[8px] font-bold px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded border border-amber-500/20 uppercase tracking-widest">Новое авто</span>
                      <span className="text-[9px] text-zinc-500 font-mono uppercase">#{car.id.slice(-6)}</span>
                    </div>
                    <h3 className="font-bold text-lg mb-0.5">{car.make} {car.model}</h3>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <User size={12} className="text-zinc-600" />
                      <span>{ownerName} (@{owner?.username || '---'})</span>
                    </div>
                  </div>
                  
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-black/40 p-3 rounded-2xl border border-zinc-800/50">
                        <label className="text-[8px] text-zinc-500 uppercase tracking-widest block mb-1">Гос. номер</label>
                        <div className="text-sm font-mono font-bold uppercase tracking-wider">{car.plate}</div>
                      </div>
                      <div className="bg-black/40 p-3 rounded-2xl border border-zinc-800/50">
                        <label className="text-[8px] text-zinc-500 uppercase tracking-widest block mb-1">Год выпуска</label>
                        <div className="text-sm font-mono font-bold">{car.year}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button 
                        onClick={() => setSelectedCar(car)}
                        className="flex flex-col items-center justify-center gap-1.5 py-4 bg-zinc-800 text-white rounded-2xl active:scale-95 transition-all border border-zinc-700 hover:bg-zinc-700"
                      >
                        <Info size={16} />
                        <span className="text-[8px] font-bold uppercase tracking-widest">Детали</span>
                      </button>
                      <button 
                        onClick={() => handleReject(car.id)}
                        className="flex flex-col items-center justify-center gap-1.5 py-4 bg-red-500/5 text-red-500 rounded-2xl active:scale-95 transition-all border border-red-500/10 hover:bg-red-500/10"
                      >
                        <X size={16} />
                        <span className="text-[8px] font-bold uppercase tracking-widest">Сброс</span>
                      </button>
                      <button 
                        onClick={() => handleApprove(car.id)}
                        className="flex flex-col items-center justify-center gap-1.5 py-4 bg-emerald-500 text-black rounded-2xl active:scale-95 transition-all shadow-lg shadow-emerald-500/10 font-bold"
                      >
                        <Check size={16} />
                        <span className="text-[8px] font-bold uppercase tracking-widest">ОК</span>
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
          <div className="text-center text-zinc-600 py-12 px-6 bg-zinc-900/30 rounded-3xl border border-dashed border-zinc-800 text-[10px] uppercase tracking-[0.2em] mt-4">
            Нет новых пилотов
          </div>
        ) : (
          <div className="space-y-4 px-1">
            {unverifiedPilots.map(pilot => (
              <div key={pilot.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl">
                <div className="flex justify-between items-center mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg font-bold border border-zinc-700">
                      {pilot.firstName[0]}
                    </div>
                    <div>
                      <h3 className="font-bold text-base">{pilot.firstName}</h3>
                      <p className="text-xs text-zinc-500 lowercase">@{pilot.username}</p>
                    </div>
                  </div>
                  <span className="text-[8px] font-bold px-2 py-1 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded uppercase tracking-widest">Кандидат</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    className="flex items-center justify-center gap-2 py-4 bg-zinc-800 text-white text-[10px] font-bold uppercase tracking-wider rounded-2xl border border-zinc-700 active:scale-95 transition-all"
                  >
                    <FileText size={16} /> Профиль
                  </button>
                  <button 
                    onClick={() => handleApprovePilot(pilot.id)}
                    className="flex items-center justify-center gap-2 py-4 bg-emerald-500 text-black text-[10px] font-bold uppercase tracking-wider rounded-2xl active:scale-95 transition-all shadow-lg shadow-emerald-500/10"
                  >
                    <Check size={16} /> Одобрить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {selectedCar && (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-md mx-auto bg-zinc-900 rounded-t-3xl sm:rounded-2xl sm:mb-4 animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] flex flex-col relative overflow-hidden">
            <div className="sticky top-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-b border-zinc-800/50 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold uppercase tracking-tighter">Детали автомобиля</h2>
              <button onClick={() => setSelectedCar(null)} className="text-zinc-500 hover:text-white p-2">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="bg-black rounded-xl p-4 border border-zinc-800 space-y-4">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Марка</label>
                  <input 
                    type="text" 
                    value={selectedCar.make} 
                    onChange={(e) => setSelectedCar({...selectedCar, make: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Модель</label>
                  <input 
                    type="text" 
                    value={selectedCar.model} 
                    onChange={(e) => setSelectedCar({...selectedCar, model: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black rounded-xl p-4 border border-zinc-800">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Год выпуска</label>
                  <input 
                    type="number" 
                    value={selectedCar.year} 
                    onChange={(e) => setSelectedCar({...selectedCar, year: parseInt(e.target.value)})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-3 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="bg-black rounded-xl p-4 border border-zinc-800">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Гос. номер</label>
                  <input 
                    type="text" 
                    value={selectedCar.plate} 
                    onChange={(e) => setSelectedCar({...selectedCar, plate: e.target.value.toUpperCase()})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-3 text-white font-mono uppercase focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="bg-black rounded-xl p-4 border border-zinc-800">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">VIN</label>
                <input 
                  type="text" 
                  value={selectedCar.vin || ''} 
                  onChange={(e) => setSelectedCar({...selectedCar, vin: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-3 text-white font-mono uppercase focus:outline-none focus:border-amber-500"
                  placeholder="Не указан"
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="bg-black rounded-xl p-4 border border-zinc-800">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Страховка до</label>
                  <input 
                    type="date" 
                    value={selectedCar.insuranceDate || ''} 
                    onChange={(e) => setSelectedCar({...selectedCar, insuranceDate: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-amber-500 [color-scheme:dark]"
                  />
                </div>
                <div className="bg-black rounded-xl p-4 border border-zinc-800">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Техосмотр до</label>
                  <input 
                    type="date" 
                    value={selectedCar.inspectionDate || ''} 
                    onChange={(e) => setSelectedCar({...selectedCar, inspectionDate: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-amber-500 [color-scheme:dark]"
                  />
                </div>
                <div className="bg-black rounded-xl p-4 border border-zinc-800">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Следующее ТО</label>
                  <input 
                    type="date" 
                    value={selectedCar.maintenanceSchedule || ''} 
                    onChange={(e) => setSelectedCar({...selectedCar, maintenanceSchedule: e.target.value})}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-amber-500 [color-scheme:dark]"
                  />
                </div>
              </div>

              {(selectedCar.techPassportFront || selectedCar.techPassportBack) && (
                <div className="space-y-3">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest block">Фото техпаспорта</label>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedCar.techPassportFront && (
                      <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-zinc-800 group">
                        <img src={selectedCar.techPassportFront} alt="Lice" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button onClick={() => window.open(selectedCar.techPassportFront, '_blank')} className="text-[10px] bg-white text-black px-2 py-1 rounded font-bold">СМОТРЕТЬ</button>
                        </div>
                      </div>
                    )}
                    {selectedCar.techPassportBack && (
                      <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-zinc-800 group">
                        <img src={selectedCar.techPassportBack} alt="Back" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button onClick={() => window.open(selectedCar.techPassportBack, '_blank')} className="text-[10px] bg-white text-black px-2 py-1 rounded font-bold">СМОТРЕТЬ</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-t border-zinc-800/50 shrink-0 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => handleApprove(selectedCar.id, selectedCar)}
                  className="flex items-center justify-center gap-2 py-3 bg-emerald-500 text-black text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                >
                  <Check size={16} /> Одобрить
                </button>
                
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={async () => {
                      if (!selectedCar) return;
                      const toastId = toast.loading('Сохранение изменений...');
                      try {
                        const { id, ...updateData } = selectedCar;
                        const { updateDoc, doc } = await import('../../firebase');
                        await updateDoc(doc(db, 'cars', id), {
                          ...updateData,
                          updatedAt: new Date().toISOString()
                        });
                        toast.success('Изменения сохранены', { id: toastId });
                      } catch (error: any) {
                        console.error('Save error:', error);
                        toast.error('Ошибка сохранения', { id: toastId });
                      }
                    }}
                    className="flex items-center justify-center gap-2 py-3 bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl hover:bg-zinc-800 transition-colors border border-zinc-800"
                  >
                    <FileText size={16} /> Сохранить
                  </button>
                  <button 
                    onClick={() => handleReject(selectedCar.id)}
                    className="flex items-center justify-center gap-2 py-3 bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-wider rounded-xl hover:bg-red-500/20 transition-colors"
                  >
                    <X size={16} /> Отклонить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
