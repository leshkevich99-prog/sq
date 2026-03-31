import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Search, 
  Filter, 
  Calendar, 
  ChevronRight,
  Car as CarIcon,
  MapPin,
  CheckCircle2,
  Clock,
  MessageSquare,
  X
} from 'lucide-react';
import { useFirebase } from '../../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, collection, query, where, orderBy, onSnapshot, limit, getDoc, doc } from '../../firebase';

interface RequestData {
  id: string;
  carId: string;
  serviceType: string;
  status: string;
  createdAt: string;
  pickupAddress: string;
}

interface CarData {
  make: string;
  model: string;
}

export default function PilotHistory() {
  const navigate = useNavigate();
  const { user } = useFirebase();
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [cars, setCars] = useState<Record<string, CarData>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!user) return;

    // We fetch all requests for this pilot and then filter in memory 
    // to avoid complex composite indexes and include cancelled tasks.
    const q = query(
      collection(db, 'requests'),
      where('pilotId', '==', user.uid),
      limit(200)
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      const allReqs: RequestData[] = [];
      const carIds = new Set<string>();
      
      snapshot.forEach(doc => {
        const data = doc.data();
        allReqs.push({ id: doc.id, ...data } as RequestData);
        if (data.carId) carIds.add(data.carId);
      });

      // Filter only finished tasks
      const finishedReqs = allReqs.filter(r => 
        r.status === 'completed' || r.status === 'cancelled'
      );

      // Sort in memory (newest first)
      finishedReqs.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      // Bulk fetch car details if they are missing
      const carDetails: Record<string, CarData> = { ...cars };
      let updated = false;

      for (const carId of carIds) {
        if (!carDetails[carId]) {
          try {
            const carDoc = await getDoc(doc(db, 'cars', carId));
            if (carDoc.exists()) {
              carDetails[carId] = carDoc.data() as CarData;
              updated = true;
            }
          } catch (e) {
            console.error('Error fetching car:', e);
          }
        }
      }

      if (updated) setCars(carDetails);
      setRequests(finishedReqs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const filteredRequests = requests.filter(req => {
    const car = cars[req.carId];
    const carName = car ? `${car.make} ${car.model}`.toLowerCase() : '';
    const search = searchTerm.toLowerCase();
    return carName.includes(search) || req.pickupAddress?.toLowerCase().includes(search) || req.id.toLowerCase().includes(search);
  });

  if (loading) return <div className="p-6 text-center text-zinc-500">Загрузка истории...</div>;

  return (
    <div className="animate-in fade-in duration-500">
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md py-4 px-4 -mx-4 mb-6 border-b border-zinc-900/50 pt-safe">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2.5 bg-zinc-900 rounded-full border border-zinc-800 active:scale-90 transition-transform">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold uppercase tracking-wider">История поручений</h1>
        </div>
      </header>

      {/* Search Bar */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search size={18} className="text-zinc-500" />
        </div>
        <input 
          type="text" 
          placeholder="Поиск по авто или адресу..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-amber-500 transition-colors"
        />
      </div>

      {/* History List */}
      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900/30 border border-zinc-800 rounded-3xl">
            <Calendar size={32} className="mx-auto text-zinc-800 mb-3" />
            <p className="text-zinc-600 text-xs uppercase tracking-widest">Поручений не найдено</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map(req => {
              const car = cars[req.carId];
              return (
                <div 
                  key={req.id} 
                  onClick={() => navigate(`/task/${req.id}`)}
                  className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 active:scale-[0.98] transition-transform"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                        <CarIcon size={20} className="text-zinc-500" />
                      </div>
                      <div>
                        <div className="text-sm font-bold">{car ? `${car.make} ${car.model}` : 'Автомобиль'}</div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest">
                          {req.serviceType === 'logistics' ? 'Логистика' : 
                           req.serviceType === 'valet' ? 'Валет' : 
                           req.serviceType === 'parking' ? 'Паркинг' : 
                           req.serviceType === 'bureaucracy' ? 'Бюрократия' : 
                           req.serviceType === 'wash' ? 'Мойка' : 'СТО / ТО'}
                        </div>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${req.status === 'completed' ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'}`}>
                      {req.status === 'completed' ? <CheckCircle2 size={12} /> : <X size={12} />}
                      <span className="text-[10px] font-bold uppercase">
                        {req.status === 'completed' ? 'Завершен' : 'Отменен'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-zinc-400 mb-4">
                    <MapPin size={14} className="shrink-0" />
                    <span className="text-xs truncate">{req.pickupAddress}</span>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-zinc-500">
                        <Clock size={14} />
                        <span className="text-[10px] uppercase font-bold tracking-widest">
                          {new Date(req.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/task/${req.id}/chat`);
                        }}
                        className="p-2 bg-zinc-800 text-zinc-400 rounded-lg border border-zinc-700 active:scale-90 transition-transform flex items-center gap-1.5"
                      >
                        <MessageSquare size={14} />
                        <span className="text-[10px] font-bold uppercase">Чат</span>
                      </button>
                    </div>
                    <ChevronRight size={16} className="text-zinc-700" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
