import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { db, storage, auth, handleFirestoreError, OperationType, createNotification, doc, onSnapshot, updateDoc, getDoc, arrayUnion, query, collection, where, getDocs, addDoc, ref, uploadBytesResumable, uploadBytes, uploadString, getDownloadURL } from '../firebase';
import { useFirebase } from '../components/FirebaseProvider';
import { useKeyboard } from '../hooks/useKeyboard';
import imageCompression from 'browser-image-compression';
import toast from 'react-hot-toast';
import { BynIcon } from '../components/BynIcon';
import { 
  ArrowLeft, 
  Car as CarIcon, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Circle, 
  Camera, 
  Phone, 
  MessageSquare,
  ChevronRight,
  User as UserIcon,
  Loader2,
  X as CloseIcon,
  Trash2 as DeleteIcon,
  Maximize2,
  Navigation
} from 'lucide-react';

interface RequestData {
  id: string;
  userId: string;
  carId: string;
  serviceType: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'review' | 'completed' | 'cancelled';
  pilotId?: string;
  createdAt: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  orderDate?: string;
  orderTime?: string;
  washType?: string;
  comment?: string;
  price?: number;
  balanceDeduction?: number;
  paidExternally?: number;
  photos?: string[];
  photosBefore?: string[];
  photosAfter?: string[];
  photoMetadata?: Record<string, {
    timestamp: string;
    lat?: number;
    lng?: number;
    isDamage?: boolean;
  }>;
}

interface UserData {
  firstName: string;
  phone?: string;
  username: string;
  telegramId?: string | number;
}

interface CarData {
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

export default function TaskDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useFirebase();
  const isKeyboardVisible = useKeyboard();
  const getSafeUrl = (url: string) => url.replace(/[.#$[\]/]/g, '_');
  const [request, setRequest] = useState<RequestData | null>(null);
  const [client, setClient] = useState<UserData | null>(null);
  const [pilot, setPilot] = useState<UserData | null>(null);
  const [car, setCar] = useState<CarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null); // 'before' or 'after'
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<'before' | 'after'>('before');
  const [showNavModal, setShowNavModal] = useState(false);
  const [locationPermission, setLocationPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  
  // Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseType, setExpenseType] = useState<'over_tariff' | 'fuel_liquids' | 'large_bill_sto'>('over_tariff');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseReceipt, setExpenseReceipt] = useState<File | null>(null);
  const [expenseUploading, setExpenseUploading] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Expenses list
  const [expenses, setExpenses] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;

    const unsub = onSnapshot(doc(db, 'requests', id), async (docSnap) => {
      try {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as RequestData;
          setRequest(data);
          
          try {
            // Fetch client data
            const clientSnap = await getDoc(doc(db, 'users', data.userId));
            if (clientSnap.exists()) setClient(clientSnap.data() as UserData);
          } catch(e) {}
          
          try {
            // Fetch pilot data if assigned
            if (data.pilotId) {
              const pilotSnap = await getDoc(doc(db, 'users', data.pilotId));
              if (pilotSnap.exists()) setPilot(pilotSnap.data() as UserData);
            }
          } catch(e) {}
          
          try {
            // Fetch car data
            if (data.carId && data.carId !== 'none') {
              const carSnap = await getDoc(doc(db, 'cars', data.carId));
              if (carSnap.exists()) setCar(carSnap.data() as CarData);
            } else {
              setCar(null);
            }
          } catch(e) {}
        }
      } catch (err) {
        console.error('Data fetch error:', err);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error('TaskDetails Snapshot Error:', error);
      handleFirestoreError(error, OperationType.GET, `requests/${id}`);
      setLoading(false);
      toast.error('Ошибка при загрузке данных задачи');
    });

    const qExpenses = query(collection(db, 'transactions'), where('requestId', '==', id));
    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      const exps: any[] = [];
      snapshot.forEach(doc => {
        exps.push({ id: doc.id, ...doc.data() });
      });
      setExpenses(exps);
    }, (error) => {
      console.warn('Transactions not readable or error:', error);
    });

