import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BynIcon } from '../components/BynIcon';
import { ArrowLeft, Car, Calendar, Clock, MapPin, Check } from 'lucide-react';
import toast from 'react-hot-toast';
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
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!name || !phone || !carModel || !date || !time || !address) {
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
      // Create a pending test drive order
      const pendingOrderRef = await addDoc(collection(db, 'pending_orders'), {
        userId: user.uid,
        type: 'test_drive',
        name,
        phone,
        carModel,
        date,
        time,
        address,
        price: 500,
        createdAt: new Date().toISOString()
      });

      const response = await fetch('/api/payments/bepaid/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          amount: 500,
          type: 'test_drive',
          pendingOrderId: pendingOrderRef.id,
          description: `Оплата тест-драйва`
        })
      });

      if (!response.ok) throw new Error('Failed to create invoice');
      const { payment_url } = await response.json();

      // @ts-ignore
      if (window.Telegram?.WebApp?.openInvoice) {
        // @ts-ignore
        window.Telegram.WebApp.openInvoice(payment_url, (status) => {
          if (status === 'paid') {
            toast.success('Оплата прошла успешно! Поручение принято.', { id: toastId });
            // @ts-ignore
            if (window.Telegram?.WebApp?.HapticFeedback) {
              // @ts-ignore
              window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
            navigate('/');
          } else {
            toast.dismiss(toastId);
          }
        });
      } else {
        // Fallback for web
        window.open(payment_url, '_blank');
        toast.success('Счет открыт в новой вкладке. После оплаты поручение будет принято.', { id: toastId });
        navigate('/');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Ошибка при создании счета', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 bg-zinc-900 rounded-full border border-zinc-800">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider">Тест-драйв</h1>
          <p className="text-xs text-zinc-500">Попробуйте наш сервис за 500 Br</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Ваше имя</label>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Имя" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 px-4 text-sm focus:outline-none focus:border-amber-500 text-white" 
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Телефон</label>
          <div className="relative">
            <input 
              type="tel" 
              placeholder="+375 (XX) XXX-XX-XX" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 px-4 text-sm focus:outline-none focus:border-amber-500 text-white" 
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Марка и модель авто</label>
          <div className="relative">
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

        <div className="space-y-2">
          <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Адрес подачи</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input 
              type="text" 
              placeholder="Улица, дом" 
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-10 pr-4 text-sm focus:outline-none focus:border-amber-500 text-white" 
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Дата</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-10 pr-4 text-sm focus:outline-none focus:border-amber-500 text-white [color-scheme:dark]" 
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Время</label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input 
                type="time" 
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-10 pr-4 text-sm focus:outline-none focus:border-amber-500 text-white [color-scheme:dark]" 
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
    </div>
  );
}
