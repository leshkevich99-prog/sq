import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { BynIcon } from '../components/BynIcon';
import { ArrowLeft, Car, Calendar, Clock, MapPin, Check, CreditCard, HelpCircle, Search, FileText, X } from 'lucide-react';
import toast from 'react-hot-toast';
import WebApp from '@twa-dev/sdk';
import { useFirebase } from '../components/FirebaseProvider';
import { useKeyboard } from '../hooks/useKeyboard';

export default function TestDrive() {
  const navigate = useNavigate();
  const { user } = useFirebase();
  const isKeyboardVisible = useKeyboard();
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

  // Оплата
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [activeMethod, setActiveMethod] = useState<'card' | 'erip' | 'b2b'>('card');
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [eripInfo, setEripInfo] = useState<{ erip_id: string; instruction: string; account_number: string } | null>(null);
  const [unp, setUnp] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

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

  // Шаг 1: Проверка формы и создание pending order
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

    setSubmitting(true);
    const toastId = toast.loading('Подготовка заказа...');

    try {
      const pendingOrderRes = await fetch('/api/pending_orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
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
          price: 500,
          createdAt: new Date().toISOString()
        })
      });

      if (!pendingOrderRes.ok) throw new Error('Ошибка при создании заказа');
      const pendingOrder = await pendingOrderRes.json();
      setPendingOrderId(pendingOrder.id);
      toast.dismiss(toastId);
      setPaymentModalOpen(true);
      WebApp.HapticFeedback.impactOccurred('medium');
    } catch (error: any) {
      console.error('Order creation error:', error);
      toast.error('Ошибка при создании заказа', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  // Оплата картой (Telegram Invoice)
  const handleCardPayment = async () => {
    if (!user || !pendingOrderId) return;
    setPaymentLoading(true);
    const toastId = toast.loading('Создание счета...');

    try {
      const response = await fetch('/api/payments/bepaid/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          userId: user.id,
          amount: 500,
          type: 'test_drive',
          pendingOrderId,
          description: `Оплата тест-драйва ${carModel}`
        })
      });

      if (!response.ok) throw new Error('Ошибка при создании счета');
      const { payment_url, isNative } = await response.json();

      if (isNative) {
        WebApp.openInvoice(payment_url, (status) => {
          if (status === 'paid') {
            toast.success('Оплата прошла! Заявка принята.', { id: toastId });
            WebApp.HapticFeedback.notificationOccurred('success');
            setPaymentModalOpen(false);
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
        setPaymentModalOpen(false);
        navigate('/');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error('Ошибка при создании счета', { id: toastId });
    } finally {
      setPaymentLoading(false);
    }
  };

  // Получение данных ЕРИП
  const handleEripCreate = async () => {
    if (!user || !pendingOrderId) return;
    setPaymentLoading(true);
    const toastId = toast.loading('Генерация счета ЕРИП...');

    try {
      const response = await fetch('/api/payments/erip/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          amount: 500,
          type: 'test_drive',
          pendingOrderId,
          description: `Тест-драйв Squadra: ${carModel}`
        })
      });

      if (!response.ok) throw new Error('Ошибка при создании счета ЕРИП');
      const data = await response.json();
      setEripInfo(data);
      WebApp.HapticFeedback.impactOccurred('medium');
      toast.success('Данные ЕРИП получены', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message, { id: toastId });
    } finally {
      setPaymentLoading(false);
    }
  };

  // Отчёт об оплате ЕРИП
  const handleEripReport = async () => {
    setPaymentLoading(true);
    const toastId = toast.loading('Отправка уведомления...');
    try {
      const response = await fetch('/api/payments/erip-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ amount: 500, type: 'test_drive' })
      });

      if (!response.ok) throw new Error('Ошибка при отправке отчета');
      WebApp.HapticFeedback.notificationOccurred('success');
      WebApp.showAlert('Спасибо! Получили уведомление. После подтверждения администратором заявка на тест-драйв будет активирована.');
      setPaymentModalOpen(false);
      navigate('/');
      toast.dismiss(toastId);
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    } finally {
      setPaymentLoading(false);
    }
  };

  // Запрос B2B счёта
  const handleB2BRequest = async () => {
    if (!unp || !companyName) {
      toast.error('Введите УНП и название компании');
      return;
    }
    setPaymentLoading(true);
    const toastId = toast.loading('Обработка запроса...');
    try {
      const response = await fetch('/api/payments/b2b-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ unp, companyName, amount: 500, email, type: 'test_drive', pendingOrderId })
      });

      if (!response.ok) throw new Error('Ошибка при отправке запроса');
      WebApp.HapticFeedback.notificationOccurred('success');
      WebApp.showAlert('Ваша заявка на выставление счета (B2B) принята. Менеджер Squadra свяжется с вами в ближайшее время.');
      setPaymentModalOpen(false);
      navigate('/');
      toast.dismiss(toastId);
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 w-full max-w-full overflow-x-hidden">
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md pt-4 pb-4 -mx-4 px-4 mb-4 border-b border-zinc-900/50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              navigate(-1);
              WebApp.HapticFeedback.impactOccurred('light');
            }}
            className="p-2 bg-zinc-900 rounded-full border border-zinc-800 active:scale-90 transition-transform"
          >
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
                <span className="font-bold">{existingBooking.title?.replace('Тест-драйв: ', '')}</span>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <Calendar className="text-zinc-500" size={18} />
                <span>Запланировано на: <strong>{existingBooking.description?.split('Дата: ')[1]}</strong></span>
              </div>
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <MapPin className="text-zinc-500" size={18} />
                <span className="truncate">Адрес: {existingBooking.description?.split('Адрес: ')[1]?.split('. Дата')[0]}</span>
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
            <input
              type="text"
              placeholder="Имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 px-4 text-sm focus:outline-none focus:border-amber-500 text-white"
            />
          </div>

          <div className="space-y-2 w-full">
            <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Телефон</label>
            <input
              type="tel"
              inputMode="tel"
              placeholder="+375 (XX) XXX-XX-XX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 px-4 text-sm focus:outline-none focus:border-amber-500 text-white"
            />
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
            <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Адрес местонахождения ТС</label>
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
                  WebApp.HapticFeedback.impactOccurred('medium');
                  if (!navigator.geolocation) { toast.error('Геолокация не поддерживается'); return; }
                  toast.loading('Определение местоположения...', { duration: 2000 });
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      setAddress(`Мое местоположение (${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)})`);
                      toast.success('Местоположение определено');
                    },
                    () => toast.error('Не удалось определить местоположение')
                  );
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 hover:text-white transition-colors active:scale-90"
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
                  WebApp.HapticFeedback.impactOccurred('medium');
                  if (!navigator.geolocation) { toast.error('Геолокация не поддерживается'); return; }
                  toast.loading('Определение местоположения...', { duration: 2000 });
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      setReturnAddress(`Мое местоположение (${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)})`);
                      toast.success('Местоположение определено');
                    },
                    () => toast.error('Не удалось определить местоположение')
                  );
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 hover:text-white transition-colors active:scale-90"
              >
                <div className="text-[10px] font-bold uppercase">GPS</div>
              </button>
            </div>
          </div>

          <div className="flex flex-col min-[360px]:grid min-[360px]:grid-cols-2 gap-3 w-full">
            <div className="min-w-0 space-y-2">
              <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Дата</label>
              <div className="relative w-full">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl py-3.5 px-4 text-sm focus:outline-none focus:border-amber-500 text-white box-border appearance-none [color-scheme:dark]"
                />
              </div>
            </div>
            <div className="min-w-0 space-y-2">
              <label className="block text-xs text-zinc-500 uppercase tracking-wider ml-1">Время</label>
              <div className="relative w-full">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl py-3.5 px-4 text-sm focus:outline-none focus:border-amber-500 text-white box-border appearance-none [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-6">
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex justify-between items-center">
              <span className="text-sm text-zinc-400">Стоимость тест-драйва:</span>
              <span className="text-lg font-mono font-bold text-white flex items-center gap-1">500.00 <BynIcon size="0.8em" /></span>
            </div>

            {!isKeyboardVisible && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
                <label className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl cursor-pointer">
                  <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${safetyAccepted ? 'bg-red-500 border-red-500' : 'border-red-500/50'}`}>
                    {safetyAccepted && <Check size={14} className="text-white" />}
                  </div>
                  <p className="text-xs text-red-400 font-medium leading-relaxed">
                    Я подтверждаю, что ознакомлен с правилами: совместные поездки пилотов с владельцами запрещены регламентом безопасности.
                  </p>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={safetyAccepted}
                    onChange={(e) => {
                      setSafetyAccepted(e.target.checked);
                      WebApp.HapticFeedback.impactOccurred('medium');
                    }}
                  />
                </label>

                <button
                  type="submit"
                  disabled={submitting || !safetyAccepted}
                  onClick={() => WebApp.HapticFeedback.impactOccurred('medium')}
                  className="w-full py-4 bg-amber-500 text-black rounded-xl font-bold uppercase tracking-widest text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  {submitting ? 'Подготовка...' : safetyAccepted ? 'Перейти к оплате' : 'Примите регламент'}
                </button>
              </div>
            )}
          </div>
        </form>
      )}

      {/* Payment Method Modal via Portal */}
      {paymentModalOpen && document.body && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setPaymentModalOpen(false)} />
          <div className="relative bg-zinc-900 rounded-t-[32px] w-full animate-in slide-in-from-bottom duration-300 border-t border-zinc-800 max-h-[95vh] flex flex-col">
            <div className="p-6 pb-2 shrink-0">
              <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-6" />
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xl font-bold uppercase tracking-tighter">Оплата тест-драйва</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Выберите способ оплаты — 500.00 BYN</p>
                </div>
                <button onClick={() => setPaymentModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors p-2">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="px-6 pb-28 overflow-y-auto flex-1">
              {/* Метод выбора */}
              <div className="flex gap-2 p-1 bg-black/40 rounded-xl mb-6 border border-zinc-800/50">
                {(['card', 'erip', 'b2b'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setActiveMethod(m); WebApp.HapticFeedback.impactOccurred('light'); }}
                    className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeMethod === m ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {m === 'card' ? 'Карта' : m === 'erip' ? 'ЕРИП' : 'Счёт B2B'}
                  </button>
                ))}
              </div>

              {/* Карта */}
              {activeMethod === 'card' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-4 bg-zinc-800/50 rounded-xl text-center space-y-1">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest">К оплате</p>
                    <p className="text-3xl font-mono font-bold">500.00 <span className="text-zinc-500 text-xl">BYN</span></p>
                  </div>
                  <button
                    onClick={handleCardPayment}
                    disabled={paymentLoading}
                    className="w-full h-14 bg-white text-black rounded-2xl flex items-center justify-center gap-2 font-bold uppercase tracking-[0.2em] disabled:opacity-50 active:scale-[0.98] transition-all"
                  >
                    {paymentLoading ? <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <><CreditCard size={20} /><span>ОПЛАТИТЬ КАРТОЙ</span></>}
                  </button>
                  <p className="text-[10px] text-zinc-500 text-center uppercase tracking-widest opacity-60">Безопасная оплата через Telegram / bePaid (РБ)</p>
                </div>
              )}

              {/* ЕРИП */}
              {activeMethod === 'erip' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {!eripInfo ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                        <HelpCircle size={32} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Готовы к оплате?</p>
                        <p className="text-xs text-zinc-500 mt-1">Нажмите кнопку ниже, чтобы получить<br />номер счета в системе ЕРИП</p>
                      </div>
                      <button
                        onClick={handleEripCreate}
                        disabled={paymentLoading}
                        className="px-8 py-3 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                      >
                        {paymentLoading ? 'Генерация...' : 'Получить номер счета'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-black/50 border border-emerald-500/20 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center gap-3 text-emerald-500">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <Check size={18} />
                          </div>
                          <span className="text-xs font-bold uppercase tracking-wider">Счет ЕРИП сформирован</span>
                        </div>
                        <div className="space-y-2 text-[11px] text-zinc-400 leading-relaxed font-mono uppercase">
                          <p className="text-zinc-500 text-[9px] mb-1">Путь в дереве ЕРИП:</p>
                          <p>{eripInfo.instruction}</p>
                        </div>
                        <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                          <div>
                            <div className="text-[8px] text-zinc-500 uppercase tracking-widest mb-1">Номер счета (bePaid)</div>
                            <div className="text-lg font-bold text-white tracking-widest">{eripInfo.erip_id}</div>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(eripInfo!.erip_id);
                              WebApp.HapticFeedback.notificationOccurred('success');
                              toast.success('Номер скопирован');
                            }}
                            className="text-xs bg-zinc-800 text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest active:bg-zinc-700"
                          >
                            Копировать
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={handleEripReport}
                        disabled={paymentLoading}
                        className="w-full h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-2xl flex items-center justify-center gap-2 font-bold uppercase tracking-[0.2em] hover:bg-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        <Search size={20} />
                        <span>Я ОПЛАТИЛ В ЕРИП</span>
                      </button>
                      <button
                        onClick={() => { setEripInfo(null); WebApp.HapticFeedback.impactOccurred('light'); }}
                        className="w-full py-2 text-[10px] text-zinc-500 uppercase font-bold tracking-widest hover:text-zinc-400"
                      >
                        Назад
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* B2B */}
              {activeMethod === 'b2b' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block px-1">УНП вашей организации</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="123456789"
                        value={unp}
                        onChange={(e) => setUnp(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block px-1">Название (ООО/ИП)</label>
                      <input
                        type="text"
                        placeholder="ООО АВТО-ЛЮКС"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block px-1">Email для счета</label>
                      <input
                        type="email"
                        placeholder="info@company.by"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleB2BRequest}
                    disabled={paymentLoading || !unp || !companyName}
                    className="w-full h-14 bg-zinc-100 text-black rounded-2xl flex items-center justify-center gap-2 font-bold uppercase tracking-[0.2em] transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {paymentLoading
                      ? <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                      : <><FileText size={20} /><span>ПОЛУЧИТЬ СЧЕТ</span></>
                    }
                  </button>
                  <p className="text-[8px] text-zinc-500 text-center uppercase tracking-[0.2em] leading-normal">
                    Менеджер сформирует счет и свяжется с вами<br />в течение 15 минут
                  </p>
                </div>
              )}
              {/* Safe area for keyboard in Modal (B2B Form, etc) */}
              {isKeyboardVisible && <div className="h-64" />}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
