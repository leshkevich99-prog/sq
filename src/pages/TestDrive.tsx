import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BynIcon } from '../components/BynIcon';
import { ArrowLeft, Car, Calendar, Clock, MapPin, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import WebApp from '@twa-dev/sdk';
import { useFirebase } from '../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, collection, addDoc } from '../firebase';

export default function TestDrive() {
  const navigate = useNavigate();
  const { user } = useFirebase();
  const [name, setName] = useState(user?.firstName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [carModel, setCarModel] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [returnAddress, setReturnAddress] = useState('');
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [existingBooking, setExistingBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    if (user) {
      if (!name) setName(user.firstName || '');
      if (!phone) setPhone(user.phone || '');
    }
  }, [user]);

  React.useEffect(() => {
    const checkBookings = async () => {
      if (!user) return;
      try {
        const response = await fetch('/api/requests', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (response.ok) {
          const data = await response.json();
          const testDrive = data.requests?.find((r: any) => 
            r.userId === user.id && r.type === 'test_drive' && r.status !== 'completed' && r.status !== 'cancelled'
          );
          if (testDrive) setExistingBooking(testDrive);
        }
      } catch (e) {
        console.error('Check bookings error:', e);
      } finally {
        setLoading(false);
      }
    };
    checkBookings();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!name || !phone || !carModel || !date || !time || !address || !returnAddress) {
      toast.error('Пожалуйста, заполните все поля');
      return;
    }

    if (!safetyAccepted) {
      toast.error('Необходимо подтвердить согласие с регламентом безопасности');
      return;
    }

    const confirmMsg = `Стоимость тест-драйва: 500.00 Br. Оплатить вызов?`;
    const proceed = await new Promise<boolean>((resolve) => {
      try {
        // @ts-ignore
        if (window.Telegram?.WebApp?.showConfirm) {
          // @ts-ignore
          window.Telegram.WebApp.showConfirm(confirmMsg, (ok) => resolve(ok));
        } else {
          resolve(window.confirm(confirmMsg));
        }
      } catch (e) {
        resolve(window.confirm(confirmMsg));
      }
    });

    if (!proceed) return;

    setSubmitting(true);
    const toastId = toast.loading('Создание счета...');

    try {
      const testDrivePrice = 500;
      const pendingOrderRes = await fetch('/api/pending_orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          type: 'test_drive',
          name,
          phone,
          carModel,
          date,
          time,
          address,
          returnAddress,
          price: testDrivePrice,
          createdAt: new Date().toISOString()
        })
      });

      if (!pendingOrderRes.ok) throw new Error('Failed to create pending order via API');
      const pendingOrder = await pendingOrderRes.json();
      const pendingOrderId = pendingOrder.id;

      const response = await fetch('/api/payments/bepaid/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          userId: user.id,
          amount: testDrivePrice,
          type: 'test_drive',
          pendingOrderId: pendingOrderId,
          description: `Оплата тест-драйва ${carModel}`
        })
      });

      if (!response.ok) throw new Error('Failed to create invoice');
      const { payment_url, isNative } = await response.json();

      // 2. Open Payment Link
      if (isNative) {
        WebApp.openInvoice(payment_url, (status) => {
          if (status === 'paid') {
            toast.success('Оплата прошла успешно! Заявка принята.', { id: toastId });
            WebApp.HapticFeedback.notificationOccurred('success');
            navigate('/');
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
        navigate('/');
      }
    } catch (error: any) {
      console.error('Payment error:', error); // Reverted to original console.error message
      toast.error('Ошибка при создании счета', { id: toastId }); // Reverted to original toast message
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 w-full max-w-full overflow-x-hidden">
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md pt-4 pb-4 -mx-4 px-4 mb-4 border-b border-zinc-900/50">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 bg-zinc-900 rounded-full border border-zinc-800 active:scale-90 transition-transform">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wider">Тест-драйв</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-tighter">Попробуйте наш сервис за 500 Br</p>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
        </div>
      ) : existingBooking ? (
        <div className="space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center">
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Вы записаны на тест-драйв</h2>
            <p className="text-zinc-400 text-sm">Ваша заявка успешно оплачена и принята в работу</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800 bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <Car className="text-amber-500" size={20} />
                <span className="font-bold">{existingBooking.title.replace('Тест-драйв: ', '')}</span>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <Calendar className="text-zinc-500" size={18} />
                <span>Запланировано на: <strong>{existingBooking.description.split('Дата: ')[1]}</strong></span>
              </div>
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <MapPin className="text-zinc-500" size={18} />
                <span className="truncate">Адрес: {existingBooking.description.split('Адрес: ')[1]?.split('. Дата')[0]}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => navigate('/')}
            className="w-full py-4 bg-zinc-800 text-white rounded-xl font-bold uppercase tracking-widest text-sm"
          >
            Вернуться на главную
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-full overflow-x-hidden">
        <div className="space-y-2 w-full">
          <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Ваше имя</label>
          <div className="relative w-full">
            <input 
              type="text" 
              placeholder="Имя" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 px-4 text-sm focus:outline-none focus:border-amber-500 text-white" 
            />
          </div>
        </div>

        <div className="space-y-2 w-full">
          <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Телефон</label>
          <div className="relative w-full">
            <input 
              type="tel" 
              placeholder="+375 (XX) XXX-XX-XX" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 px-4 text-sm focus:outline-none focus:border-amber-500 text-white" 
            />
          </div>
        </div>

        <div className="space-y-2 w-full">
          <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Марка и модель авто</label>
          <div className="relative w-full">
            <Car className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input 
              type="text" 
              placeholder="Например, Porsche 911" 
              value={carModel}
              onChange={(e) => setCarModel(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-10 pr-4 text-sm focus:outline-none focus:border-amber-500 text-white" 
            />
          </div>
        </div>

        <div className="space-y-2 w-full">
          <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Адрес забора</label>
          <div className="relative w-full">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input 
              type="text" 
              placeholder="Улица, дом" 
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-10 pr-12 text-sm focus:outline-none focus:border-amber-500 text-white" 
            />
            <button 
              type="button"
              onClick={() => {
                if (!navigator.geolocation) {
                  toast.error('Геолокация не поддерживается вашим браузером');
                  return;
                }
                toast.loading('Определение местоположения...', { duration: 2000 });
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    const coords = `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
                    setAddress(`Мое местоположение (${coords})`);
                    toast.success('Местоположение определено');
                  },
                  (error) => {
                    console.error('Geolocation error:', error);
                    toast.error('Не удалось определить местоположение');
                  }
                );
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 hover:text-white transition-colors"
            >
              <div className="text-[10px] font-bold uppercase">GPS</div>
            </button>
          </div>
        </div>

        <div className="space-y-2 w-full">
          <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Адрес возврата</label>
          <div className="relative w-full">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input 
              type="text" 
              placeholder="Куда вернуть автомобиль?" 
              value={returnAddress}
              onChange={(e) => setReturnAddress(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-10 pr-12 text-sm focus:outline-none focus:border-amber-500 text-white" 
            />
            <button 
              type="button"
              onClick={() => {
                if (!navigator.geolocation) {
                  toast.error('Геолокация не поддерживается вашим браузером');
                  return;
                }
                toast.loading('Определение местоположения...', { duration: 2000 });
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    const coords = `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
                    setReturnAddress(`Мое местоположение (${coords})`);
                    toast.success('Местоположение определено');
                  },
                  (error) => {
                    console.error('Geolocation error:', error);
                    toast.error('Не удалось определить местоположение');
                  }
                );
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 hover:text-white transition-colors"
            >
              <div className="text-[10px] font-bold uppercase">GPS</div>
            </button>
          </div>
        </div>

        <div className="flex flex-col min-[360px]:flex-row gap-3 w-full">
          <div className="flex-[1.4] space-y-2">
            <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Дата</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={14} />
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3.5 pl-9 pr-2 text-sm focus:outline-none focus:border-amber-500 text-white [color-scheme:dark]" 
              />
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Время</label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={14} />
              <input 
                type="time" 
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3.5 pl-9 pr-2 text-sm focus:outline-none focus:border-amber-500 text-white [color-scheme:dark]" 
              />
            </div>
          </div>
        </div>

        <div className="pt-4 space-y-6">
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex justify-between items-center">
            <span className="text-sm text-zinc-400">Стоимость тест-драйва:</span>
            <span className="text-lg font-mono font-bold text-white flex items-center gap-1">500.00 <BynIcon size="0.8em" /></span>
          </div>

          <label className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl cursor-pointer">
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
            type="submit"
            disabled={submitting || !safetyAccepted}
            className="w-full py-4 bg-amber-500 text-black rounded-xl font-bold uppercase tracking-widest text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            {submitting ? 'Отправка...' : safetyAccepted ? 'Оплатить и записаться' : 'Примите регламент'}
          </button>
        </div>
      </form>
    )}
  </div>
);
}