    return () => {
      unsub();
      unsubExpenses();
    };
  }, [id]);

  const updateStatus = async (newStatus: RequestData['status']) => {
    if (!id || !request) return;

    // Validation for photo protocol
    if (newStatus === 'in_progress') {
      const beforeCount = request.photosBefore?.length || 0;
      if (beforeCount < 4) {
        toast.error(`Необходимо минимум 4 фото приемки (сейчас ${beforeCount})`);
        return;
      }
    }

    if (newStatus === 'review') {
      const afterCount = request.photosAfter?.length || 0;
      if (afterCount < 1) {
        toast.error('Необходимо минимум 1 фото выдачи');
        return;
      }
    }

    try {
      const docRef = doc(db, 'requests', id);
      const updateData: any = { status: newStatus };
      
      await updateDoc(docRef, updateData);
      
      // Notify client
      const statusLabels: Record<string, string> = {
        'accepted': 'принята пилотом',
        'in_progress': 'взята в работу',
        'review': 'ожидает проверки администратором',
        'completed': 'успешно завершена',
        'cancelled': 'отменена'
      };

      if (statusLabels[newStatus]) {
        const title = 'Обновление статуса';
        const serviceName = SERVICE_LABELS[request.serviceType] || request.serviceType;
        let body = `Ваше поручение на услугу "${serviceName}" ${statusLabels[newStatus]}.`;
        
        if (newStatus === 'in_progress') {
          body = `Ваш автомобиль принят в работу. Фото-протокол приемки доступен для просмотра в деталях поручения.`;
        } else if (newStatus === 'completed') {
          body = `Работа завершена! Фото-отчет и детали доступны в приложении. Спасибо, что выбрали нас!`;
        }
        
        await createNotification(
          request.userId,
          title,
          body,
          newStatus === 'completed' ? 'success' : newStatus === 'cancelled' ? 'warning' : 'info',
          `/task/${id}`
        );

        // Notify Admins if status is 'review'
        if (newStatus === 'review') {
          try {
            const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
            const adminsSnap = await getDocs(adminsQuery);
            
            const adminPromises = adminsSnap.docs.map(adminDoc => 
              createNotification(
                adminDoc.id,
                'Требуется проверка',
                `Пилот завершил поручение #${id.slice(-4)}. Проверьте фото-протокол.`,
                'info',
                `/task/${id}`
              )
            );
            await Promise.all(adminPromises);
          } catch (e) {
            console.error('Error notifying admins:', e);
          }
        }

        // Send Telegram notification to client
        if (client?.telegramId) {
          try {
            await fetch('/api/notifications/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                telegramId: client.telegramId,
                message: `🔄 ${title}\n\n${body}\n\nОткройте приложение для деталей.`
              })
            });
          } catch (e) {}
        }
      }
      toast.success('Статус обновлен');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${id}`);
      toast.error('Ошибка при обновлении статуса');
    }
  };

  const handleAddExpense = async () => {
    if (!id || !request || !user) return;
    
    const amount = parseFloat(expenseAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Введите корректную сумму');
      return;
    }

    if (!expenseDescription.trim()) {
      toast.error('Введите описание расхода');
      return;
    }

    if ((expenseType === 'fuel_liquids' || expenseType === 'large_bill_sto') && !expenseReceipt) {
      toast.error('Необходимо прикрепить фото чека');
      return;
    }

    setExpenseUploading(true);
    const toastId = toast.loading('Сохранение расхода...');

    try {
      let receiptUrl = '';
      if (expenseReceipt) {
        const compressedFile = await imageCompression(expenseReceipt, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true
        });
        
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(compressedFile);
        });

        const fileName = `receipts/${id}_${Date.now()}.jpg`;
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('Пользователь не авторизован');
        
        const token = await currentUser.getIdToken();
        const bucket = storage.app.options.storageBucket;
        
        if (!bucket) throw new Error('Storage Bucket не настроен');

        const response = await fetch('/api/upload-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Data, fileName, token, bucket })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: `Ошибка сервера: ${response.status}` }));
          throw new Error(errData.error || `Ошибка при загрузке чека`);
        }

        const data = await response.json();
        if (!data.url) throw new Error('Сервер не вернул ссылку на файл');
        receiptUrl = data.url;
      }

      const txType = expenseType === 'large_bill_sto' ? 'external_invoice' : 'deposit_deduction';
      const txTitle = expenseType === 'over_tariff' ? 'Списание сверх тарифа' : 
                      expenseType === 'fuel_liquids' ? 'Топливо/жидкости' : 'Крупный счет (СТО)';

      await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: request.userId,
          pilotId: user.uid,
          requestId: id,
          type: txType,
          amount: amount,
          description: `${txTitle}: ${expenseDescription}`,
          receiptUrl,
          status: expenseType === 'large_bill_sto' ? 'pending' : 'completed'
        })
      });

      // Update request with external payment info if it's a large bill
      if (expenseType === 'large_bill_sto') {
        const amount = parseFloat(expenseAmount);
        await fetch(`/api/requests/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paidExternally: (request.paidExternally || 0) + amount
          })
        });
      }

      toast.success('Расход успешно добавлен', { id: toastId });
      setShowExpenseModal(false);
      setExpenseAmount('');
      setExpenseDescription('');
      setExpenseReceipt(null);
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Ошибка при сохранении расхода', { id: toastId });
    } finally {
      setExpenseUploading(false);
    }
  };

  const toggleDamage = async (photoUrl: string) => {
    if (!id || !request) return;
    const safeUrl = getSafeUrl(photoUrl);
    const currentMetadata = request.photoMetadata?.[safeUrl] || { timestamp: new Date().toISOString() };
    
    try {
      await fetch(`/api/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [`photoMetadata.${safeUrl}.isDamage`]: !currentMetadata.isDamage
        })
      });
      toast.success(currentMetadata.isDamage ? 'Метка повреждения снята' : 'Отмечено как повреждение');
    } catch (e) {
      toast.error('Ошибка при обновлении');
    }
  };

  const handleDeletePhoto = async (photoUrl: string, type: 'before' | 'after') => {
    if (!id || !request) return;
    
    const confirmMsg = 'Удалить это фото?';
    const proceed = await new Promise<boolean>((resolve) => {
      try {
        WebApp.showConfirm(confirmMsg, (ok) => resolve(ok));
      } catch (e) {
        resolve(window.confirm(confirmMsg));
      }
    });

    if (!proceed) return;

    const toastId = toast.loading('Удаление...');
    try {
      const field = type === 'before' ? 'photosBefore' : 'photosAfter';
      const currentPhotos = (request as any)[field] || [];
      const updatedPhotos = currentPhotos.filter((p: string) => p !== photoUrl);
      
      await fetch(`/api/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [field]: updatedPhotos
        })
      });
      
      toast.success('Фото удалено', { id: toastId });
    } catch (error) {
      console.error('Error deleting photo:', error);
      toast.error('Ошибка при удалении', { id: toastId });
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !id || !user || !request) return;

    setUploading(uploadType);
    const toastId = toast.loading(`Подготовка (${files.length} фото)...`);

    try {
      try { WebApp.expand(); } catch (e) {}

      const newUrls: string[] = [];
      const field = uploadType === 'before' ? 'photosBefore' : 'photosAfter';
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Пользователь не авторизован');
      
      const token = await currentUser.getIdToken();
      const bucket = storage.app.options.storageBucket;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        toast.loading(`Сжатие и загрузка ${i + 1}/${files.length}...`, { id: toastId });

        // 1. Compress photo
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1280,
          useWebWorker: true,
          initialQuality: 0.7
        };
        const compressedFile = await imageCompression(file, options);
        
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(compressedFile);
        });

        const fileName = `requests/${id}/${uploadType}_${Date.now()}_${i}.jpg`;

        const response = await fetch('/api/upload-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Data, fileName, token, bucket })
        });

        if (!response.ok) throw new Error(`Ошибка при загрузке фото ${i + 1}`);

        const { url: downloadURL } = await response.json();
        newUrls.push(downloadURL);
      }
      
      // Calculate final arrays and metadata
      const currentPhotos = Array.isArray((request as any)[field]) ? (request as any)[field] : [];
      const updatedPhotos = [...currentPhotos, ...newUrls];
      
      const updateData: any = {
        [field]: updatedPhotos
      };

      // Add timestamps for new photos
      newUrls.forEach(url => {
        const safeUrl = getSafeUrl(url);
        updateData[`photoMetadata.${safeUrl}`] = {
          timestamp: new Date().toISOString()
        };
      });

      // Update via API
      const updateResponse = await fetch(`/api/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!updateResponse.ok) {
        throw new Error('Ошибка при обновлении задачи в базе данных');
      }
      
      toast.success('Все фото успешно добавлены!', { id: toastId });
    } catch (error: any) {
      console.error('Detailed Upload Error:', error);
      toast.error(error.message || 'Ошибка при загрузке', { id: toastId, duration: 6000 });
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openNavigation = (address: string) => {
    if (!address) return;
    setShowNavModal(true);
  };

  const getNavLinks = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    return [
      { name: 'Яндекс Карты', url: `yandexmaps://maps.yandex.ru/?text=${encodedAddress}`, fallback: `https://yandex.ru/maps/?text=${encodedAddress}` },
      { name: 'Google Maps', url: `comgooglemaps://?q=${encodedAddress}`, fallback: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}` }
    ];
  };

  if (loading) return <div className="p-6 text-center text-zinc-500">Загрузка...</div>;
  if (!request) return <div className="p-6 text-center text-zinc-500">Задача не найдена</div>;

  const steps = [
    { id: 'pending', label: 'Поручение создано', icon: Circle },
    { id: 'accepted', label: 'Пилот назначен', icon: Circle },
    { id: 'in_progress', label: 'В работе', icon: Clock },
    { id: 'review', label: 'Проверка', icon: Clock },
    { id: 'completed', label: 'Завершено', icon: CheckCircle2 },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === request.status);

  return (
    <div className="animate-in fade-in duration-500">
      <header className="sticky top-0 z-30 bg-black/95 backdrop-blur-md py-4 px-4 mb-4 border-b border-zinc-900/50 pt-safe">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 bg-zinc-900 rounded-full border border-zinc-800 active:scale-90 transition-transform shrink-0">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-base sm:text-lg font-bold uppercase tracking-wide whitespace-nowrap overflow-hidden text-ellipsis">Детали поручения</h1>
          </div>
          
          {(user?.role === 'client' || user?.role === 'pilot' || user?.role === 'admin') && 
           (request.status === 'accepted' || request.status === 'in_progress' || request.status === 'review') && (
            <button 
              onClick={() => navigate(`/task/${id}/chat`)}
              className="p-2.5 bg-accent/10 text-accent rounded-full border border-accent/20 active:scale-90 transition-transform relative"
            >
              <MessageSquare size={20} />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-black animate-pulse" />
            </button>
          )}
        </div>
      </header>

      {/* Status Timeline */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6 mt-2">
        <div className="flex justify-between relative">
          {/* Line */}
          <div className="absolute top-4 left-0 right-0 h-0.5 bg-zinc-800 -z-0" />
          <div 
            className="absolute top-4 left-0 h-0.5 bg-amber-500 transition-all duration-500 -z-0" 
            style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
          />
          
          {steps.map((step, index) => {
            const isActive = index <= currentStepIndex;
            const Icon = step.icon;
            
            return (
              <div key={step.id} className="flex flex-col items-center relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                  isActive ? 'bg-amber-500 border-amber-500 text-black' : 'bg-zinc-900 border-zinc-800 text-zinc-600'
                }`}>
                  {isActive ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </div>
                <span className={`text-[10px] mt-2 uppercase font-bold tracking-tighter text-center w-16 ${
                  isActive ? 'text-white' : 'text-zinc-600'
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info Cards */}
      <div className="space-y-4">
        {/* Client Info (for Pilot/Admin) */}
        {(user?.role === 'pilot' || user?.role === 'admin') && client && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-800 rounded-lg">
                <UserIcon className="text-zinc-400" size={20} />
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-widest">Клиент</div>
                <div className="font-bold">{client.firstName} (@{client.username})</div>
                {client.phone && <div className="text-xs text-zinc-400">{client.phone}</div>}
              </div>
            </div>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <CarIcon className="text-amber-500" size={20} />
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-widest">Автомобиль</div>
              <div className="font-bold">
                {car ? `${car.make} ${car.model} (${car.plate})` : `ID: ${request.carId}`}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <MapPin className="text-blue-500" size={20} />
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-widest">Услуга</div>
              <div className="font-bold uppercase tracking-wide">
                {request.serviceType === 'logistics' ? 'Логистика' : 
                 request.serviceType === 'valet' ? 'Валет' : 
                 request.serviceType === 'parking' ? 'Паркинг' : 
                 request.serviceType === 'bureaucracy' ? 'Бюрократия' : 
                 request.serviceType === 'wash' ? `Мойка (${request.washType})` : 'СТО / ТО'}
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Адрес забора</div>
              <div className="text-sm font-medium">{request.pickupAddress}</div>
            </div>
            {request.serviceType === 'logistics' && (
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Адрес доставки</div>
                <div className="text-sm font-medium">{request.deliveryAddress}</div>
              </div>
            )}
            <div className="flex gap-4">
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Дата</div>
                <div className="text-sm font-medium">{request.orderDate === 'today' ? 'Сегодня' : request.orderDate === 'tomorrow' ? 'Завтра' : request.orderDate}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Время</div>
                <div className="text-sm font-medium">{request.orderTime === 'asap' ? 'Как можно скорее' : request.orderTime}</div>
              </div>
            </div>
          </div>
        </div>

        {request.comment && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Комментарий</div>
            <p className="text-sm text-zinc-300">{request.comment}</p>
          </div>
        )}

        {/* Expenses Section */}
        {expenses.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-xs text-zinc-500 uppercase tracking-widest mb-4">Дополнительные расходы</div>
            <div className="space-y-3">
              {expenses.map(exp => (
                <div key={exp.id} className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-sm font-bold text-white">{exp.description}</div>
                      <div className="text-[10px] text-zinc-500 mt-1">
                        {new Date(exp.createdAt).toLocaleString('ru-RU')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-amber-500 flex items-center justify-end gap-1">{exp.amount.toFixed(2)} <BynIcon size="0.8em" /></div>
                      {exp.status === 'pending' && (
                        <div className="text-[10px] text-amber-500/80 uppercase mt-1">Ожидает оплаты</div>
                      )}
                    </div>
                  </div>
                  {exp.receiptUrl && (
                    <button 
                      onClick={() => setSelectedPhoto(exp.receiptUrl)}
                      className="text-[10px] text-amber-500 hover:underline inline-flex items-center gap-1 mt-1"
                    >
                      <Camera size={10} /> Фото чека
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <div className="text-xs text-zinc-500 uppercase tracking-widest">Фото-протокол</div>
            {request.status === 'completed' && (
              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded uppercase tracking-tighter border border-emerald-500/20">
                Проверено
              </span>
            )}
          </div>
          
          <div className="space-y-6">
            {/* Before Section */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-3 bg-amber-500 rounded-full" />
                  <span className="text-xs font-bold uppercase tracking-tight text-white">Приемка автомобиля</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">{(request.photosBefore?.length || 0)} ФОТО</span>
              </div>
              
              {(!request.photosBefore || request.photosBefore.length === 0) ? (
                user?.role === 'pilot' && (request.status === 'accepted' || request.status === 'in_progress') ? (
                  <button 
                    onClick={() => {
                      setUploadType('before');
                      fileInputRef.current?.click();
                    }}
                    disabled={!!uploading}
                    className="w-full py-8 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-all disabled:opacity-50 group"
                  >
                    {uploading === 'before' ? (
                      <Loader2 size={24} className="animate-spin mb-2" />
                    ) : (
                      <Camera size={24} className="mb-2 text-zinc-600 group-hover:text-amber-500 transition-colors" />
                    )}
                    <span className="text-[10px] uppercase tracking-widest font-bold">Добавить фото приемки</span>
                    <span className="text-[8px] text-zinc-600 uppercase mt-1">Минимум 4 фотографии</span>
                  </button>
                ) : (
                  <div className="py-8 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center text-zinc-600">
                    <Camera size={24} className="mb-2 opacity-20" />
                    <span className="text-[10px] uppercase tracking-widest">Ожидание фото</span>
                  </div>
                )
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {Array.isArray(request.photosBefore) && request.photosBefore.map((photo, i) => (
                    <div key={i} className="aspect-square bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 relative group">
                      <img 
                        src={photo} 
                        alt={`Before ${i}`} 
                        className="w-full h-full object-cover cursor-pointer" 
                        referrerPolicy="no-referrer" 
                        onClick={() => setSelectedPhoto(photo)}
                      />
                      {request.photoMetadata?.[getSafeUrl(photo)]?.isDamage && (
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-red-500 text-[8px] font-bold text-white rounded uppercase tracking-tighter shadow-lg z-10">
                          Повреждение
                        </div>
                      )}
                      {user?.role === 'pilot' && (request.status === 'accepted' || request.status === 'in_progress') && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePhoto(photo, 'before');
                          }}
                          className="absolute top-1 right-1 p-1.5 bg-black/60 rounded-md text-red-400"
                        >
                          <DeleteIcon size={14} />
                        </button>
                      )}
                      <div className="absolute bottom-1 right-1 p-0.5 bg-black/40 rounded text-white/60 pointer-events-none">
                        <Maximize2 size={10} />
                      </div>
                    </div>
                  ))}
                  {user?.role === 'pilot' && (request.status === 'accepted' || request.status === 'in_progress') && (request.photosBefore?.length || 0) < 10 && (
                    <button 
                      onClick={() => {
                        setUploadType('before');
                        fileInputRef.current?.click();
                      }}
                      disabled={!!uploading}
                      className="aspect-square bg-zinc-800 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
                    >
                      {uploading === 'before' ? <Loader2 size={24} className="animate-spin" /> : <Camera size={24} />}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* After Section */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                  <span className="text-xs font-bold uppercase tracking-tight text-white">Результат работы</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">{(request.photosAfter?.length || 0)} ФОТО</span>
              </div>

              {(!request.photosAfter || request.photosAfter.length === 0) ? (
                user?.role === 'pilot' && request.status === 'in_progress' ? (
                  <button 
                    onClick={() => {
                      setUploadType('after');
                      fileInputRef.current?.click();
                    }}
                    disabled={!!uploading}
                    className="w-full py-8 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-all disabled:opacity-50 group"
                  >
                    {uploading === 'after' ? (
                      <Loader2 size={24} className="animate-spin mb-2" />
                    ) : (
                      <Camera size={24} className="mb-2 text-zinc-600 group-hover:text-emerald-500 transition-colors" />
                    )}
                    <span className="text-[10px] uppercase tracking-widest font-bold">Добавить фото результата</span>
                    <span className="text-[8px] text-zinc-600 uppercase mt-1">Минимум 1 фотография</span>
                  </button>
                ) : (
                  <div className="py-8 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center text-zinc-600">
                    <Camera size={24} className="mb-2 opacity-20" />
                    <span className="text-[10px] uppercase tracking-widest">Ожидание завершения</span>
                  </div>
                )
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {Array.isArray(request.photosAfter) && request.photosAfter.map((photo, i) => (
                    <div key={i} className="aspect-square bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 relative group">
                      <img 
                        src={photo} 
                        alt={`After ${i}`} 
                        className="w-full h-full object-cover cursor-pointer" 
                        referrerPolicy="no-referrer" 
                        onClick={() => setSelectedPhoto(photo)}
                      />
                      {request.photoMetadata?.[getSafeUrl(photo)]?.isDamage && (
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-red-500 text-[8px] font-bold text-white rounded uppercase tracking-tighter shadow-lg z-10">
                          Повреждение
                        </div>
                      )}
                      {user?.role === 'pilot' && request.status === 'in_progress' && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePhoto(photo, 'after');
                          }}
                          className="absolute top-1 right-1 p-1.5 bg-black/60 rounded-md text-red-400"
                        >
                          <DeleteIcon size={14} />
                        </button>
                      )}
                      <div className="absolute bottom-1 right-1 p-0.5 bg-black/40 rounded text-white/60 pointer-events-none">
                        <Maximize2 size={10} />
                      </div>
                    </div>
                  ))}
                  {user?.role === 'pilot' && request.status === 'in_progress' && (request.photosAfter?.length || 0) < 10 && (
                    <button 
                      onClick={() => {
                        setUploadType('after');
                        fileInputRef.current?.click();
                      }}
                      disabled={!!uploading}
                      className="aspect-square bg-zinc-800 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
                    >
                      {uploading === 'after' ? <Loader2 size={24} className="animate-spin" /> : <Camera size={24} />}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <input 
            type="file" 
            accept="image/*" 
            multiple
            className="hidden" 
            ref={fileInputRef}
            onChange={handlePhotoUpload}
            disabled={!!uploading}
          />
        </div>

        {/* Photo Viewer Modal */}
        {selectedPhoto && (
          <div 
            className="fixed inset-0 z-[500] bg-black/95 flex flex-col animate-in fade-in duration-200"
            onClick={() => setSelectedPhoto(null)}
          >
            <div className="flex justify-end p-4 gap-2">
              {user?.role === 'pilot' && (request.status === 'accepted' || request.status === 'in_progress') && (request.photosBefore?.includes(selectedPhoto) || request.photosAfter?.includes(selectedPhoto)) && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDamage(selectedPhoto);
                  }}
                  className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors ${
                    request.photoMetadata?.[getSafeUrl(selectedPhoto)]?.isDamage 
                    ? 'bg-red-500 text-white' 
                    : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {request.photoMetadata?.[getSafeUrl(selectedPhoto)]?.isDamage ? 'Убрать метку' : 'Повреждение'}
                </button>
              )}
              <button className="p-2 bg-zinc-800 rounded-full text-white">
                <CloseIcon size={24} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-4">
              <img 
                src={selectedPhoto} 
                alt="Full screen" 
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </div>
            {(request.photosBefore?.includes(selectedPhoto) || request.photosAfter?.includes(selectedPhoto)) && (
              <div className="p-6 bg-black/40 backdrop-blur-md border-t border-white/5">
                <div className="flex flex-col items-center gap-2">
                  <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono">
                    {request.photoMetadata?.[getSafeUrl(selectedPhoto)]?.timestamp 
                      ? new Date(request.photoMetadata[getSafeUrl(selectedPhoto)].timestamp).toLocaleString('ru-RU')
                      : 'Время не указано'}
                  </div>
                  {request.photoMetadata?.[getSafeUrl(selectedPhoto)]?.lat && (
                    <a 
                      href={`https://www.google.com/maps?q=${request.photoMetadata[getSafeUrl(selectedPhoto)].lat},${request.photoMetadata[getSafeUrl(selectedPhoto)].lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-amber-500 hover:underline flex items-center gap-1"
                    >
                      <MapPin size={10} /> Посмотреть на карте
                    </a>
                  )}
                </div>
              </div>
            )}
            <div className="p-4 text-center text-zinc-600 text-[10px] uppercase tracking-widest">
              Нажмите в любом месте, чтобы закрыть
            </div>
          </div>
        )}

        {/* Action Buttons for Pilot */}
        {user?.role === 'pilot' && (
          <div className="space-y-3 mt-6">
            {request.status === 'accepted' && (
              <>
                <button 
                  onClick={() => updateStatus('in_progress')}
                  className="w-full py-4 bg-white text-black rounded-xl font-bold uppercase tracking-widest text-sm shadow-lg shadow-white/10"
                >
                  Начать выполнение
                </button>
                <button 
                  onClick={() => navigate(`/task/${id}/chat`)}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-zinc-900 border border-zinc-800 rounded-xl font-bold uppercase tracking-widest text-xs"
                >
                  <MessageSquare size={16} /> Чат с клиентом
                </button>
              </>
            )}
            
            {request.status === 'in_progress' && (
              <>
                <button 
                  onClick={() => updateStatus('review')}
                  className="w-full py-4 bg-emerald-500 text-black rounded-xl font-bold uppercase tracking-widest text-sm shadow-lg shadow-emerald-500/20"
                >
                  Завершить поручение
                </button>

                <button 
                  onClick={async () => {
                    const confirmMsg = 'Вернуться на этап "Пилот назначен"?';
                    const proceed = await new Promise<boolean>(r => {
                      try { WebApp.showConfirm(confirmMsg, (ok) => r(ok)); }
                      catch(e) { r(window.confirm(confirmMsg)); }
                    });
                    if (proceed) updateStatus('accepted');
                  }}
                  className="w-full py-3 bg-zinc-900 text-zinc-500 border border-zinc-800 rounded-xl font-bold uppercase tracking-widest text-[10px]"
                >
                  Вернуться на шаг назад
                </button>
                
                <div className="grid grid-cols-1 gap-3">
                  <button 
                    onClick={() => openNavigation(request.pickupAddress || '')}
                    className="flex items-center justify-center gap-2 py-4 bg-zinc-900 border border-zinc-800 rounded-xl font-bold uppercase tracking-widest text-xs"
                  >
                    <Navigation size={16} /> Маршрут
                  </button>
                </div>
                
                <button 
                  onClick={() => navigate(`/task/${id}/chat`)}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-zinc-900 border border-zinc-800 rounded-xl font-bold uppercase tracking-widest text-xs"
                >
                  <MessageSquare size={16} /> Чат с клиентом
                </button>

                <button 
                  onClick={() => setShowExpenseModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-amber-500/20 transition-colors"
                >
                  Добавить расход
                </button>
              </>
            )}

            {request.status === 'review' && (
              <div className="space-y-3">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-2">
                  <p className="text-xs text-blue-500 text-center font-medium">
                    Поручение на проверке у администратора
                  </p>
                </div>
                <button 
                  onClick={async () => {
                    const confirmMsg = 'Вернуться к выполнению поручения (в работу)?';
                    const proceed = await new Promise<boolean>(r => {
                      try { WebApp.showConfirm(confirmMsg, (ok) => r(ok)); }
                      catch(e) { r(window.confirm(confirmMsg)); }
                    });
                    if (proceed) updateStatus('in_progress');
                  }}
                  className="w-full py-4 bg-zinc-900 border border-zinc-800 text-white rounded-xl font-bold uppercase tracking-widest text-xs"
                >
                  Вернуться на шаг назад (в работу)
                </button>
                
                <button 
                  onClick={() => navigate(`/task/${id}/chat`)}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-zinc-900 border border-zinc-800 rounded-xl font-bold uppercase tracking-widest text-xs"
                >
                  <MessageSquare size={16} /> Чат с клиентом
                </button>
              </div>
            )}
          </div>
        )}

        {/* Expense Modal */}
        {showExpenseModal && (
          <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
            <div className="w-full max-w-md mx-auto bg-zinc-900 rounded-t-3xl sm:rounded-2xl sm:mb-4 animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] flex flex-col relative overflow-hidden">
              <div className="sticky top-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-b border-zinc-800/50 flex justify-between items-center shrink-0">
                <h3 className="text-lg font-bold uppercase tracking-widest">Добавить расход</h3>
                <button onClick={() => setShowExpenseModal(false)} className="text-zinc-500 hover:text-white p-2">
                  <CloseIcon size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto flex-1 pb-4">
                <div>
                  <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-2">Тип расхода</label>
                  <select 
                    value={expenseType}
                    onChange={(e) => setExpenseType(e.target.value as any)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="over_tariff">Списание сверх тарифа</option>
                    <option value="fuel_liquids">Топливо/жидкости</option>
                    <option value="large_bill_sto">Крупный счет (СТО)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1">Сумма (<BynIcon size="1em" />)</label>
                  <input 
                    type="number" 
                    inputMode="decimal"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-2">Описание</label>
                  <textarea 
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    placeholder="Например: Заправка АИ-95, 20л"
                    rows={2}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-white focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-2">
                    Фото чека {(expenseType === 'fuel_liquids' || expenseType === 'large_bill_sto') && <span className="text-red-500">*</span>}
                  </label>
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    ref={receiptInputRef}
                    onChange={(e) => setExpenseReceipt(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  {expenseReceipt ? (
                    <div className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-xl p-4">
                      <span className="text-sm truncate max-w-[200px]">{expenseReceipt.name}</span>
                      <button onClick={() => setExpenseReceipt(null)} className="text-red-500">
                        <DeleteIcon size={18} />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => receiptInputRef.current?.click()}
                      className="w-full py-4 border border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-colors"
                    >
                      <Camera size={24} className="mb-2" />
                      <span className="text-xs uppercase tracking-widest">Прикрепить фото</span>
                    </button>
                  )}
                </div>
              </div>

              <div className={`sticky bottom-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-t border-zinc-800/50 shrink-0 pb-[max(env(safe-area-inset-bottom),1.5rem)] ${isKeyboardVisible ? 'hidden' : 'block'}`}>
                <button 
                  onClick={handleAddExpense}
                  disabled={expenseUploading}
                  className="w-full py-4 bg-amber-500 text-black rounded-xl font-bold uppercase tracking-widest text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  {expenseUploading ? <Loader2 size={20} className="animate-spin mx-auto" /> : 'Сохранить расход'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Modal */}
        {showNavModal && (
          <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
            <div className="w-full max-w-md mx-auto bg-zinc-900 rounded-t-3xl sm:rounded-2xl sm:mb-4 animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] flex flex-col relative overflow-hidden">
              <div className="sticky top-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-b border-zinc-800/50 flex justify-between items-center shrink-0">
                <h3 className="text-lg font-bold uppercase tracking-widest">Выбрать навигатор</h3>
                <button onClick={() => setShowNavModal(false)} className="text-zinc-500 hover:text-white p-2">
                  <CloseIcon size={24} />
                </button>
              </div>
              <div className="p-6 space-y-3 overflow-y-auto flex-1 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
                {getNavLinks(request.pickupAddress || '').map((nav) => (
                  <button
                    key={nav.name}
                    onClick={() => {
                      window.location.href = nav.url;
                      setTimeout(() => {
                        window.open(nav.fallback, '_blank');
                      }, 500);
                      setShowNavModal(false);
                    }}
                    className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-3 active:scale-[0.98]"
                  >
                    {nav.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons for Client */}
        {(user?.role === 'client' || !user?.role) && (
          <div className="space-y-3 mt-6">
            {(request.status === 'accepted' || request.status === 'in_progress' || request.status === 'review') && (
              <button 
                onClick={() => navigate(`/task/${id}/chat`)}
                className="w-full flex items-center justify-center gap-2 py-4 bg-zinc-900 border border-zinc-800 rounded-xl font-bold uppercase tracking-widest text-xs"
              >
                <MessageSquare size={16} /> Чат с пилотом
              </button>
            )}
            
            {request.status === 'pending' && (
              <button 
                onClick={() => updateStatus('cancelled')}
                className="w-full py-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-red-500/20 transition-colors"
              >
                Отменить поручение
              </button>
            )}
          </div>
        )}

        {/* Action Buttons for Admin */}
        {user?.role === 'admin' && (
          <div className="space-y-3 mt-6">
            <button 
              onClick={() => navigate(`/task/${id}/chat`)}
              className="w-full flex items-center justify-center gap-2 py-4 bg-zinc-900 border border-zinc-800 rounded-xl font-bold uppercase tracking-widest text-xs"
            >
              <MessageSquare size={16} /> Чат по поручению
            </button>

            {request.status === 'review' && (
              <>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4">
                  <p className="text-xs text-amber-500 text-center font-medium">
                    Задача ожидает проверки фото-протокола
                  </p>
                </div>
                <button 
                  onClick={() => updateStatus('completed')}
                  className="w-full py-4 bg-emerald-500 text-black rounded-xl font-bold uppercase tracking-widest text-sm shadow-lg shadow-emerald-500/20"
                >
                  Одобрить и завершить
                </button>
                <button 
                  onClick={() => updateStatus('in_progress')}
                  className="w-full py-4 bg-zinc-800 text-white rounded-xl font-bold uppercase tracking-widest text-sm border border-zinc-700"
                >
                  Вернуть на доработку
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
