import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Filter
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';

interface RequestData {
  id: string;
  totalPrice?: number;
  status: string;
  createdAt: string;
  serviceType: string;
}

export default function AdminAnalytics() {
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'requests'), (snapshot) => {
      const r: RequestData[] = [];
      snapshot.forEach(doc => {
        r.push({ id: doc.id, ...doc.data() } as RequestData);
      });
      setRequests(r);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'requests'));

    return () => unsub();
  }, []);

  // Process data for charts
  const completedRequests = requests.filter(r => r.status === 'completed');
  
  // Revenue by day
  const revenueByDay = completedRequests.reduce((acc: any, r) => {
    const date = new Date(r.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    acc[date] = (acc[date] || 0) + (r.totalPrice || 0);
    return acc;
  }, {});

  const revenueChartData = Object.keys(revenueByDay).map(date => ({
    name: date,
    revenue: revenueByDay[date]
  })).slice(-7);

  // Orders by service type
  const ordersByType = requests.reduce((acc: any, r) => {
    const type = r.serviceType === 'logistics' ? 'Логистика' : 
                 r.serviceType === 'valet' ? 'Валет' : 
                 r.serviceType === 'parking' ? 'Паркинг' : 
                 r.serviceType === 'bureaucracy' ? 'Бюрократия' : 
                 r.serviceType === 'wash' ? 'Мойка' : 'СТО';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.keys(ordersByType).map(name => ({
    name,
    value: ordersByType[name]
  }));

  const COLORS = ['#FFFFFF', '#3b82f6', '#10b981', '#f59e0b'];

  const totalRevenue = completedRequests.reduce((acc, r) => acc + (r.totalPrice || 0), 0);
  const avgOrderValue = completedRequests.length > 0 ? totalRevenue / completedRequests.length : 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Аналитика</h1>
          <p className="text-zinc-400 text-sm mt-1">Показатели эффективности и роста</p>
        </div>
        <div className="flex gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          {(['7d', '30d', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                timeRange === range ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'
              }`}
            >
              {range === '7d' ? '7 дней' : range === '30d' ? '30 дней' : 'Все время'}
            </button>
          ))}
        </div>
      </header>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard 
          title="Общая выручка" 
          value={`${totalRevenue.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BYN`} 
          trend="+15.4%" 
          isUp={true} 
          icon={<TrendingUp size={20} className="text-emerald-500" />}
        />
        <MetricCard 
          title="Поручений всего" 
          value={requests.length} 
          trend="+8" 
          isUp={true} 
          icon={<ShoppingBag size={20} className="text-blue-500" />}
        />
        <MetricCard 
          title="Средний чек" 
          value={`${avgOrderValue.toFixed(2)} BYN`} 
          trend="-2.1%" 
          isUp={false} 
          icon={<ArrowUpRight size={20} className="text-amber-500" />}
        />
        <MetricCard 
          title="Конверсия" 
          value="84%" 
          trend="+4.3%" 
          isUp={true} 
          icon={<Users size={20} className="text-zinc-500" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Динамика выручки</h3>
            <Calendar size={18} className="text-zinc-600" />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#52525b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#52525b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff', fontSize: '12px' }}
                  labelStyle={{ color: '#52525b', fontSize: '10px', marginBottom: '4px' }}
                />
                <Bar dataKey="revenue" fill="#FFFFFF" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Service Distribution */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-6">Типы услуг</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {pieData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="text-zinc-400">{item.name}</span>
                </div>
                <span className="font-bold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Эффективность пилотов</h3>
          <Filter size={18} className="text-zinc-600" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950 text-[10px] uppercase tracking-widest text-zinc-500">
                <th className="px-6 py-4 font-bold">Пилот</th>
                <th className="px-6 py-4 font-bold">Поручений</th>
                <th className="px-6 py-4 font-bold">Выручка</th>
                <th className="px-6 py-4 font-bold">Рейтинг</th>
                <th className="px-6 py-4 font-bold">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              <tr className="hover:bg-zinc-800/50 transition-colors">
                <td className="px-6 py-4 text-xs font-bold text-white">Александр П.</td>
                <td className="px-6 py-4 text-xs text-zinc-400">42</td>
                <td className="px-6 py-4 text-xs text-zinc-400">1 450.00 BYN</td>
                <td className="px-6 py-4 text-xs text-amber-500 font-bold">4.9</td>
                <td className="px-6 py-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded">Active</span>
                </td>
              </tr>
              <tr className="hover:bg-zinc-800/50 transition-colors">
                <td className="px-6 py-4 text-xs font-bold text-white">Дмитрий М.</td>
                <td className="px-6 py-4 text-xs text-zinc-400">38</td>
                <td className="px-6 py-4 text-xs text-zinc-400">1 280.00 BYN</td>
                <td className="px-6 py-4 text-xs text-amber-500 font-bold">4.8</td>
                <td className="px-6 py-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded">Active</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, trend, isUp, icon }: { title: string; value: string | number; trend: string; isUp: boolean; icon: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-black rounded-2xl border border-zinc-800">
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${isUp ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
          {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {trend}
        </div>
      </div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">{title}</div>
    </div>
  );
}
