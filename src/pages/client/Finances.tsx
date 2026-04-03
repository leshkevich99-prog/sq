import React, { useState, useEffect, useRef } from 'react';
import { Wallet, ArrowUpRight, ArrowDownRight, CreditCard, X, Check } from 'lucide-react';
import { BynIcon } from '../../components/BynIcon';
import WebApp from '@twa-dev/sdk';
import { useFirebase } from '../../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, collection, query, where, onSnapshot, addDoc } from '../../firebase';
import toast from 'react-hot-toast';
import { useKeyboard } from '../../hooks/useKeyboard';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  receiptUrl?: string;
  status?: string;
  createdAt: any; // Can be string or Timestamp
  providerPaymentId?: string;
  telegramPaymentId?: string;
}

import { TARIFFS } from '../../config/tariffs';

export default function Finances() {
  const { user } = useFirebase();
  const isKeyboardVisible = useKeyboard();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense'>('all');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
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
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'transactions'), 
      where('userId', '==', user.uid)
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

  const getTransactionTitle = (type: string, desc: string) => {
    if (type === 'deposit') return 'Пополнение депозита';
    if (type === 'deposit_deduction') return 'Списание с депозита';
    if (type === 'wash_limit') return 'Списание квоты (Мойка)';
    if (type === 'task_limit') return 'Списание квоты (Логистическое поручение)';
    if (type === 'external_invoice') return 'Счет вне депозита';
    return desc || 'Транзакция';
  };

  // Calculate balance
  const balance = transactions.reduce((acc, tx) => {
    if (tx.type === 'deposit') return acc + tx.amount;
    if (tx.type === 'deposit_deduction') return acc - tx.amount;
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
            onClick={() => setTopUpModalOpen(true)}
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
            onClick={() => setActiveTab('all')}
            className={`col-span-2 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Все транзакции
          </button>
          <button 
            onClick={() => setActiveTab('income')}
            className={`py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'income' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Пополнения
          </button>
          <button 
            onClick={() => setActiveTab('expense')}
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
                  setIsReceiptModalOpen(true);
                  WebApp.HapticFeedback.impactOccurred('light');
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
          <div className="w-full max-w-md mx-auto bg-zinc-900 rounded-t-3xl sm:rounded-2xl sm:mb-4 animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] flex flex-col relative overflow-hidden">
            <div className="sticky top-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-b border-zinc-800/50 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold uppercase tracking-tighter">Пополнение депозита</h2>
              <button onClick={() => setTopUpModalOpen(false)} className="text-zinc-500 hover:text-white p-2">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <p className="text-sm text-zinc-400 mb-2">
                Введите сумму, на которую вы хотите пополнить ваш депозит. Заявка будет обработана в ближайшее время.
              </p>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Сумма (<BynIcon size="0.8em" className="inline-block" />)</label>
                  {isInputFocused && (
                    <button 
                      onClick={() => {
                        inputRef.current?.blur();
                        setIsInputFocused(false);
                      }}
                      className="text-[10px] font-bold uppercase text-accent flex items-center gap-1 bg-accent/10 px-2 py-1 rounded-lg"
                    >
                      Готово <Check size={10} />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input 
                    ref={inputRef}
                    type="number" 
                    placeholder="0.00" 
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={() => setTimeout(() => setIsInputFocused(false), 100)}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent text-white" 
                  />
                </div>
              </div>
            </div>

            <div className={`sticky bottom-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-t border-zinc-800/50 shrink-0 pb-[max(env(safe-area-inset-bottom),1.5rem)] ${isKeyboardVisible ? 'hidden' : 'block'}`}>
              <button 
                onClick={handleTopUp}
                disabled={topUpLoading || !topUpAmount || Number(topUpAmount) <= 0}
                className="w-full py-3 bg-white text-black text-sm font-bold uppercase tracking-wider rounded-xl disabled:opacity-50 hover:bg-zinc-200 transition-colors"
              >
                {topUpLoading ? 'Обработка...' : 'Оплатить'}
              </button>
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
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isIncome ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-800 text-zinc-400'}`}>
          {isIncome ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}
        </div>
        <div>
          <h4 className="font-medium text-sm">{title}</h4>
          <p className="text-xs text-zinc-500 mt-0.5">{date}</p>
          {description && <p className="text-xs text-zinc-400 mt-1 line-clamp-1">{description}</p>}
          {status === 'pending' && manual && (
            <div className="text-[10px] text-amber-500 uppercase mt-1 font-bold">
              Ожидает прямой оплаты клиентом
            </div>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 ml-2">
        <div className={`font-mono font-medium ${isIncome ? 'text-emerald-500' : 'text-white'}`}>
          {amount} <BynIcon size="0.8em" />
        </div>
        {manual && <div className="text-[10px] text-zinc-500 uppercase mt-1">Вне депозита</div>}
      </div>
    </div>
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
                const url = transaction.receiptUrl || `https://squadra.by/tx/${transaction.id}`;
                WebApp.openLink(url);
              }}
              className="p-2 bg-white border border-zinc-200 rounded-lg mb-3 active:scale-95 transition-transform hover:border-[#e65a15] group"
            >
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(transaction.receiptUrl || 'https://squadra.by/tx/' + transaction.id)}`} 
                alt="QR" 
                className="w-20 h-20 grayscale group-hover:grayscale-0 transition-all"
              />
            </button>
            <p className="text-[8px] text-zinc-400 uppercase tracking-widest leading-normal">
              Нажмите на QR-код для перехода к оригиналу<br/>через платежную систему bePaid (РБ)
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
