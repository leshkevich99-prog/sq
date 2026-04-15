import React, { useState, useEffect, useRef } from 'react';
import { Wallet, ArrowUpRight, ArrowDownRight, CreditCard, X, Check, HelpCircle, Search, FileText } from 'lucide-react';
import { BynIcon } from '../../components/BynIcon';
import WebApp from '@twa-dev/sdk';
import { useFirebase } from '../../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, collection, query, where, onSnapshot } from '../../firebase';
import toast from 'react-hot-toast';
import { useKeyboard } from '../../hooks/useKeyboard';
import { TARIFFS } from '../../config/tariffs';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  receiptUrl?: string;
  status?: string;
  createdAt: any;
  providerPaymentId?: string;
  telegramPaymentId?: string;
  paymentMethod?: string;
  eripId?: string;
  instruction?: string;
  accountNumber?: string;
  bepaidToken?: string;
}

export default function Finances() {
  const { user, refreshAuth } = useFirebase();
  const isKeyboardVisible = useKeyboard();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense'>('all');
  const [activeMethod, setActiveMethod] = useState<'card' | 'erip' | 'b2b'>('card');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [unp, setUnp] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [eripInfo, setEripInfo] = useState<{ erip_id: string; instruction: string; account_number: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);


  // Helper to format date robustly
  const formatDate = (dateValue: any) => {
    if (!dateValue) return '—';
    
    let date: Date;
    if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else if (dateValue.seconds) {
      // Firestore Timestamp
      date = new Date(dateValue.seconds * 1000);
    } else if (dateValue instanceof Date) {
      date = dateValue;
    } else {
      date = new Date(dateValue);
    }

    if (isNaN(date.getTime())) return '—';

    return date.toLocaleDateString('ru-RU') + ' ' + 
           date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const handleFocus = () => {
    setIsInputFocused(true);
    // Use requestAnimationFrame or a very small timeout for smoother scrolling on mobile
    requestAnimationFrame(() => {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'transactions'), 
      where('userId', '==', String(user.uid))
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs: Transaction[] = [];
      snapshot.forEach(doc => {
        txs.push({ id: doc.id, ...doc.data() } as Transaction);
      });
      // Sort client-side
      txs.sort((a, b) => {
        const dateA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
        const dateB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
        return (dateB || 0) - (dateA || 0);
      });
      setTransactions(txs);
      setLoading(false);

      // Auto-load pending ERIP info for seamless UX
      const pendingErip = txs.find(t => t.status === 'pending' && t.paymentMethod === 'erip');
      if (pendingErip && !eripInfo) {
        setEripInfo({
          erip_id: pendingErip.eripId || '',
          instruction: pendingErip.instruction || '',
          account_number: pendingErip.accountNumber || ''
        });
      }
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    return () => unsubscribe();
  }, [user]);

  const handleTopUp = async () => {
    if (!user || !topUpAmount || isNaN(Number(topUpAmount)) || Number(topUpAmount) <= 0) return;
    
    setTopUpLoading(true);
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
          amount: Number(topUpAmount),
          type: 'deposit',
          description: 'Пополнение депозита Squadra'
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
            toast.success('Депозит успешно пополнен!', { id: toastId });
            WebApp.HapticFeedback.notificationOccurred('success');
            setTopUpModalOpen(false);
            setTopUpAmount('');
            // Даем боту 3 сек на обработку платежа, затем обновляем данные
            setTimeout(() => refreshAuth(), 3000);
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
        setTopUpModalOpen(false);
        setTopUpAmount('');
      }

    } catch (error) {
      console.error('Top up error:', error);
      toast.error('Ошибка при создании счета', { id: toastId });
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleB2BRequest = async () => {
    if (!unp || !companyName) {
      toast.error('Введите УНП и название компании');
      return;
    }

    setTopUpLoading(true);
    const toastId = toast.loading('Обработка запроса...');
    try {
      const response = await fetch('/api/payments/b2b-request', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ unp, companyName, amount: topUpAmount })
      });

      if (!response.ok) throw new Error('Ошибка при отправке запроса');
      
      WebApp.HapticFeedback.notificationOccurred('success');
      WebApp.showAlert('Ваша заявка на выставление счета (B2B) принята. Менеджер Squadra вышлет счет в Telegram в ближайшее время.');
      setTopUpModalOpen(false);
      setUnp('');
      setCompanyName('');
      setEmail('');
      toast.success('Запрос отправлен', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message, { id: toastId });
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleEripReport = async () => {
    setTopUpLoading(true);
    const toastId = toast.loading('Отправка уведомления...');
    try {
      const response = await fetch('/api/payments/erip-report', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ amount: topUpAmount })
      });

      if (!response.ok) throw new Error('Ошибка при отправке отчета');
      
      WebApp.HapticFeedback.notificationOccurred('success');
      WebApp.showAlert('Спасибо! Мы уже получили уведомление о вашем платеже. После подтверждения администратором баланс обновится.');
      setTopUpModalOpen(false);
      setTopUpAmount('');
      toast.success('Отчет отправлен', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message, { id: toastId });
    } finally {
      setTopUpLoading(false);
    }
  };

  const fetchEripInfo = async () => {
    if (!topUpAmount || isNaN(Number(topUpAmount)) || Number(topUpAmount) < 1) {
      toast.error('Введите корректную сумму для генерации счета');
      return;
    }

    setTopUpLoading(true);
    const toastId = toast.loading('Генерация счета ЕРИП...');
    try {
      const response = await fetch('/api/payments/erip/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ amount: topUpAmount })
      });

      if (!response.ok) throw new Error('Ошибка при создании счета bePaid');
      
      const data = await response.json();
      setEripInfo(data);
      WebApp.HapticFeedback.impactOccurred('medium');
      toast.success('Данные ЕРИП получены', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message, { id: toastId });
    } finally {
      setTopUpLoading(false);
    }
  };

  const getTransactionTitle = (type: string, desc: string) => {
    if (type === 'deposit') return 'Пополнение депозита';
    if (type === 'deposit_deduction') return 'Списание с депозита';
    if (type === 'wash_limit') return 'Списание квоты (Мойка)';
    if (type === 'task_limit') return 'Списание квоты (Логистическое поручение)';
    if (type === 'external_invoice') return 'Счет вне депозита';
    return desc || 'Транзакция';
  };

  // Calculate balance based only on completed transactions
  const balance = transactions.reduce((acc, tx) => {
    // Legacy transactions might not have a status field - assume they are completed
    const isCompleted = !tx.status || tx.status === 'completed';
    if (!isCompleted) return acc;

    const amount = Number(tx.amount || 0);
    if (tx.type === 'deposit') return acc + amount;
    if (tx.type === 'deposit_deduction') return acc - amount;
    return acc;
  }, 0);

  const filteredTransactions = transactions.filter(tx => {
    if (activeTab === 'all') return true;
    if (activeTab === 'income') return tx.type === 'deposit';
    if (activeTab === 'expense') return tx.type === 'deposit_deduction' || tx.type === 'external_invoice';
    return true;
  });

  return (
    <div className="animate-in fade-in duration-500">
      <header className="mb-6 mt-2">
        <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Операционный депозит</h1>
        <p className="text-zinc-400 text-sm mt-1">Управление депозитом и оплата</p>
      </header>

      {/* Subscription Info */}
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-sm text-zinc-400 mb-1">Текущий тариф</div>
            <div className="text-xl font-bold tracking-tight text-white">
              {user?.tariff === 'telemetry' ? 'TELEMETRY' : 
               user?.tariff === 'pitstop' ? 'PIT STOP' : 
               user?.tariff === 'family' ? 'SQUADRA FAMILY' : 
               user?.tariff === 'test_drive' ? 'TEST DRIVE' : 
               user?.subscription || 'Нет активного тарифа'}
            </div>
          </div>
          {(user?.tariff || user?.subscription) && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-1 bg-emerald-500/20 text-emerald-500 font-bold rounded border border-emerald-500/30">
              Активен
            </span>
          )}
        </div>
        
        {(user?.quotas || user?.limits) && (
          <div className="space-y-2 mt-4 pt-4 border-t border-zinc-800">
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Доступные квоты</div>
            {Object.entries(user.limits || user.quotas || {}).map(([key, value]) => {
              const tariff = user?.subscription ? Object.values(TARIFFS).find(t => t.name === user.subscription) : null;
              const total = tariff ? (tariff as any)[key] : null;
              
              return (
                <div key={key} className="flex justify-between items-center text-sm">
                  <span className="text-zinc-300">
                    {key === 'logistics' ? 'Логистика' : 
                     key === 'valet' ? 'Валет' : 
                     key === 'parking' ? 'Паркинг' : 
                     key === 'bureaucracy' ? 'Бюрократия' : 
                     key === 'wash' ? 'Мойка' : key}
                  </span>
                  <span className="font-mono font-bold text-white bg-zinc-800 px-2 py-0.5 rounded">
                    {value as number} {total ? `/ ${total}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 mb-6">
        <div className="text-sm text-zinc-400 mb-1">Операционный депозит</div>
        <div className={`text-4xl font-mono font-bold mb-4 ${balance < 0 ? 'text-red-600' : balance < 400 ? 'text-red-500' : 'text-white'}`}>
          {balance.toFixed(2)} <BynIcon size="0.6em" className="text-zinc-500" />
        </div>
        
        {balance < 400 && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            Ваш баланс ниже рекомендуемого минимума (400.00 <BynIcon size="0.8em" />). Пожалуйста, пополните депозит для бесперебойного обслуживания.
          </div>
        )}
        
        <div className="flex gap-3">
          <button 
            onClick={() => {
              setTopUpModalOpen(true);
              WebApp.HapticFeedback.impactOccurred('medium');
            }}
            className="flex-1 bg-white text-black py-3 rounded-xl text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors"
          >
            <CreditCard size={18} /> Пополнить
          </button>
        </div>
      </div>

      <div className="mb-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">История транзакций</h3>
        <div className="grid grid-cols-2 bg-zinc-900 rounded-xl p-1 border border-zinc-800 gap-1">
          <button 
            onClick={() => {
              setActiveTab('all');
              WebApp.HapticFeedback.impactOccurred('light');
            }}
            className={`col-span-2 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Все транзакции
          </button>
          <button 
            onClick={() => {
              setActiveTab('income');
              WebApp.HapticFeedback.impactOccurred('light');
            }}
            className={`py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'income' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Пополнения
          </button>
          <button 
            onClick={() => {
              setActiveTab('expense');
              WebApp.HapticFeedback.impactOccurred('light');
            }}
            className={`py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'expense' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Списания
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="text-center text-zinc-500 py-8">Загрузка истории...</div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center text-zinc-500 py-8 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
          История транзакций пуста
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTransactions.map(tx => {
            const isIncome = tx.type === 'deposit';
            return (
              <TransactionCard 
                key={tx.id}
                title={getTransactionTitle(tx.type, tx.description)} 
                date={formatDate(tx.createdAt)} 
                amount={`${isIncome ? '+' : '-'}${tx.amount.toFixed(2)}`} 
                type={isIncome ? 'income' : 'expense'} 
                manual={tx.type === 'external_invoice'}
                description={tx.description}
                receiptUrl={tx.receiptUrl}
                status={tx.status}
                onClick={() => {
                  setSelectedTx(tx);
                  WebApp.HapticFeedback.impactOccurred('light');
                  if (tx.status === 'pending' && tx.paymentMethod === 'erip') {
                    setEripInfo({
                      erip_id: tx.eripId || '',
                      instruction: tx.instruction || '',
                      account_number: tx.accountNumber || ''
                    });
                    setTopUpModalOpen(true);
                    setActiveMethod('erip');
                  } else {
                    setIsReceiptModalOpen(true);
                  }
                }}
              />
            );
          })}
        </div>
      )}

      {/* Receipt Modal */}
      <ReceiptModal 
        isOpen={isReceiptModalOpen} 
        onClose={() => setIsReceiptModalOpen(false)} 
        transaction={selectedTx} 
        formatDate={formatDate}
      />

      {/* Top Up Modal */}
      {topUpModalOpen && (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setTopUpModalOpen(false)} />
          <div className="relative bg-zinc-900 rounded-t-[32px] w-full animate-in slide-in-from-bottom duration-300 border-t border-zinc-800 max-h-[95vh] flex flex-col">
            <div className="p-6 pb-2 shrink-0">
              <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-6" />
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold uppercase tracking-tighter">Пополнение депозита</h3>
                <button onClick={() => setTopUpModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors p-2">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="px-6 pb-12 overflow-y-auto flex-1">
              {/* Payment Method Selector */}
              <div className="flex gap-2 p-1 bg-black/40 rounded-xl mb-6 border border-zinc-800/50">
                <PaymentMethodBtn 
                  id="card" 
                  label="Карта" 
                  active={activeMethod === 'card'} 
                  onClick={() => {
                    setActiveMethod('card');
                    WebApp.HapticFeedback.impactOccurred('light');
                  }} 
                />
                <PaymentMethodBtn 
                  id="erip" 
                  label="ЕРИП" 
                  active={activeMethod === 'erip'} 
                  onClick={() => {
                    setActiveMethod('erip');
                    WebApp.HapticFeedback.impactOccurred('light');
                  }} 
                />
                <PaymentMethodBtn 
                  id="b2b" 
                  label="Счёт B2B" 
                  active={activeMethod === 'b2b'} 
                  onClick={() => {
                    setActiveMethod('b2b');
                    WebApp.HapticFeedback.impactOccurred('light');
                  }} 
                />
              </div>

              {activeMethod === 'card' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Сумма к пополнению</div>
                    <div className="flex items-center justify-center gap-2">
                      <input 
                        ref={inputRef}
                        type="text" 
                        inputMode="decimal"
                        value={topUpAmount} 
                        onChange={(e) => setTopUpAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="0.00"
                        className="bg-transparent border-none text-4xl font-mono text-white text-center focus:outline-none w-48 placeholder:text-zinc-800"
                        onFocus={handleFocus}
                      />
                      <span className="text-2xl font-mono text-zinc-500">BYN</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {['100', '500', '1000'].map(val => (
                      <button 
                        key={val} 
                        onClick={() => {
                          setTopUpAmount(val);
                          WebApp.HapticFeedback.selectionChanged();
                        }}
                        className={`py-3 rounded-xl border text-sm font-bold uppercase tracking-wider transition-all ${topUpAmount === val ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-600'}`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>

                  <button 
                    onClick={handleTopUp}
                    disabled={!topUpAmount || parseFloat(topUpAmount) < 3.28 || topUpLoading}
                    className="w-full h-14 bg-white text-black rounded-2xl flex items-center justify-center gap-2 font-bold uppercase tracking-[0.2em] relative overflow-hidden group disabled:opacity-50 disabled:grayscale transition-all active:scale-[0.98]"
                  >
                    {topUpLoading ? (
                      <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    ) : (
                      <>
                        <CreditCard size={20} />
                        <span>ПОПОЛНИТЬ КАРТОЙ</span>
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-zinc-500 text-center uppercase tracking-widest opacity-60">Безопасная оплата через bePaid (РБ)</p>
                </div>
              )}

              {activeMethod === 'erip' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  {!eripInfo ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                        <HelpCircle size={32} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Готовы к оплате?</p>
                        <p className="text-xs text-zinc-500 mt-1">Нажмите кнопку ниже, чтобы получить<br />номер счета в системе ЕРИП</p>
                      </div>
                      <button 
                        onClick={fetchEripInfo}
                        disabled={!topUpAmount || topUpLoading}
                        className="px-8 py-3 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                      >
                        {topUpLoading ? 'Генерация...' : 'Получить номер счета'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
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
                              WebApp.HapticFeedback.notificationOccurred('success');
                              navigator.clipboard.writeText(eripInfo.erip_id);
                              toast.success('Номер скопирован');
                            }}
                            className="text-xs bg-zinc-800 text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest active:bg-zinc-700"
                          >
                            Копировать
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <button 
                          onClick={handleEripReport}
                          disabled={topUpLoading}
                          className="w-full h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-2xl flex items-center justify-center gap-2 font-bold uppercase tracking-[0.2em] hover:bg-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                          <Search size={20} />
                          <span>Я ОПЛАТИЛ В ЕРИП</span>
                        </button>
                        <button 
                          onClick={() => {
                            setEripInfo(null);
                            WebApp.HapticFeedback.impactOccurred('light');
                          }}
                          className="w-full py-2 text-[10px] text-zinc-500 uppercase font-bold tracking-widest hover:text-zinc-400"
                        >
                          Изменить сумму
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeMethod === 'b2b' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block px-1">УНП вашей организации</label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        placeholder="123456789"
                        value={unp}
                        onChange={(e) => setUnp(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors uppercase font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block px-1">Название (ООО/ИП)</label>
                      <input 
                        type="text" 
                        placeholder="ООО АВТО-ЛЮКС"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors uppercase font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block px-1">Email для получения счета</label>
                      <input 
                        type="email" 
                        placeholder="info@company.by"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-500 transition-colors lowercase font-mono"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      handleB2BRequest();
                      WebApp.HapticFeedback.impactOccurred('medium');
                    }}
                    disabled={topUpLoading || !unp || !companyName}
                    className="w-full h-14 bg-zinc-100 text-black rounded-2xl flex items-center justify-center gap-2 font-bold uppercase tracking-[0.2em] transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {topUpLoading ? (
                      <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    ) : (
                      <>
                        <FileText size={20} />
                        <span>ПОЛУЧИТЬ СЧЕТ</span>
                      </>
                    )}
                  </button>
                  <p className="text-[8px] text-zinc-500 text-center uppercase tracking-[0.2em] leading-normal">
                    Менеджер сформирует счет и свяжется с вами<br />в течение 15 минут
                  </p>
                </div>
              )}
              {/* Safe area for keyboard in Modal */}
              {isKeyboardVisible && <div className="h-64" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TransactionCard: React.FC<{ 
  title: string; 
  date: string; 
  amount: string; 
  type: 'income' | 'expense'; 
  manual?: boolean; 
  description?: string; 
  receiptUrl?: string; 
  status?: string;
  onClick?: () => void;
}> = ({ title, date, amount, type, manual, description, receiptUrl, status, onClick }) => {
  const isIncome = type === 'income';
  return (
    <div 
      onClick={onClick}
      className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex justify-between items-center active:scale-95 transition-transform cursor-pointer"
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isIncome ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-800 text-zinc-400'}`}>
          {isIncome ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}
        </div>
        <div className="min-w-0">
          <h4 className="font-medium text-sm truncate">{title || 'Транзакция'}</h4>
          <p className="text-xs text-zinc-500 mt-0.5">{date || '—'}</p>
          {description && <p className="text-xs text-zinc-400 mt-1 line-clamp-1">{description}</p>}
          
          <div className="flex flex-wrap gap-2 mt-2">
            {status === 'pending' && (
              <span className="text-[9px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded border border-amber-500/20 font-bold uppercase tracking-wider">
                Ожидает оплаты
              </span>
            )}
            {status === 'processing' && (
              <span className="text-[9px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded border border-blue-500/20 font-bold uppercase tracking-wider">
                В обработке
              </span>
            )}
            {(status === 'failed' || status === 'canceled') && (
              <span className="text-[9px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded border border-red-500/20 font-bold uppercase tracking-wider">
                Ошибка
              </span>
            )}
            {status === 'completed' && (
              <span className="text-[9px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/20 font-bold uppercase tracking-wider">
                Завершено
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0 ml-2">
        <div className={`font-mono font-bold ${isIncome ? 'text-emerald-500' : 'text-zinc-100'}`}>
          {amount} <BynIcon size="12" />
        </div>
        {manual && <div className="text-[10px] text-zinc-500 uppercase mt-1">B2B</div>}
      </div>
    </div>
  );
}

const PaymentMethodBtn: React.FC<{ id: string; label: string; active: boolean; onClick: () => void }> = ({ id, label, active, onClick }) => {
  return (
    <button 
      onClick={onClick}
      className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${active ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
    >
      {label}
    </button>
  );
}

// PREMIUM RECEIPT MODAL COMPONENT (Compliant with RB Electronic Commerce Law)
const ReceiptModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  transaction: Transaction | null;
  formatDate: (d: any) => string;
}> = ({ isOpen, onClose, transaction, formatDate }) => {
  if (!isOpen || !transaction) return null;

  const isIncome = transaction.type === 'deposit';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-sm bg-[#fcfcfc] text-zinc-900 rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        {/* Jagged top edge effect */}
        <div className="h-2 w-full bg-zinc-200 flex" style={{ clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)' }} />
        
        <div className="p-8 pb-10 flex flex-col items-center">
          <div className="flex flex-col items-center mb-6">
             <h2 className="text-xl font-black uppercase tracking-tighter text-zinc-900">Squadra Service</h2>
             <p className="text-[8px] text-zinc-500 uppercase tracking-widest mt-1">Автомобильный консьерж-сервис</p>
          </div>
          
          <h1 className="text-xs font-bold uppercase tracking-widest mb-6 py-1 px-3 border border-zinc-200 rounded">Электронный кард-чек</h1>
          
          <div className="w-full space-y-3 font-mono text-[10px] border-t border-dashed border-zinc-300 pt-6 mb-4">
            <div className="flex justify-between">
              <span className="text-zinc-500">УНП:</span>
              <span className="font-bold text-zinc-700">193790584</span> {/* Mock UNP - should be verified with user */}
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">МЕРЧАНТ:</span>
              <span className="font-bold text-zinc-700">SQUADRA BY</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">ДАТА И ВРЕМЯ:</span>
              <span>{formatDate(transaction.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">ТИП ОПЕРАЦИИ:</span>
              <span className="font-bold uppercase">{isIncome ? 'ОПЛАТА' : 'СПИСАНИЕ'}</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-zinc-500">УСЛУГА:</span>
              <span className="text-right max-w-[150px] uppercase">{transaction.description || 'ПОПОЛНЕНИЕ ДЕПОЗИТА'}</span>
            </div>
          </div>

          <div className="w-full space-y-3 font-mono text-[10px] border-b border-dashed border-zinc-300 pb-6 mb-6">
            <div className="flex justify-between">
              <span className="text-zinc-500">СПОСОБ:</span>
              <span>BANK CARD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">СИСТЕМА:</span>
              <span className="font-bold text-[#e65a15]">bePaid.by</span>
            </div>
            {transaction.providerPaymentId && (
              <div className="flex justify-between">
                <span className="text-zinc-500">ID ТРАНЗАКЦИИ:</span>
                <span className="text-right font-bold">{transaction.providerPaymentId}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-zinc-100">
              <span className="text-xs font-bold">СУММА ОПЕРАЦИИ:</span>
              <span className="text-xl font-black">
                {isIncome ? '' : '-'}{transaction.amount.toFixed(2)} BYN
              </span>
            </div>
          </div>
          
          <div className="text-center mb-8 flex flex-col items-center">
            <button 
              onClick={() => {
                if (transaction.receiptUrl) {
                  WebApp.openLink(transaction.receiptUrl);
                }
              }}
              disabled={!transaction.receiptUrl}
              className={`p-2 bg-white border border-zinc-200 rounded-lg mb-3 transition-transform group ${transaction.receiptUrl ? 'active:scale-95 hover:border-[#e65a15]' : 'opacity-50 cursor-not-allowed'}`}
            >
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(transaction.receiptUrl || 'https://t.me/squadraby_bot')}`} 
                alt="QR" 
                className={`w-20 h-20 grayscale transition-all ${transaction.receiptUrl ? 'group-hover:grayscale-0' : ''}`}
              />
            </button>
            <p className="text-[8px] text-zinc-400 uppercase tracking-widest leading-normal">
              {transaction.receiptUrl 
                ? <>Нажмите на QR-код для перехода к оригиналу<br/>через платежную систему bePaid (РБ)</>
                : <>Официальный чек доступен по ссылке<br/>в сообщении от Telegram</>}
            </p>
          </div>
          
          <div className="w-full flex flex-col gap-2">
            {transaction.receiptUrl && (
              <button 
                onClick={() => WebApp.openLink(transaction.receiptUrl!)}
                className="w-full py-3 bg-[#e65a15] text-white rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 active:scale-95 transition-transform"
              >
                Официальный чек bePaid
              </button>
            )}
            <button 
              onClick={onClose}
              className="w-full py-3 border border-zinc-200 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-50 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
        
        {/* Jagged bottom edge effect */}
        <div className="h-2 w-full bg-zinc-200 flex rotate-180" style={{ clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)' }} />
      </div>
    </div>
  );
}
