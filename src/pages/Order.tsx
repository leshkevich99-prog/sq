import React, { useState, useEffect, useRef } from 'react';
import { BynIcon } from '../components/BynIcon';
import { MapPin, Calendar, Clock, ChevronRight, Car, Truck, Droplets, Wrench, Key, FileText, SquareParking, Check, X } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { useFirebase } from '../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, createNotification, collection, query, where, getDocs, addDoc, onSnapshot, updateDoc, doc, orderBy, limit } from '../firebase';
import toast from 'react-hot-toast';

interface CarData {
  id: string;
  make: string;
  model: string;
  plate: string;
}

const SERVICE_PRICES: Record<string, any> = {
  'logistics': 140,
  'valet': 275,
  'parking': 170,
  'bureaucracy': 170,
  'wash': 150,
  'service': 140
};

const SERVICES = [
  { id: 'logistics', title: 'Логистическое поручение', price: <div className="flex items-center gap-1">140.00 <BynIcon size="0.8em" /></div>, desc: 'Перегон автомобиля из точки А в точку Б', icon: Truck },
  { id: 'valet', title: 'AIRPORT VALET', price: <div className="flex items-center gap-1">275.00 <BynIcon size="0.8em" /></div>, desc: 'Встреча или проводы в аэропорту', icon: Key },
  { id: 'parking', title: 'Night Drop', price: <div className="flex items-center gap-1">от 170.00 <BynIcon size="0.8em" /></div>, desc: 'Безопасная ночная парковка вашего авто', icon: SquareParking },
  { id: 'bureaucracy', title: 'Бюрократия под ключ', price: <div className="flex items-center gap-1">170.00 - 350.00 <BynIcon size="0.8em" /></div>, desc: 'Оформление документов, страховок, ТО', icon: FileText },
  { id: 'wash', title: 'Комплексная трехфазная мойка', price: <div className="flex items-center gap-1">150.00 <BynIcon size="0.8em" /></div>, desc: 'Премиальный уход за кузовом и салоном', icon: Droplets },
  { id: 'service', title: 'СТО / ТО', price: <div className="flex items-center gap-1">140.00 <BynIcon size="0.8em" /></div>, desc: 'Доставка авто на сервисное обслуживание', icon: Wrench }
];

const SERVICE_LABELS: Record<string, string> = {
  'logistics': 'Логистика',
  'valet': 'AIRPORT VALET',
  'parking': 'Night Drop',
  'bureaucracy': 'Бюрократия',
  'wash': 'Мойка',
  'service': 'СТО / ТО'
};

