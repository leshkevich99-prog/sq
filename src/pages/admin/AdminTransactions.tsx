import React, { useState, useEffect } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Search, 
  Filter, 
  Download,
  Calendar,
  User,
  CreditCard
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

interface TransactionData {
  id: string;
  userId: string;
  type: string;
  amount: number;
  description: string;
  receiptUrl?: string;
  status?: string;
  createdAt: string;
}

interface UserData {
  id: string;
  firstName: string;
  username: string;
}

export default function AdminTransactions() {
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [users, setUsers] = useState<Record<string, UserData>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(100));
    const unsubTxs = onSnapshot(q, (snapshot) => {
      const txs: TransactionData[] = [];
      snapshot.forEach(doc => {
        txs.push({ id: doc.id, ...doc.data() } as TransactionData);
      });
      setTransactions(txs);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const u: Record<string, UserData> = {};
      snapshot.forEach(doc => {
        u[doc.id] = { id: doc.id, ...doc.data() } as UserData;
      });
      setUsers(u);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => {
      unsubTxs();
      unsubUsers();
    };
  }, []);

  const filteredTxs = transactions.filter(tx => {
    const user = users[tx.userId];
    const searchStr = (user?.firstName || '' + user?.username || '' + tx.description).toLowerCase();
    return searchStr.includes(search.toLowerCase());
  });

  const totalIn = transactions
    .filter(tx => tx.type === 'deposit')
    .reduce((acc, tx) => acc + tx.amount, 0);
    
  const totalOut = transactions
    .filter(tx => tx.type === 'deposit_deduction' || tx.type === 'external_invoice' || tx.type === 'payout')
    .reduce((acc, tx) => acc + tx.amount, 0);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Транзакции</h1>
          <p className="text-zinc-400 text-sm mt-1">Глобальный лог всех финансовых операций</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 transition-colors">
          <Download size={16} /> Экспорт CSV
        </button>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-xl">
              <ArrowUpRight size={20} className="text-emerald-500" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Всего приход</span>
          </div>
          <div className="text-2xl font-bold text-emerald-500">+{totalIn.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BYN</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-500/10 rounded-xl">
              <ArrowDownRight size={20} className="text-red-500" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Всего расход</span>
          </div>
          <div className="text-2xl font-bold text-red-500">-{totalOut.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BYN</div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Поиск по клиенту или описанию..."
              className="w-full bg-black border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-white transition-colors"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="p-2.5 bg-black border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors">
            <Filter size={18} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950 text-[10px] uppercase tracking-widest text-zinc-500">
                <th className="px-6 py-4 font-bold">Дата</th>
                <th className="px-6 py-4 font-bold">Пользователь</th>
                <th className="px-6 py-4 font-bold">Тип</th>
                <th className="px-6 py-4 font-bold">Описание</th>
                <th className="px-6 py-4 font-bold text-right">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">Загрузка данных...</td>
                </tr>
              ) : filteredTxs.map(tx => {
                const user = users[tx.userId];
                const isPositive = tx.type === 'deposit';
                return (
                  <tr key={tx.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-xs text-white">{new Date(tx.createdAt).toLocaleDateString()}</div>
                      <div className="text-[10px] text-zinc-500">{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">
                          {user?.firstName?.charAt(0)}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">{user?.firstName || '---'}</div>
                          <div className="text-[10px] text-zinc-500">@{user?.username || '---'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                        isPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-400 max-w-xs">
                      <div className="truncate">{tx.description}</div>
                      {tx.status === 'pending' && (
                        <div className="mt-1">
                          <span className="inline-block px-2 py-0.5 bg-amber-500/20 text-amber-500 text-[10px] uppercase tracking-wider font-bold rounded">
                            Ожидает оплаты
                          </span>
                        </div>
                      )}
                      {tx.status === 'completed' && tx.type === 'external_invoice' && (
                        <div className="mt-1">
                          <span className="inline-block px-2 py-0.5 bg-emerald-500/20 text-emerald-500 text-[10px] uppercase tracking-wider font-bold rounded">
                            Оплачен
                          </span>
                        </div>
                      )}
                      {tx.receiptUrl && (
                        <a href={tx.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline mt-1 inline-block">
                          Смотреть квитанцию
                        </a>
                      )}
                    </td>
                    <td className={`px-6 py-4 text-sm font-bold text-right ${isPositive ? 'text-emerald-500' : 'text-white'}`}>
                      {isPositive ? '+' : '-'}{tx.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BYN
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredTxs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">Транзакции не найдены</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
