import React, { useState, useEffect } from 'react';
import { Settings, AlertCircle, Calendar, Plus, X, Wrench, ShieldCheck, FileText, Trash2, Camera, Loader2, CheckCircle, History, ExternalLink } from 'lucide-react';
import { useFirebase } from '../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, storage, ref, uploadBytes, getDownloadURL } from '../firebase';
import imageCompression from 'browser-image-compression';
import toast from 'react-hot-toast';
import { useKeyboard } from '../hooks/useKeyboard';

interface Car {
  id: string;
  userId: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  vin?: string;
  techPassportFront?: string;
  techPassportBack?: string;
  isApproved: boolean;
  maintenanceSchedule?: string;
  inspectionDate?: string;
  insuranceDate?: string;
  malfunctions?: string[];
  createdAt: string;
}

interface Recommendation {
  id: string;
  carId: string;
  userId: string;
  authorId: string;
  text: string;
  photos: string[];
  status: 'active' | 'resolved';
  createdAt: string;
  resolvedAt?: string;
}

const getDateStatus = (dateStr?: string) => {
  if (!dateStr) return 'text-zinc-500';
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'text-red-500 font-bold';
  if (diffDays <= 30) return 'text-amber-500 font-bold';
  return 'text-zinc-300';
};

export default function Garage() {
  const { user } = useFirebase();
  const isKeyboardVisible = useKeyboard();
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchCars = async () => {
      try {
        const response = await fetch('/api/cars', {
          headers: { 'Authorization': `Bearer ${await (user as any).getIdToken?.() || ''}` }
        });
        if (response.ok) {
          const data = await response.json();
          setCars(data.cars || []);
        }
      } catch (e) {
        console.error('Fetch cars error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchCars();
    
    // Fallback to real-time for better UX if possible, but keep API as primary for writes
    const q = query(collection(db, 'cars'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const carsData: Car[] = [];
      snapshot.forEach((doc) => {
        carsData.push({ id: doc.id, ...doc.data() } as Car);
      });
      setCars(carsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return <div className="p-6 text-center text-zinc-500">Загрузка гаража...</div>;
  }

  return (
    <div className="animate-in fade-in duration-500">
      <header className="mb-6 mt-2 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Бортовой журнал</h1>
          <p className="text-zinc-400 text-sm mt-1">Ваши автомобили</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="p-2 bg-accent text-white rounded-full shadow-lg"
        >
          <Plus size={20} />
        </button>
      </header>

      {cars.length === 0 ? (
        <div className="text-center py-12 bg-zinc-900 rounded-2xl border border-zinc-800">
          <p className="text-zinc-400 mb-4">В вашем бортовом журнале пока нет автомобилей</p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="px-6 py-2 bg-white text-black rounded-full font-medium"
          >
            Добавить авто
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {cars.map(car => (
            <div 
              key={car.id} 
              className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors"
              onClick={() => setSelectedCar(car)}
            >
              <div className="p-4 bg-zinc-800/50 border-b border-zinc-800 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">{car.make} {car.model}</h2>
                  <p className="text-sm text-zinc-400">Гос. номер: {car.plate}</p>
                </div>
                {!car.isApproved && (
                  <span className="text-xs px-2 py-1 bg-amber-500/20 text-amber-500 rounded-full border border-amber-500/30">
                    На модерации
                  </span>
                )}
              </div>
              <div className="p-2 grid grid-cols-3 gap-1 w-full box-border">
                <div className="bg-black rounded-lg p-1 border border-zinc-800 flex flex-col items-center justify-center text-center min-w-0 overflow-hidden">
                  <Wrench size={10} className="text-zinc-500 mb-0.5 shrink-0" />
                  <div className="text-[7px] text-zinc-500 uppercase tracking-tighter truncate w-full">ТО</div>
                  <div className={`font-mono text-[9px] mt-0.5 truncate w-full ${getDateStatus(car.maintenanceSchedule)}`}>
                    {car.maintenanceSchedule ? new Date(car.maintenanceSchedule).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }) : '—'}
                  </div>
                </div>
                <div className="bg-black rounded-lg p-1 border border-zinc-800 flex flex-col items-center justify-center text-center min-w-0 overflow-hidden">
                  <ShieldCheck size={10} className="text-zinc-500 mb-0.5 shrink-0" />
                  <div className="text-[7px] text-zinc-500 uppercase tracking-tighter truncate w-full">Осмотр</div>
                  <div className={`font-mono text-[9px] mt-0.5 truncate w-full ${getDateStatus(car.inspectionDate)}`}>
                    {car.inspectionDate ? new Date(car.inspectionDate).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }) : '—'}
                  </div>
                </div>
                <div className="bg-black rounded-lg p-1 border border-zinc-800 flex flex-col items-center justify-center text-center min-w-0 overflow-hidden">
                  <FileText size={10} className="text-zinc-500 mb-0.5 shrink-0" />
                  <div className="text-[7px] text-zinc-500 uppercase tracking-tighter truncate w-full">Полис</div>
                  <div className={`font-mono text-[9px] mt-0.5 truncate w-full ${getDateStatus(car.insuranceDate)}`}>
                    {car.insuranceDate ? new Date(car.insuranceDate).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }) : '—'}
                  </div>
                </div>
              </div>
              {car.malfunctions && car.malfunctions.length > 0 && (
                <div className="px-4 pb-4">
                  <div className="flex items-center gap-2 text-amber-500 text-xs font-bold uppercase tracking-wider mb-2">
                    <AlertCircle size={14} /> Активные неисправности ({car.malfunctions.length})
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddModal && <AddCarModal onClose={() => setShowAddModal(false)} userId={user?.uid} />}
      {selectedCar && <CarDetailsModal car={selectedCar} onClose={() => setSelectedCar(null)} />}
    </div>
  );
}

function AddCarModal({ onClose, userId }: { onClose: () => void, userId?: string }) {
  const isKeyboardVisible = useKeyboard();
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const [vin, setVin] = useState('');
  const [maintenanceSchedule, setMaintenanceSchedule] = useState('');
  const [inspectionDate, setInspectionDate] = useState('');
  const [insuranceDate, setInsuranceDate] = useState('');
  const [techPassportFront, setTechPassportFront] = useState<File | null>(null);
  const [techPassportBack, setTechPassportBack] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFileUpload = async (file: File, path: string) => {
    const options = { maxSizeMB: 1, maxWidthOrHeight: 1280, useWebWorker: true };
    const compressed = await imageCompression(file, options);
    
    // Simplified base64 logic for our upload proxy
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(compressed);
    });

    const response = await fetch('/api/upload-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: base64,
        fileName: `cars/${userId}/${Date.now()}_${path}.jpg`
      })
    });
    const data = await response.json();
    return data.url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    const toastId = toast.loading('Добавление автомобиля...');
    try {
      let frontUrl = null;
      let backUrl = null;

      if (techPassportFront) {
        toast.loading('Загрузка техпаспорта (1/2)...', { id: toastId });
        frontUrl = await handleFileUpload(techPassportFront, 'tp_front');
      }
      if (techPassportBack) {
        toast.loading('Загрузка техпаспорта (2/2)...', { id: toastId });
        backUrl = await handleFileUpload(techPassportBack, 'tp_back');
      }

      const response = await fetch('/api/cars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          make,
          model,
          year: parseInt(year),
          plate,
          vin,
          techPassportFront: frontUrl,
          techPassportBack: backUrl,
          isApproved: false,
          maintenanceSchedule: maintenanceSchedule || null,
          inspectionDate: inspectionDate || null,
          insuranceDate: insuranceDate || null,
          malfunctions: [],
          createdAt: new Date().toISOString()
        })
      });

      if (!response.ok) throw new Error('Failed to create car via API');

      toast.success('Автомобиль добавлен на модерацию', { id: toastId });
      onClose();
    } catch (error: any) {
      console.error('Add car error:', error);
      toast.error(error.message || 'Ошибка при добавлении', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-md mx-auto bg-zinc-900 rounded-t-3xl sm:rounded-2xl sm:mb-4 animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] flex flex-col relative overflow-hidden">
        <div className="sticky top-0 z-20 bg-zinc-900/80 backdrop-blur-md p-4 border-b border-zinc-800 flex justify-between items-center shrink-0">
          <h2 className="text-sm font-bold uppercase tracking-widest">Добавить автомобиль</h2>
          <button type="button" onClick={onClose} className="p-2 bg-zinc-800 rounded-full hover:text-white shrink-0"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-[9px] text-zinc-500 mb-0.5 uppercase tracking-wider">Марка</label>
              <input required value={make} onChange={e => setMake(e.target.value)} className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:border-accent outline-none box-border appearance-none" placeholder="Например: BMW" />
            </div>
            <div>
              <label className="block text-[9px] text-zinc-500 mb-0.5 uppercase tracking-wider">Модель</label>
              <input required value={model} onChange={e => setModel(e.target.value)} className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:border-accent outline-none box-border appearance-none" placeholder="Например: X5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] text-zinc-500 mb-0.5 uppercase tracking-wider">Год</label>
                <input required type="number" value={year} onChange={e => setYear(e.target.value)} className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:border-accent outline-none box-border appearance-none" placeholder="2020" />
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500 mb-0.5 uppercase tracking-wider">Номер</label>
                <input required value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:border-accent outline-none box-border appearance-none font-mono" placeholder="0001 MI-7" />
              </div>
            </div>

            <div>
              <label className="block text-[9px] text-zinc-500 mb-0.5 uppercase tracking-wider">VIN-номер (по желанию)</label>
              <input value={vin} onChange={e => setVin(e.target.value)} className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:border-accent outline-none box-border appearance-none" placeholder="WBA..." />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] text-zinc-500 mb-1 uppercase tracking-wider">Техпаспорт (Лицо)</label>
                <button 
                  type="button" 
                  onClick={() => document.getElementById('tp-front-input')?.click()}
                  className={`w-full py-3 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-widest ${techPassportFront ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 bg-black/50'}`}
                >
                  <Camera size={18} />
                  {techPassportFront ? 'Готово' : 'Загрузить'}
                </button>
                <input id="tp-front-input" type="file" accept="image/*" className="hidden" onChange={e => setTechPassportFront(e.target.files?.[0] || null)} />
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500 mb-1 uppercase tracking-wider">Техпаспорт (Оборот)</label>
                <button 
                  type="button" 
                  onClick={() => document.getElementById('tp-back-input')?.click()}
                  className={`w-full py-3 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-widest ${techPassportBack ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 bg-black/50'}`}
                >
                  <Camera size={18} />
                  {techPassportBack ? 'Готово' : 'Загрузить'}
                </button>
                <input id="tp-back-input" type="file" accept="image/*" className="hidden" onChange={e => setTechPassportBack(e.target.files?.[0] || null)} />
              </div>
            </div>
            
            <div className="pt-2">
              <h3 className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Сервисная книжка (опционально)</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[9px] text-zinc-500 mb-0.5 uppercase tracking-wider flex justify-between">Следующее ТО</label>
                  <input type="date" value={maintenanceSchedule} onChange={e => setMaintenanceSchedule(e.target.value)} className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:border-accent outline-none box-border appearance-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-[9px] text-zinc-500 mb-0.5 uppercase tracking-wider flex justify-between">Техосмотр до</label>
                  <input type="date" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:border-accent outline-none box-border appearance-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-[9px] text-zinc-500 mb-0.5 uppercase tracking-wider flex justify-between">Страховка до</label>
                  <input type="date" value={insuranceDate} onChange={e => setInsuranceDate(e.target.value)} className="w-full min-w-0 bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:border-accent outline-none box-border appearance-none [color-scheme:dark]" />
                </div>
              </div>
            </div>
          </div>
          
          <div className={`sticky bottom-0 z-20 bg-zinc-900/80 backdrop-blur-md p-4 border-t border-zinc-800/50 shrink-0 pb-[max(env(safe-area-inset-bottom),1rem)] ${isKeyboardVisible ? 'hidden' : 'block'}`}>
            <button disabled={submitting} type="submit" className="w-full bg-accent text-white rounded-xl py-4 text-sm font-bold uppercase tracking-widest disabled:opacity-50">
              {submitting ? 'Сохранение...' : 'Отправить на модерацию'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CarDetailsModal({ car, onClose }: { car: Car, onClose: () => void }) {
  const { user } = useFirebase();
  const isKeyboardVisible = useKeyboard();
  const [maintenanceSchedule, setMaintenanceSchedule] = useState(car.maintenanceSchedule || '');
  const [inspectionDate, setInspectionDate] = useState(car.inspectionDate || '');
  const [insuranceDate, setInsuranceDate] = useState(car.insuranceDate || '');
  const [malfunctions, setMalfunctions] = useState<string[]>(car.malfunctions || []);
  const [newMalfunction, setNewMalfunction] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Recommendations state
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [showAddRec, setShowAddRec] = useState(false);
  const [recText, setRecText] = useState('');
  const [recPhotos, setRecPhotos] = useState<File[]>([]);
  const [recUploading, setRecUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'recommendations'), 
      where('carId', '==', car.id),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recs: Recommendation[] = [];
      snapshot.forEach((doc) => {
        recs.push({ id: doc.id, ...doc.data() } as Recommendation);
      });
      setRecommendations(recs);
    });
    return () => unsubscribe();
  }, [car.id]);

  const handleSave = async () => {
    setSubmitting(true);
    const toastId = toast.loading('Сохранение изменений...');
    try {
      await updateDoc(doc(db, 'cars', car.id), {
        maintenanceSchedule: maintenanceSchedule || null,
        inspectionDate: inspectionDate || null,
        insuranceDate: insuranceDate || null,
        malfunctions
      });
      toast.success('Изменения сохранены', { id: toastId });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cars/${car.id}`);
      toast.error('Ошибка при сохранении', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddRecommendation = async () => {
    if (!recText.trim() || !user) return;
    setRecUploading(true);
    const toastId = toast.loading('Добавление рекомендации...');
    try {
      const photoUrls: string[] = [];
      // Use the storage instance from firebase.ts

      for (const file of recPhotos) {
        const compressedFile = await imageCompression(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true
        });
        const storageRef = ref(storage, `recommendations/${car.id}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, compressedFile);
        const url = await getDownloadURL(storageRef);
        photoUrls.push(url);
      }

      await addDoc(collection(db, 'recommendations'), {
        carId: car.id,
        userId: car.userId,
        authorId: user.uid,
        text: recText,
        photos: photoUrls,
        status: 'active',
        createdAt: new Date().toISOString()
      });

      toast.success('Рекомендация добавлена', { id: toastId });
      setShowAddRec(false);
      setRecText('');
      setRecPhotos([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'recommendations');
      toast.error('Ошибка при добавлении', { id: toastId });
    } finally {
      setRecUploading(false);
    }
  };

  const toggleRecStatus = async (rec: Recommendation) => {
    const newStatus = rec.status === 'active' ? 'resolved' : 'active';
    const toastId = toast.loading('Обновление статуса...');
    try {
      await updateDoc(doc(db, 'recommendations', rec.id), {
        status: newStatus,
        resolvedAt: newStatus === 'resolved' ? new Date().toISOString() : null
      });
      toast.success(newStatus === 'resolved' ? 'Устранено' : 'Возобновлено', { id: toastId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `recommendations/${rec.id}`);
      toast.error('Ошибка при обновлении', { id: toastId });
    }
  };

  const addMalfunction = () => {
    if (newMalfunction.trim()) {
      setMalfunctions([...malfunctions, newMalfunction.trim()]);
      setNewMalfunction('');
    }
  };

  const removeMalfunction = (index: number) => {
    setMalfunctions(malfunctions.filter((_, i) => i !== index));
  };

  const handleDelete = async () => {
    if (window.confirm('Вы уверены, что хотите удалить этот автомобиль?')) {
      const toastId = toast.loading('Удаление...');
      try {
        await deleteDoc(doc(db, 'cars', car.id));
        toast.success('Автомобиль удален', { id: toastId });
        onClose();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `cars/${car.id}`);
        toast.error('Ошибка при удалении', { id: toastId });
      }
    }
  };

  const isPilotOrAdmin = user?.role === 'pilot' || user?.role === 'admin';

  return (
    <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-md mx-auto bg-zinc-900 rounded-t-3xl sm:rounded-2xl sm:mb-4 animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] flex flex-col relative overflow-hidden">
        <div className="sticky top-0 z-20 bg-zinc-900/80 backdrop-blur-md p-4 border-b border-zinc-800 flex justify-between items-center shrink-0">
          <h2 className="text-sm font-bold uppercase tracking-widest truncate">{car.make} {car.model}</h2>
          <button onClick={onClose} className="p-2 bg-zinc-800 rounded-full hover:text-white shrink-0"><X size={16} /></button>
        </div>
        
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black rounded-xl p-2.5 border border-zinc-800 min-w-0">
              <div className="text-[9px] text-zinc-500 mb-1 uppercase tracking-wider truncate">Год выпуска</div>
              <div className="font-mono text-sm truncate">{car.year}</div>
            </div>
            <div className="bg-black rounded-xl p-2.5 border border-zinc-800 min-w-0">
              <div className="text-[9px] text-zinc-500 mb-1 uppercase tracking-wider truncate">Гос. номер</div>
              <div className="font-mono text-sm truncate">{car.plate}</div>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 flex items-center gap-1.5">
              <FileText size={12} /> Сервисная книжка
            </h3>
            <div className="space-y-3">
              <div className="w-full">
                <label className="block text-[9px] text-zinc-500 mb-0.5 uppercase tracking-wider flex flex-wrap justify-between items-center gap-x-1">
                  <span>Следующее ТО</span>
                  {maintenanceSchedule && (
                    <span className={`text-[9px] ${getDateStatus(maintenanceSchedule)}`}>
                      {new Date(maintenanceSchedule) < new Date() ? 'Просрочено' : 'Запланировано'}
                    </span>
                  )}
                </label>
                <input type="date" value={maintenanceSchedule} onChange={e => setMaintenanceSchedule(e.target.value)} className={`w-full min-w-0 bg-black border rounded-lg px-3 py-2 text-xs text-white focus:border-accent outline-none box-border appearance-none [color-scheme:dark] ${maintenanceSchedule ? (new Date(maintenanceSchedule) < new Date() ? 'border-red-500/50' : 'border-zinc-800') : 'border-zinc-800'}`} />
              </div>
              <div className="w-full">
                <label className="block text-[9px] text-zinc-500 mb-0.5 uppercase tracking-wider flex flex-wrap justify-between items-center gap-x-1">
                  <span>Техосмотр до</span>
                  {inspectionDate && (
                    <span className={`text-[9px] ${getDateStatus(inspectionDate)}`}>
                      {new Date(inspectionDate) < new Date() ? 'Просрочено' : 'Действителен'}
                    </span>
                  )}
                </label>
                <input type="date" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} className={`w-full min-w-0 bg-black border rounded-lg px-3 py-2 text-xs text-white focus:border-accent outline-none box-border appearance-none [color-scheme:dark] ${inspectionDate ? (new Date(inspectionDate) < new Date() ? 'border-red-500/50' : 'border-zinc-800') : 'border-zinc-800'}`} />
              </div>
              <div className="w-full">
                <label className="block text-[9px] text-zinc-500 mb-0.5 uppercase tracking-wider flex flex-wrap justify-between items-center gap-x-1">
                  <span>Страховка до</span>
                  {insuranceDate && (
                    <span className={`text-[9px] ${getDateStatus(insuranceDate)}`}>
                      {new Date(insuranceDate) < new Date() ? 'Просрочена' : 'Действительна'}
                    </span>
                  )}
                </label>
                <input type="date" value={insuranceDate} onChange={e => setInsuranceDate(e.target.value)} className={`w-full min-w-0 bg-black border rounded-lg px-3 py-2 text-xs text-white focus:border-accent outline-none box-border appearance-none [color-scheme:dark] ${insuranceDate ? (new Date(insuranceDate) < new Date() ? 'border-red-500/50' : 'border-zinc-800') : 'border-zinc-800'}`} />
              </div>
            </div>
          </div>

          {/* Recommendations / Malfunctions Section */}
          <div>
            <div className="flex justify-between items-center mb-2 mt-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Wrench size={12} /> Рекомендации СТО
              </h3>
              {isPilotOrAdmin && (
                <button 
                  onClick={() => setShowAddRec(!showAddRec)}
                  className="text-accent text-[9px] font-bold uppercase tracking-widest hover:underline bg-accent/10 px-2 py-1 rounded"
                >
                  {showAddRec ? 'Отмена' : 'Добавить'}
                </button>
              )}
            </div>

            {showAddRec && (
              <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700 mb-3 space-y-3 animate-in fade-in slide-in-from-top-2">
                <textarea 
                  value={recText}
                  onChange={e => setRecText(e.target.value)}
                  placeholder="Опишите неисправность..."
                  className="w-full bg-black border border-zinc-700 rounded-xl p-3 text-xs text-white focus:border-accent outline-none resize-none"
                  rows={2}
                />
                
                <div className="flex flex-wrap gap-2">
                  {recPhotos.map((file, i) => (
                    <div key={i} className="relative w-14 h-14 rounded-xl overflow-hidden border border-zinc-700">
                      <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt="" />
                      <button 
                        onClick={() => setRecPhotos(recPhotos.filter((_, idx) => idx !== i))}
                        className="absolute top-0 right-0 p-1 bg-black/50 text-white rounded-bl-lg"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-14 h-14 rounded-xl border border-dashed border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-white transition-colors bg-black/50"
                  >
                    <Camera size={18} />
                  </button>
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={e => setRecPhotos([...recPhotos, ...Array.from(e.target.files || [])])}
                  />
                </div>

                <button 
                  disabled={recUploading || !recText.trim()}
                  onClick={handleAddRecommendation}
                  className="w-full bg-accent text-white rounded-xl py-2.5 text-xs font-bold uppercase tracking-widest disabled:opacity-50 mt-1"
                >
                  {recUploading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Сохранить'}
                </button>
              </div>
            )}
            
            <div className="space-y-3">
              {recommendations.map((rec) => (
                <div key={rec.id} className={`bg-black border rounded-xl p-3 ${rec.status === 'resolved' ? 'border-zinc-800 opacity-60' : 'border-amber-500/30'}`}>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <p className={`text-sm ${rec.status === 'resolved' ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                      {rec.text}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      {isPilotOrAdmin && (
                        <>
                          <button 
                            onClick={() => toggleRecStatus(rec)}
                            className={`p-1.5 rounded-full ${rec.status === 'resolved' ? 'text-zinc-500' : 'text-emerald-500 bg-emerald-500/10'}`}
                            title={rec.status === 'resolved' ? 'Возобновить' : 'Отметить как решенное'}
                          >
                            {rec.status === 'resolved' ? <History size={16} /> : <CheckCircle size={16} />}
                          </button>
                          <button 
                            onClick={async () => {
                              if (window.confirm('Удалить эту рекомендацию?')) {
                                try {
                                  await deleteDoc(doc(db, 'recommendations', rec.id));
                                  toast.success('Удалено');
                                } catch (error) {
                                  toast.error('Ошибка при удалении');
                                }
                              }
                            }}
                            className="p-1.5 text-zinc-600 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {rec.photos && rec.photos.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {rec.photos.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-zinc-800">
                          <img src={url} className="w-full h-full object-cover" alt="" />
                        </a>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center mt-1 pt-2 border-t border-zinc-900">
                    <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-mono">
                      {new Date(rec.createdAt).toLocaleDateString()}
                    </span>
                    {rec.status === 'resolved' && (
                      <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest flex items-center gap-1">
                        <CheckCircle size={10} /> Устранено {rec.resolvedAt && new Date(rec.resolvedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {recommendations.length === 0 && (
                <p className="text-xs text-zinc-500 italic text-center py-4 bg-black/50 rounded-xl border border-zinc-800 border-dashed">Рекомендаций пока нет</p>
              )}
            </div>
          </div>
        </div>
        
        <div className={`sticky bottom-0 z-20 bg-zinc-900/80 backdrop-blur-md p-4 border-t border-zinc-800/50 shrink-0 pb-[max(env(safe-area-inset-bottom),1rem)] flex gap-2 ${isKeyboardVisible ? 'hidden' : 'flex'}`}>
          <button onClick={handleDelete} className="p-4 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors shrink-0">
            <Trash2 size={20} />
          </button>
          <button disabled={submitting} onClick={handleSave} className="flex-1 bg-white text-black rounded-xl py-4 text-sm font-bold uppercase tracking-widest disabled:opacity-50">
            {submitting ? 'Сохранение...' : 'Сохранить изменения'}
          </button>
        </div>
      </div>
    </div>
  );
}
