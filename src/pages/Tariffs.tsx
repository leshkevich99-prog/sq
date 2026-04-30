import React, { useState, useEffect } from 'react';
import { BynIcon } from '../components/BynIcon';
import { Check, Calendar, Clock } from 'lucide-react';
import { useFirebase } from '../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, doc, updateDoc, addDoc, collection, query, where, onSnapshot } from '../firebase';
import toast from 'react-hot-toast';
import WebApp from '@twa-dev/sdk';

const TARIFF_PRICES: Record<string, number> = {
  'TELEMETRY': 1400,
  'PIT STOP': 2400,
  'SQUADRA FAMILY': 4000,
};

export default function Tariffs() {
  const { user, refreshAuth } = useFirebase();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'transactions'), 
      where('userId', '==', user.uid)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
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

    return () => unsubscribe();
  }, [user]);

  const handlePurchase = async (tariffName: string, price: number, quotas: any) => {
    if (!user) return;
    
    const currentTariff = user.subscription || '';
    const currentPrice = TARIFF_PRICES[currentTariff] || 0;
    const priceDifference = Math.max(0, price - currentPrice);
    
    let payableAmount = priceDifference;
    let balanceDeduction = 0;

    if (priceDifference > 0) {
      balanceDeduction = Math.min(priceDifference, balance);
      payableAmount = priceDifference - balanceDeduction;
    } else {
      // Downgrade or same price - no charge, no refund
      payableAmount = 0;
      balanceDeduction = 0;
    }

    let confirmMsg = '';
    if (priceDifference === 0) {
      confirmMsg = `Перейти на тариф ${tariffName}?`;
    } else if (payableAmount === 0) {
      confirmMsg = `Сменить тариф на ${tariffName}? С вашего депозита будет списано ${balanceDeduction.toFixed(2)} Br.`;
    } else if (balanceDeduction > 0) {
      confirmMsg = `Сменить тариф на ${tariffName}? С депозита спишется ${balanceDeduction.toFixed(2)} Br, к оплате останется ${payableAmount.toFixed(2)} Br.`;
    } else {
      confirmMsg = `Оплатить переход на тариф ${tariffName} за ${payableAmount.toFixed(2)} Br?`;
    }
    
    const proceed = await new Promise<boolean>((resolve) => {
      try {
        WebApp.showConfirm(confirmMsg, (ok) => resolve(ok));
      } catch (e) {
        resolve(window.confirm(confirmMsg));
      }
    });

    if (!proceed) return;

    setPurchasing(tariffName);
    
    // Case 1: No payment needed (downgrade or fully covered by balance)
    if (payableAmount === 0) {
      const toastId = toast.loading('Обновление тарифа...');
      try {
        // 1. Deduct from balance if needed
        if (balanceDeduction > 0) {
          await addDoc(collection(db, 'transactions'), {
            userId: user.uid,
            type: 'deposit_deduction',
            amount: balanceDeduction,
            description: `Доплата за переход на тариф ${tariffName}`,
            createdAt: new Date().toISOString()
          });
        }

        // 2. Update user tariff via API
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const updRes = await fetch('/api/users/profile', {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({ 
            tariff: tariffName,
            subscription: tariffName,
            subscriptionStartedAt: new Date().toISOString(),
            subscriptionExpiresAt: expiresAt,
            quotas: quotas
          })
        });

        if (!updRes.ok) throw new Error('Failed to update tariff via API');

        toast.success(`Тариф ${tariffName} успешно активирован!`, { id: toastId });
        WebApp.HapticFeedback.notificationOccurred('success');
        // Обновляем данные пользователя через 2 сек - даем серверу время записать изменения
        setTimeout(() => refreshAuth(), 2000);
      } catch (error) {
        console.error('Tariff update error:', error);
        toast.error('Ошибка при обновлении тарифа', { id: toastId });
      } finally {
        setPurchasing(null);
      }
      return;
    }

    // Case 2: Payment needed via bePaid
    const toastId = toast.loading('Создание счета...');

    try {
      // 1. Create invoice link via backend
      const response = await fetch('/api/payments/bepaid/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          userId: user.uid,
          amount: payableAmount,
          type: 'subscription',
          tariffName,
          quotas,
          balanceDeduction, // Pass this to backend so bot can handle it after successful payment
          description: `Доплата за тариф ${tariffName} (с учетом списания ${balanceDeduction.toFixed(2)} Br с депозита)`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create invoice');
      }

      const { payment_url, isNative } = await response.json();

      // 2. Open Payment Link
      if (isNative) {
        WebApp.openInvoice(payment_url, (status) => {
          if (status === 'paid') {
            toast.success(`Тариф ${tariffName} успешно оплачен!`, { id: toastId });
            WebApp.HapticFeedback.notificationOccurred('success');
            setPurchasing(null);
            // Обновляем данные пользователя через 3 сек - даем боту время обработать платеж
            setTimeout(() => refreshAuth(), 3000);
          } else if (status === 'cancelled') {
            toast.error('Оплата отменена', { id: toastId });
          } else if (status === 'failed') {
            toast.error('Ошибка при оплате', { id: toastId });
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
      setPurchasing(null);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <header className="mb-6 mt-2">
        <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Уровни сопровождения</h1>
        <p className="text-zinc-400 text-sm mt-1">Выберите подходящий объем обслуживания</p>
      </header>

      <div className="space-y-4">
        <TariffCard 
          name="TELEMETRY"
          price={1400}
          isActive={user?.subscription === 'TELEMETRY'}
          isPurchasing={purchasing === 'TELEMETRY'}
          expiresAt={user?.subscription === 'TELEMETRY' ? (user as any).subscriptionExpiresAt : undefined}
          onPurchase={() => handlePurchase('TELEMETRY', 1400, { logistics: 1, wash: 2 })}
          features={[
            "Бортовой журнал автомобиля",
            "1 логистическое поручение",
            "2 комплексные трехфазные мойки",
            "Сезонное хранение 1 комплекта шин"
          ]}
        />
        <TariffCard 
          name="PIT STOP"
          price={2400}
          isActive={user?.subscription === 'PIT STOP'}
          isPurchasing={purchasing === 'PIT STOP'}
          expiresAt={user?.subscription === 'PIT STOP' ? (user as any).subscriptionExpiresAt : undefined}
          onPurchase={() => handlePurchase('PIT STOP', 2400, { logistics: 2, wash: 4 })}
          features={[
            "Бортовой журнал автомобиля",
            "2 логистических поручения",
            "4 комплексные трехфазные мойки",
            "Сезонное хранение 1 комплекта шин"
          ]}
        />
        <TariffCard 
          name="SQUADRA FAMILY"
          price={4000}
          isActive={user?.subscription === 'SQUADRA FAMILY'}
          isPurchasing={purchasing === 'SQUADRA FAMILY'}
          expiresAt={user?.subscription === 'SQUADRA FAMILY' ? (user as any).subscriptionExpiresAt : undefined}
          onPurchase={() => handlePurchase('SQUADRA FAMILY', 4000, { logistics: 4, wash: 8 })}
          features={[
            "Бортовой журнал для двух авто",
            "4 логистических поручения",
            "8 комплексных трехфазных моек",
            "Сезонное хранение 2 комплектов шин"
          ]}
        />
      </div>
    </div>
  );
}

function TariffCard({ 
  name, 
  price,
  features, 
  isActive, 
  isPurchasing,
  expiresAt,
  onPurchase 
}: { 
  name: string; 
  price: number;
  features: string[]; 
  isActive?: boolean;
  isPurchasing?: boolean;
  expiresAt?: string;
  onPurchase: () => void;
}) {
  const handleClick = () => {
    if (!isActive && !isPurchasing) {
      WebApp.HapticFeedback.impactOccurred('medium');
      onPurchase();
    }
  };

  const daysLeft = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const expiresFormatted = expiresAt
    ? new Date(expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const isExpiringSoon = daysLeft !== null && daysLeft <= 3;

  return (
    <div className={`rounded-2xl p-5 border ${isActive ? 'bg-zinc-900 border-zinc-700' : 'bg-black border-zinc-800'}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{name}</h2>
          <p className="text-accent font-medium mt-1 flex items-center gap-1">{price.toFixed(2)} <BynIcon size="0.8em" /> / мес</p>
        </div>
        {isActive && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 bg-white text-black font-bold rounded">
            Активен
          </span>
        )}
      </div>

      {/* Дата окончания для активного тарифа */}
      {isActive && expiresFormatted && (
        <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-xl text-xs ${
          isExpiringSoon
            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
            : 'bg-zinc-800/60 border border-zinc-700/50 text-zinc-400'
        }`}>
          {isExpiringSoon
            ? <Clock size={12} className="shrink-0 text-amber-400" />
            : <Calendar size={12} className="shrink-0" />}
          <span>
            {isExpiringSoon
              ? `⚠️ Истекает через ${daysLeft} дн. — ${expiresFormatted}`
              : `Действует до ${expiresFormatted} · ещё ${daysLeft} дн.`}
          </span>
        </div>
      )}

      <ul className="space-y-3 mb-6">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
            <Check size={16} className="text-zinc-500 shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button 
        onClick={handleClick}
        disabled={isActive || isPurchasing}
        className={`w-full py-3 rounded-xl text-sm font-medium uppercase tracking-wider transition-all ${
          isActive 
            ? 'bg-zinc-800 text-zinc-400 cursor-default' 
            : 'bg-white text-black hover:bg-zinc-200 active:scale-[0.98] transition-transform disabled:opacity-50'
        }`}
      >
        {isActive
          ? isExpiringSoon ? '🔄 Продлить' : 'Активен'
          : isPurchasing ? 'Оплата...' : 'Выбрать тариф'}
      </button>
    </div>
  );
}
