import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  CreditCard,
  ChevronRight
} from 'lucide-react';
import { BynIcon } from '../../components/BynIcon';
import { useFirebase } from '../../components/FirebaseProvider';
import { db, handleFirestoreError, OperationType, collection, query, where, orderBy, onSnapshot, addDoc, limit } from '../../firebase';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import toast from 'react-hot-toast';

interface Transaction {
  id: string;
  userId: string;
  type: 'earning' | 'payout';
  amount: number;
  description: string;
  createdAt: string;
}

interface PayoutRequest {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'processed' | 'rejected';
  method: string;
  details: string;
  createdAt: string;
}

export default function PilotWallet() {
  const navigate = useNavigate();
  const { user } = useFirebase();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('card');
  const [payoutDetails, setPayoutDetails] = useState('');

  useEffect(() => {
    if (!user) return;

    const qTx = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      limit(100)
    );

    const unsubTx = onSnapshot(qTx, (snapshot) => {
      const txs: Transaction[] = [];
      snapshot.forEach(doc => txs.push({ id: doc.id, ...doc.data() } as Transaction));
      
      // Sort in memory to avoid 412 error (missing composite index)
      txs.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      setTransactions(txs.slice(0, 50));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    const qPayouts = query(
      collection(db, 'payouts'),
      where('userId', '==', user.uid),
      limit(50)
    );

    const unsubPayouts = onSnapshot(qPayouts, (snapshot) => {
      const ps: PayoutRequest[] = [];
      snapshot.forEach(doc => ps.push({ id: doc.id, ...doc.data() } as PayoutRequest));
      
      // Sort in memory to avoid 412 error (missing composite index)
      ps.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      setPayouts(ps.slice(0, 10));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'payouts'));

    return () => {
      unsubTx();
      unsubPayouts();
    };
  }, [user]);

  const totalBalance = transactions.reduce((acc, tx) => {
    return tx.type === 'earning' ? acc + tx.amount : acc - tx.amount;
  }, 0);

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const amount = parseFloat(payoutAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Введите корректную сумму');
      return;
    }

    if (amount > totalBalance) {
      toast.error('Недостаточно средств на балансе');
      return;
    }

    if (!payoutDetails.trim()) {
      toast.error('Введите реквизиты для выплаты');
      return;
    }

    try {
      await addDoc(collection(db, 'payouts'), {
        userId: user.uid,
        amount,
        status: 'pending',
        method: payoutMethod,
        details: payoutDetails,
        createdAt: new Date().toISOString()
      });
      
      toast.success('Запрос на выплату отправлен');
      setShowPayoutModal(false);
      setPayoutAmount('');
      setPayoutDetails('');
    } catch (error) {
      toast.error('Ошибка при создании заявки');
    }
  };

  // Prepare data for chart (last 7 days)
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toISOString().split('T')[0];
    
    const dayEarnings = transactions
      .filter(tx => tx.type === 'earning' && tx.createdAt.startsWith(dateStr))
      .reduce((acc, tx) => acc + tx.amount, 0);
      
    return {
      name: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
      amount: dayEarnings,
      date: dateStr
    };
  });

  if (loading) return <div className="p-6 text-center text-zinc-500">Загрузка кошелька...</div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 bg-zinc-900 rounded-full border border-zinc-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold uppercase tracking-wider">Кошелек</h1>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-br from-zinc-900 to-black border border-zinc-800 rounded-3xl p-8 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full -mr-16 -mt-16" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Wallet size={16} />
            <span className="text-xs uppercase font-bold tracking-widest">Доступный баланс</span>
          </div>
          <div className="text-4xl font-bold mb-6">{totalBalance.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <BynIcon size="0.6em" className="text-zinc-500" /></div>
          <button 
            onClick={() => setShowPayoutModal(true)}
            className="w-full py-4 bg-white text-black rounded-2xl font-bold uppercase tracking-widest text-xs active:scale-[0.98] transition-transform shadow-lg shadow-white/5"
          >
            Вывести средства
          </button>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-500" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Доходы за неделю</h2>
          </div>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#71717a', fontSize: 10 }}
                dy={10}
              />
              <YAxis hide />
              <Tooltip 
                cursor={{ fill: '#18181b' }}
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                itemStyle={{ color: '#fff', fontSize: '12px' }}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.amount > 0 ? '#f59e0b' : '#27272a'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 px-2">История операций</h2>
        
        {transactions.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900/30 border border-zinc-800 rounded-3xl">
            <p className="text-zinc-600 text-xs uppercase tracking-widest">Транзакций пока нет</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map(tx => (
              <div key={tx.id} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    tx.type === 'earning' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                  }`}>
                    {tx.type === 'earning' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{tx.description}</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-tight">
                      {new Date(tx.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-bold ${tx.type === 'earning' ? 'text-emerald-500' : 'text-white'}`}>
                  {tx.type === 'earning' ? '+' : '-'}{tx.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <BynIcon size="0.8em" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payout Modal */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 rounded-t-3xl p-6 pb-[max(env(safe-area-inset-bottom),2.5rem)] animate-in slide-in-from-bottom-full duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold uppercase tracking-widest">Вывод средств</h3>
              <button onClick={() => setShowPayoutModal(false)} className="p-2 bg-zinc-800 rounded-full">
                <AlertCircle size={20} className="rotate-180" />
              </button>
            </div>
            
            <form onSubmit={handleRequestPayout} className="space-y-6">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-2 block">Сумма вывода</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-black border border-zinc-800 rounded-2xl px-4 py-4 text-2xl font-bold focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  <BynIcon className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500" size="1.2em" />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-2 block">Способ получения</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={() => setPayoutMethod('card')}
                    className={`py-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                      payoutMethod === 'card' ? 'bg-white text-black border-white' : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                    }`}
                  >
                    <CreditCard size={14} className="mx-auto mb-1" />
                    Карта
                  </button>
                  <button 
                    type="button"
                    onClick={() => setPayoutMethod('sbp')}
                    className={`py-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                      payoutMethod === 'sbp' ? 'bg-white text-black border-white' : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                    }`}
                  >
                    <TrendingUp size={14} className="mx-auto mb-1" />
                    СБП
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-2 block">Реквизиты</label>
                <textarea 
                  value={payoutDetails}
                  onChange={(e) => setPayoutDetails(e.target.value)}
                  placeholder="Номер карты или телефона для СБП"
                  className="w-full bg-black border border-zinc-800 rounded-2xl px-4 py-4 text-sm focus:outline-none focus:border-amber-500 transition-colors h-24 resize-none"
                />
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-amber-500 text-black rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-amber-500/20"
              >
                Запросить выплату
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