export default function Order() {
  const { user } = useFirebase();
  const [service, setService] = useState('logistics');
  const [cars, setCars] = useState<CarData[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState(0);

  // Step 1: New state for interactive order
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderDate, setOrderDate] = useState('today');
  const [orderTime, setOrderTime] = useState('asap');
  const [washType, setWashType] = useState('standard');
  const [comment, setComment] = useState('');
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const [isPickupFocused, setIsPickupFocused] = useState(false);
  const [isDeliveryFocused, setIsDeliveryFocused] = useState(false);
  
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const pickupRef = useRef<HTMLInputElement>(null);
  const deliveryRef = useRef<HTMLInputElement>(null);

  const handleFocus = (ref: React.RefObject<HTMLElement>, setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  useEffect(() => {
    if (!user) return;
    
    // Fetch cars
    const fetchCars = async () => {
      try {
        const q = query(collection(db, 'cars'), where('userId', '==', user.uid), where('isApproved', '==', true));
        const snapshot = await getDocs(q);
        const carsData: CarData[] = [];
        snapshot.forEach(doc => {
          carsData.push({ id: doc.id, ...doc.data() } as CarData);
        });
        setCars(carsData);
        if (carsData.length > 0) {
          setSelectedCarId(carsData[0].id);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'cars');
      } finally {
        setLoading(false);
      }
    };
    fetchCars();

    // Fetch balance
    const qBalance = query(
      collection(db, 'transactions'), 
      where('userId', '==', user.uid)
    );
    
    const unsubscribeBalance = onSnapshot(qBalance, (snapshot) => {
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

    return () => unsubscribeBalance();
  }, [user]);

  const getCurrentLocation = (target: 'pickup' | 'delivery') => {
    if (!navigator.geolocation) {
      toast.error('Геолокация не поддерживается вашим браузером');
      return;
    }

    toast.loading('Определение местоположения...', { duration: 2000 });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
        if (target === 'pickup') setPickupAddress(`Мое местоположение (${coords})`);
        else setDeliveryAddress(`Мое местоположение (${coords})`);
        toast.success('Местоположение определено');
      },
      (error) => {
        console.error('Geolocation error:', error);
        toast.error('Не удалось определить местоположение');
      }
    );
  };

  const handleOrder = async () => {
    if (!user || !selectedCarId) return;
    
    // Validation
    if (!pickupAddress) {
      toast.error('Укажите адрес подачи');
      return;
    }
    if (service === 'logistics' && !deliveryAddress) {
      toast.error('Укажите адрес доставки');
      return;
    }
    if (!safetyAccepted) {
      toast.error('Необходимо подтвердить согласие с регламентом безопасности');
      return;
    }
    
    // Calculate Price
    let price = SERVICE_PRICES[service] || 0;

    // Check quotas/limits
    let useQuota = false;
    const availableLimits = user.limits || user.quotas || {};
    
    if (availableLimits[service] && availableLimits[service] > 0) {
      const confirmMsg = `У вас есть доступная квота на эту услугу (${availableLimits[service]} шт.). Использовать квоту?`;
      useQuota = await new Promise<boolean>((resolve) => {
        try {
          WebApp.showConfirm(confirmMsg, (ok) => resolve(ok));
        } catch (e) {
          resolve(window.confirm(confirmMsg));
        }
      });
    }

    let payableAmount = useQuota ? 0 : price;
    let balanceDeduction = 0;

    if (payableAmount > 0) {
      balanceDeduction = Math.min(payableAmount, balance);
      payableAmount = payableAmount - balanceDeduction;
    }

    let confirmMsg = '';
    if (useQuota) {
      confirmMsg = `Подтвердить вызов по квоте?`;
    } else if (payableAmount === 0) {
      confirmMsg = `Стоимость услуги: ${price.toFixed(2)} Br. Вся сумма будет списана с вашего депозита. Продолжить?`;
    } else if (balanceDeduction > 0) {
      confirmMsg = `Стоимость услуги: ${price.toFixed(2)} Br. С депозита спишется ${balanceDeduction.toFixed(2)} Br, к оплате останется ${payableAmount.toFixed(2)} Br. Продолжить?`;
    } else {
      confirmMsg = `Стоимость услуги: ${price.toFixed(2)} Br. Оплатить вызов?`;
    }

    const proceed = await new Promise<boolean>((resolve) => {
      try {
        WebApp.showConfirm(confirmMsg, (ok) => resolve(ok));
      } catch (e) {
        resolve(window.confirm(confirmMsg));
      }
    });

    if (!proceed) return;

    setSubmitting(true);

    // Case 1: No external payment needed
    if (payableAmount === 0) {
      const toastId = toast.loading('Оформление поручения...');
      try {
        // 1. Deduct from balance if needed
        if (balanceDeduction > 0) {
          await addDoc(collection(db, 'transactions'), {
            userId: user.uid,
            type: 'deposit_deduction',
            amount: balanceDeduction,
            description: `Оплата услуги "${service}"`,
            createdAt: new Date().toISOString()
          });
        }

        // 2. Decrement quota/limit if needed and increment usedQuotas
        if (useQuota) {
          const updateData: any = {};
          
          if (user.limits) {
            const newLimits = { ...user.limits };
            newLimits[service] -= 1;
            updateData.limits = newLimits;
          } else if (user.quotas) {
            const newQuotas = { ...user.quotas };
            newQuotas[service] -= 1;
            updateData.quotas = newQuotas;
          }

          const newUsedQuotas = { ...(user.usedQuotas || {}) };
          newUsedQuotas[service] = (newUsedQuotas[service] || 0) + 1;
          updateData.usedQuotas = newUsedQuotas;

          await updateDoc(doc(db, 'users', user.uid), updateData);
        }

        // 3. Create request
        const docRef = await addDoc(collection(db, 'requests'), {
          userId: user.uid,
          carId: selectedCarId,
          serviceType: service,
          status: 'pending',
          usedQuota: useQuota,
          pickupAddress,
          deliveryAddress: service === 'logistics' ? deliveryAddress : '',
          orderDate,
          orderTime,
          washType: service === 'wash' ? washType : '',
          comment,
          price,
          balanceDeduction,
          paidExternally: 0,
          createdAt: new Date().toISOString()
        });

        // 4. Notify admins
        await notifyAdmins(docRef.id, service, useQuota, balanceDeduction, 0);

        toast.success('Поручение успешно отправлено!', { id: toastId });
        WebApp.HapticFeedback.notificationOccurred('success');
        
        // Reset form
        setPickupAddress('');
        setDeliveryAddress('');
        setComment('');
      } catch (error) {
        console.error('Order error:', error);
        toast.error('Ошибка при оформлении поручения', { id: toastId });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Case 2: Payment needed via bePaid
    const toastId = toast.loading('Создание счета...');
    try {
      // Create a pending order to avoid Telegram payload size limits (128 bytes)
      const pendingOrderRef = await addDoc(collection(db, 'pending_orders'), {
        userId: user.uid,
        carId: selectedCarId,
        serviceType: service,
        pickupAddress,
        deliveryAddress,
        orderDate,
        orderTime,
        washType,
        comment,
        price,
        balanceDeduction,
        paidExternally: payableAmount,
        createdAt: new Date().toISOString()
      });

      const response = await fetch('/api/payments/bepaid/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          amount: payableAmount,
          type: 'service_order',
          pendingOrderId: pendingOrderRef.id,
          description: `Оплата услуги ${service} (списано ${balanceDeduction.toFixed(2)} Br с депозита)`
        })
      });

      if (!response.ok) throw new Error('Failed to create invoice');
      const { payment_url, isNative } = await response.json();

      if (isNative) {
        WebApp.openInvoice(payment_url, (status) => {
          if (status === 'paid') {
            toast.success('Оплата прошла успешно! Поручение принято.', { id: toastId });
            WebApp.HapticFeedback.notificationOccurred('success');
            setPickupAddress('');
            setDeliveryAddress('');
            setComment('');
          } else {
            toast.dismiss(toastId);
          }
        });
      } else {
        if (WebApp.platform !== 'unknown') {
          WebApp.openLink(payment_url);
          toast.success('Переход к оплате...', { id: toastId });
        } else {
          window.location.href = payment_url;
        }
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Ошибка при создании счета', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const notifyAdmins = async (requestId: string, serviceType: string, useQuota: boolean, balanceDeduction: number, paidExternally: number) => {
    const adminQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
    const adminSnaps = await getDocs(adminQuery);
    
    const serviceName = SERVICE_LABELS[serviceType] || serviceType;

    for (const adminDoc of adminSnaps.docs) {
      const adminData = adminDoc.data();
      createNotification(
        adminDoc.id,
        'Новое поручение',
        `Поступило новое поручение на "${serviceName}" от ${user?.firstName || 'клиента'}.`,
        'info',
        `/task/${requestId}`
      );

      if (adminData.telegramId) {
        try {
          await fetch('/api/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              telegramId: adminData.telegramId,
              message: `🏎️ Новое поручение!\n\nУслуга: ${serviceName}\nКлиент: ${user?.firstName || 'клиент'}\nОплата: ${useQuota ? 'Квота' : balanceDeduction > 0 ? `Депозит (${balanceDeduction}) + ${paidExternally}` : paidExternally}\n\nОткройте приложение для деталей.`
            })
          });
        } catch (e) {}
      }
    }
  };

  const [activeOrders, setActiveOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    
    // Fetch active orders
    const qOrders = query(
      collection(db, 'requests'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
      const orders: any[] = [];
      snapshot.forEach(doc => {
        orders.push({ id: doc.id, ...doc.data() });
      });
      setActiveOrders(orders);
    }, (error) => {
      console.error('Orders fetch error:', error);
    });

    return () => unsubscribeOrders();
  }, [user]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 rounded-full text-[10px] uppercase font-bold">Ожидание</span>;
      case 'accepted': return <span className="px-2 py-0.5 bg-blue-500/20 text-blue-500 rounded-full text-[10px] uppercase font-bold">Принято</span>;
      case 'in_progress': return <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-500 rounded-full text-[10px] uppercase font-bold">В работе</span>;
      case 'completed': return <span className="px-2 py-0.5 bg-green-500/20 text-green-500 rounded-full text-[10px] uppercase font-bold">Завершено</span>;
      case 'cancelled': return <span className="px-2 py-0.5 bg-red-500/20 text-red-500 rounded-full text-[10px] uppercase font-bold">Отменено</span>;
      default: return <span className="px-2 py-0.5 bg-zinc-500/20 text-zinc-500 rounded-full text-[10px] uppercase font-bold">{status}</span>;
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-zinc-500">Загрузка...</div>;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Active Orders Section */}
      {activeOrders.length > 0 && (
        <section className="mb-8 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 px-1">Активные поручения</h2>
          <div className="space-y-2">
            {activeOrders.map(order => (
              <div key={order.id} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                    {order.serviceType === 'logistics' && <Truck className="w-5 h-5 text-zinc-400" />}
                    {order.serviceType === 'valet' && <Key className="w-5 h-5 text-zinc-400" />}
                    {order.serviceType === 'parking' && <SquareParking className="w-5 h-5 text-zinc-400" />}
                    {order.serviceType === 'bureaucracy' && <FileText className="w-5 h-5 text-zinc-400" />}
                    {order.serviceType === 'wash' && <Droplets className="w-5 h-5 text-zinc-400" />}
                    {order.serviceType === 'service' && <Wrench className="w-5 h-5 text-zinc-400" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">
                        {order.serviceType === 'logistics' ? 'Логистика' : 
                         order.serviceType === 'valet' ? 'Валет' : 
                         order.serviceType === 'parking' ? 'Паркинг' : 
                         order.serviceType === 'bureaucracy' ? 'Бюрократия' : 
                         order.serviceType === 'wash' ? 'Мойка' : 'Сервис'}
                      </span>
                      {getStatusBadge(order.status)}
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      {new Date(order.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono text-zinc-400 flex items-center gap-1">{(order.price || 0).toFixed(2)} <BynIcon size="0.8em" /></p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <header className="mb-6 mt-2">
        <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Новое поручение</h1>
        <p className="text-zinc-400 text-sm mt-1">Оформление поручения на обслуживание</p>
      </header>

      {cars.length === 0 ? (
        <div className="text-center py-12 bg-zinc-900 rounded-2xl border border-zinc-800">
          <p className="text-zinc-400 mb-4">Для оформления поручения добавьте автомобиль в бортовой журнал и дождитесь его модерации</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <label className="block text-xs text-zinc-500 mb-2 uppercase tracking-wider">Выберите автомобиль</label>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {cars.map(car => (
                <button
                  key={car.id}
                  onClick={() => setSelectedCarId(car.id)}
                  className={`px-4 py-3 rounded-xl border flex items-center gap-3 whitespace-nowrap transition-colors ${
                    selectedCarId === car.id ? 'bg-accent/10 border-accent text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <Car size={18} className={selectedCarId === car.id ? 'text-accent' : 'text-zinc-500'} />
                  <div className="text-left">
                    <div className="text-sm font-medium">{car.make} {car.model}</div>
                    <div className="text-xs opacity-70">{car.plate}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs text-zinc-500 mb-2 uppercase tracking-wider">Выберите услугу</label>
            <div className="space-y-3">
              {SERVICES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setService(s.id)}
                  className={`w-full text-left p-4 rounded-xl border flex items-center gap-4 transition-colors ${
                    service === s.id ? 'bg-accent/10 border-accent' : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    service === s.id ? 'bg-accent text-black' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    <s.icon size={20} />
                  </div>
                  <div className="flex-1">
                    <div className={`font-bold text-sm ${service === s.id ? 'text-white' : 'text-zinc-300'}`}>{s.title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{s.desc}</div>
                  </div>
                  <div className={`text-sm font-mono font-bold ${service === s.id ? 'text-accent' : 'text-zinc-400'}`}>
                    {s.price}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 mb-8">
            {/* Pickup Address */}
            <div className="space-y-2 relative">
              <div className="flex justify-between items-center ml-1">
                <label className="block text-xs text-zinc-500 uppercase tracking-wider">Адрес подачи</label>
                {isPickupFocused && (
                  <button 
                    onClick={() => {
                      pickupRef.current?.blur();
                      setIsPickupFocused(false);
                    }}
                    className="text-[10px] font-bold uppercase text-accent flex items-center gap-1 bg-accent/10 px-2 py-1 rounded-lg"
                  >
                    Готово <Check size={10} />
                  </button>
                )}
              </div>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                <input 
                  ref={pickupRef}
                  type="text" 
                  placeholder="Улица, дом, подъезд" 
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  onFocus={() => handleFocus(pickupRef, setIsPickupFocused)}
                  onBlur={() => setTimeout(() => setIsPickupFocused(false), 100)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-10 pr-12 text-sm focus:outline-none focus:border-accent text-white" 
                />
                <button 
                  onClick={() => getCurrentLocation('pickup')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-accent hover:text-white transition-colors"
                >
                  <div className="text-[10px] font-bold uppercase">GPS</div>
                </button>
              </div>
            </div>

            {/* Delivery Address (only for logistics) */}
            {service === 'logistics' && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-300 relative">
                <div className="flex justify-between items-center ml-1">
                  <label className="block text-xs text-zinc-500 uppercase tracking-wider">Адрес доставки</label>
                  {isDeliveryFocused && (
                    <button 
                      onClick={() => {
                        deliveryRef.current?.blur();
                        setIsDeliveryFocused(false);
                      }}
                      className="text-[10px] font-bold uppercase text-accent flex items-center gap-1 bg-accent/10 px-2 py-1 rounded-lg"
                    >
                      Готово <Check size={10} />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input 
                    ref={deliveryRef}
                    type="text" 
                    placeholder="Куда доставить автомобиль?" 
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    onFocus={() => handleFocus(deliveryRef, setIsDeliveryFocused)}
                    onBlur={() => setTimeout(() => setIsDeliveryFocused(false), 100)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-10 pr-12 text-sm focus:outline-none focus:border-accent text-white" 
                  />
                  <button 
                    onClick={() => getCurrentLocation('delivery')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-accent hover:text-white transition-colors"
                  >
                    <div className="text-[10px] font-bold uppercase">GPS</div>
                  </button>
                </div>
              </div>
            )}

            {/* Wash Type (only for wash) */}
            {service === 'wash' && (
              <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                <label className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-xl cursor-pointer">
                  <div className={`w-6 h-6 rounded border flex items-center justify-center ${
                    washType === 'detailing' ? 'bg-amber-500 border-amber-500' : 'border-zinc-600'
                  }`}>
                    {washType === 'detailing' && <Check size={16} className="text-black" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-white">Дополнительные услуги детейлинга</div>
                    <div className="text-xs text-zinc-500">Укажите пожелания в комментарии</div>
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={washType === 'detailing'}
                    onChange={(e) => setWashType(e.target.checked ? 'detailing' : 'standard')}
                  />
                </label>
              </div>
            )}

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Дата</label>
                <select 
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 px-3 text-xs focus:outline-none focus:border-accent text-white appearance-none"
                >
                  <option value="today">Сегодня</option>
                  <option value="tomorrow">Завтра</option>
                  <option value="later">Позже (в чат)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Время</label>
                <select 
                  value={orderTime}
                  onChange={(e) => setOrderTime(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 px-3 text-xs focus:outline-none focus:border-accent text-white appearance-none"
                >
                  <option value="asap">Как можно скорее</option>
                  <option value="morning">Утро (09:00-12:00)</option>
                  <option value="afternoon">День (12:00-18:00)</option>
                  <option value="evening">Вечер (18:00-22:00)</option>
                </select>
              </div>
            </div>

            {/* Comment */}
            <div className="space-y-2 relative">
              <div className="flex justify-between items-center ml-1">
                <label className="block text-xs text-zinc-500 uppercase tracking-wider">
                  {service === 'service' ? 'Описание проблемы' : 'Комментарий для пилота'}
                </label>
                {isCommentFocused && (
                  <button 
                    onClick={() => {
                      commentRef.current?.blur();
                      setIsCommentFocused(false);
                    }}
                    className="text-[10px] font-bold uppercase text-accent flex items-center gap-1 bg-accent/10 px-2 py-1 rounded-lg"
                  >
                    Готово <Check size={10} />
                  </button>
                )}
              </div>
              <textarea 
                ref={commentRef}
                placeholder={service === 'service' ? 'Опишите, что нужно сделать или какие есть неисправности...' : 'Где лежат ключи, особенности парковки и т.д.'} 
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onFocus={() => handleFocus(commentRef, setIsCommentFocused)}
                onBlur={() => setTimeout(() => setIsCommentFocused(false), 100)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 px-4 text-sm focus:outline-none focus:border-accent text-white min-h-[100px] resize-none"
              />
            </div>
          </div>

          <label className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl cursor-pointer mb-6">
            <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
              safetyAccepted ? 'bg-red-500 border-red-500' : 'border-red-500/50'
            }`}>
              {safetyAccepted && <Check size={14} className="text-white" />}
            </div>
            <p className="text-xs text-red-400 font-medium leading-relaxed">
              Я подтверждаю, что ознакомлен с правилами: совместные поездки пилотов с владельцами запрещены регламентом безопасности.
            </p>
            <input 
              type="checkbox" 
              className="hidden" 
              checked={safetyAccepted}
              onChange={(e) => setSafetyAccepted(e.target.checked)}
            />
          </label>

          <button 
            onClick={handleOrder}
            disabled={submitting || !selectedCarId || !safetyAccepted}
            className="w-full bg-white text-black py-4 rounded-xl font-bold uppercase tracking-wider active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {submitting ? 'Отправка...' : 'Подтвердить вызов'}
          </button>
          <p className="text-center text-xs text-zinc-500 mt-4">
            Нажимая кнопку, вы соглашаетесь с условиями сервиса
          </p>
        </>
      )}
    </div>
  );
}


