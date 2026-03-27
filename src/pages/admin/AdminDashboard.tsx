import React, { useState, useEffect, useCallback } from 'react';
import { db, handleFirestoreError, OperationType, createNotification, collection, onSnapshot, doc, updateDoc, query, where, getDoc, orderBy, limit } from '../../firebase';
import { Link } from 'react-router-dom';
import { BynIcon } from '../../components/BynIcon';
import { 
  X, 
  ChevronRight, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Search,
  Car as CarIcon
} from 'lucide-react';

interface RequestData {
  id: string;
  userId: string;
  carId: string;
  serviceType: string;
  status: string;
  pilotId?: string;
  createdAt: string;
  pickupAddress?: string;
  totalPrice?: number;
}

interface UserData {
  id: string;
  firstName: string;
  username: string;
  role: string;
  telegramId?: string | number;
  isOnShift?: boolean;
}

interface CarData {
  id: string;
  make: string;
  model: string;
  plate: string;
}

interface SosAlert {
  id: string;
  pilotId: string;
  requestId: string;
  status: string;
  createdAt: string;
}

interface TestDriveData {
  id: string;
  userId: string;
  name: string;
  phone: string;
  carModel: string;
  date: string;
  time: string;
  address: string;
  status: string;
  createdAt: string;
}

const SERVICE_LABELS: Record<string, string> = {
  'logistics': 'Логистика',
  'valet': 'AIRPORT VALET',
  'parking': 'Night Drop',
  'bureaucracy': 'Бюрократия',
  'wash': 'Мойка',
  'service': 'СТО / ТО'
};

export default function AdminDashboard() {
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [users, setUsers] = useState<Record<string, UserData>>({});
  const [cars, setCars] = useState<Record<string, CarData>>({});
  const [pilots, setPilots] = useState<UserData[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [testDrives, setTestDrives] = useState<TestDriveData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [activeKanbanTab, setActiveKanbanTab] = useState<'pending' | 'in_progress' | 'completed'>('pending');

  const fetchData = useCallback(async () => {
    try {
      const [reqRes, userRes, carRes, sosRes, testRes] = await Promise.all([
        fetch('/api/admin/requests'),
        fetch('/api/admin/users'),
        fetch('/api/cars'), // Need all cars
        fetch('/api/sos_alerts'),
        fetch('/api/test_drives')
      ]);

      if (reqRes.ok) {
        const data = await reqRes.json();
        setRequests(data.requests || []);
      }
      
      if (userRes.ok) {
        const data = await userRes.json();
        const usrs: Record<string, UserData> = {};
        const plts: UserData[] = [];
        (data.users || []).forEach((u: any) => {
          usrs[u.id] = u;
          if (u.role === 'pilot' || u.role === 'admin') plts.push(u);
        });
        setUsers(usrs);
        setPilots(plts);
      }

      if (carRes.ok) {
        const data = await carRes.json();
        const crs: Record<string, CarData> = {};
        (data.cars || []).forEach((c: any) => { crs[c.id] = c; });
        setCars(crs);
      }

      if (sosRes.ok) {
        const data = await sosRes.json();
        setSosAlerts(data.sos_alerts || []);
      }

      if (testRes.ok) {
        const data = await testRes.json();
        const drives = (data.test_drives || []).sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setTestDrives(drives);
      }

      setLoading(false);
    } catch (error) {
      console.error('Fetch dashboard error:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAssignClick = (requestId: string) => {
    setSelectedRequestId(requestId);
    setAssignModalOpen(true);
  };

  const handleAssignPilot = async (pilotId: string) => {
    if (!selectedRequestId) return;
    try {
      const reqRef = doc(db, 'requests', selectedRequestId);
      const reqSnap = await getDoc(reqRef);
      if (!reqSnap.exists()) return;
      
      const reqData = reqSnap.data();
      const pilot = pilots.find(p => p.id === pilotId);

      await updateDoc(reqRef, {
        pilotId,
        status: 'accepted'
      });

      // Notify client
      const clientTitle = 'Пилот назначен';
      const clientBody = `Ваш пилот ${pilot?.firstName || 'назначен'} уже в пути.`;
      await createNotification(
        reqData.userId,
        clientTitle,
        clientBody,
        'success',
        `/task/${selectedRequestId}`
      );

      // Notify pilot
      const pilotTitle = 'Новое поручение';
      const serviceName = SERVICE_LABELS[reqData.serviceType] || reqData.serviceType;
      const pilotBody = `Вам назначено новое поручение: ${serviceName}.`;
      await createNotification(
        pilotId,
        pilotTitle,
        pilotBody,
        'info',
        `/task/${selectedRequestId}`
      );

      setAssignModalOpen(false);
      setSelectedRequestId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${selectedRequestId}`);
    }
  };

  const handleTestDriveStatusChange = async (driveId: string, newStatus: string, userId: string) => {
    try {
      await updateDoc(doc(db, 'test_drives', driveId), { status: newStatus });
      
      let title = '';
      let body = '';
      
      if (newStatus === 'contacted') {
        title = 'Поручение на тест-драйв';
        body = 'Менеджер SQUADRA скоро свяжется с вами для уточнения деталей.';
      } else if (newStatus === 'completed') {
        title = 'Тест-драйв завершен';
        body = 'Надеемся, вам понравился тест-драйв! Будем рады видеть вас в SQUADRA.';
      } else if (newStatus === 'cancelled') {
        title = 'Тест-драйв отменен';
        body = 'Ваше поручение на тест-драйв было отменено.';
      }

      if (title && body) {
        await createNotification(userId, title, body, 'info');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `test_drives/${driveId}`);
    }
  };

  const resolveSos = async (alertId: string) => {
    try {
      await updateDoc(doc(db, 'sos_alerts', alertId), {
        status: 'resolved',
        resolvedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sos_alerts/${alertId}`);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-zinc-500">Загрузка центра управления...</div>;
  }

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const inProgressRequests = requests.filter(r => r.status === 'in_progress' || r.status === 'accepted');
  const completedRequests = requests.filter(r => r.status === 'completed');
  
  const totalRevenue = completedRequests.reduce((acc, r) => acc + (r.totalPrice || 0), 0);
  const activePilots = pilots.filter(p => p.isOnShift).length;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Дашборд</h1>
          <p className="text-zinc-400 text-sm mt-1">Обзор системы и активные процессы</p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800 self-start">
          <button 
            onClick={() => setViewMode('kanban')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'kanban' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}
          >
            Канбан
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'list' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}
          >
            Список
          </button>
        </div>
      </header>

      {/* SOS Alerts */}
      {sosAlerts.length > 0 && (
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-2 text-red-500 px-1">
            <AlertTriangle size={14} className="animate-pulse" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">SOS ({sosAlerts.length})</h2>
          </div>
          <div className="space-y-2">
            {sosAlerts.map(alert => (
              <div key={alert.id} className="bg-red-500/5 border border-red-500/20 rounded-2xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-red-500 flex-shrink-0 flex items-center justify-center text-white shadow-lg shadow-red-500/20">
                    <AlertTriangle size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{users[alert.pilotId]?.firstName || 'Пилот'}</div>
                    <div className="text-[9px] text-red-400 uppercase tracking-widest truncate">#{alert.requestId?.slice(-6) || '---'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Link to={`/task/${alert.requestId || ''}`} className="px-3 py-1.5 bg-red-500 text-white text-[9px] font-bold uppercase tracking-widest rounded-lg active:scale-95 transition-transform">
                    Перейти
                  </Link>
                  <button 
                    onClick={() => resolveSos(alert.id)}
                    className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors active:scale-95"
                  >
                    <CheckCircle2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Drives */}
      {testDrives.length > 0 && (
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-2 text-amber-500 px-1">
            <CarIcon size={14} />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">Тест-драйвы ({testDrives.length})</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x no-scrollbar">
            {testDrives.map(drive => (
              <div key={drive.id} className="min-w-[280px] md:min-w-[350px] bg-amber-500/5 border border-amber-500/10 rounded-2xl p-3 snap-center">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-black ${
                      drive.status === 'pending' ? 'bg-amber-500' :
                      drive.status === 'contacted' ? 'bg-blue-500' :
                      drive.status === 'completed' ? 'bg-emerald-500' :
                      'bg-zinc-500'
                    }`}>
                      <CarIcon size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold">{drive.name}</div>
                      <div className="text-[9px] text-zinc-500 uppercase tracking-widest">{drive.carModel}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold">{drive.date}</div>
                    <div className="text-[9px] text-zinc-500">{drive.time}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {drive.status === 'pending' && (
                    <button 
                      onClick={() => handleTestDriveStatusChange(drive.id, 'contacted', drive.userId)}
                      className="whitespace-nowrap px-3 py-1.5 bg-blue-500 text-white text-[9px] font-bold uppercase tracking-widest rounded-lg active:scale-95 transition-transform"
                    >
                      Связались
                    </button>
                  )}
                  {(drive.status === 'pending' || drive.status === 'contacted') && (
                    <button 
                      onClick={() => handleTestDriveStatusChange(drive.id, 'completed', drive.userId)}
                      className="whitespace-nowrap px-3 py-1.5 bg-emerald-500 text-white text-[9px] font-bold uppercase tracking-widest rounded-lg active:scale-95 transition-transform"
                    >
                      Завершен
                    </button>
                  )}
                  {drive.status !== 'cancelled' && drive.status !== 'completed' && (
                    <button 
                      onClick={() => handleTestDriveStatusChange(drive.id, 'cancelled', drive.userId)}
                      className="whitespace-nowrap px-3 py-1.5 bg-zinc-800 text-white text-[9px] font-bold uppercase tracking-widest rounded-lg active:scale-95 transition-transform"
                    >
                      Отменить
                    </button>
                  )}
                  {drive.status === 'completed' && (
                    <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 text-[9px] font-bold uppercase tracking-widest rounded-lg border border-emerald-500/20">
                      Завершен
                    </span>
                  )}
                  {drive.status === 'cancelled' && (
                    <span className="px-3 py-1.5 bg-zinc-800 text-zinc-400 text-[9px] font-bold uppercase tracking-widest rounded-lg border border-zinc-700">
                      Отменен
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard 
          title="Выручка" 
          value={<div className="flex items-center gap-1">{totalRevenue.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <BynIcon size="1em" /></div>} 
          icon={<TrendingUp size={18} className="text-emerald-500" />} 
          trend="+12%" 
          isUp={true} 
        />
        <StatCard 
          title="Активные" 
          value={inProgressRequests.length + pendingRequests.length} 
          icon={<Clock size={18} className="text-amber-500" />} 
          trend="+5" 
          isUp={true} 
        />
        <StatCard 
          title="Пилоты" 
          value={activePilots} 
          icon={<Users size={18} className="text-blue-500" />} 
          trend="0" 
          isUp={true} 
        />
        <StatCard 
          title="Завершено" 
          value={completedRequests.length} 
          icon={<CheckCircle2 size={18} className="text-zinc-500" />} 
          trend="+24" 
          isUp={true} 
        />
      </div>

      {viewMode === 'kanban' ? (
        <div className="space-y-6">
          {/* Mobile Kanban Tabs */}
          <div className="flex md:hidden bg-zinc-900 p-1 rounded-xl border border-zinc-800 mb-4">
            <button 
              onClick={() => setActiveKanbanTab('pending')}
              className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${activeKanbanTab === 'pending' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
            >
              Новые ({pendingRequests.length})
            </button>
            <button 
              onClick={() => setActiveKanbanTab('in_progress')}
              className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${activeKanbanTab === 'in_progress' ? 'bg-amber-500/20 text-amber-500' : 'text-zinc-500'}`}
            >
              В работе ({inProgressRequests.length})
            </button>
            <button 
              onClick={() => setActiveKanbanTab('completed')}
              className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${activeKanbanTab === 'completed' ? 'bg-emerald-500/20 text-emerald-500' : 'text-zinc-500'}`}
            >
              Готово ({completedRequests.length})
            </button>
          </div>

          {/* Desktop Kanban / Mobile Active Tab */}
          <div className="flex flex-col md:flex-row gap-4 overflow-x-auto pb-4 md:snap-x">
            {/* Column 1: Pending */}
            <div className={`${activeKanbanTab === 'pending' ? 'block' : 'hidden md:block'} min-w-full md:min-w-[320px] md:max-w-[350px] md:snap-center`}>
              <div className="hidden md:flex items-center justify-between mb-4 px-2">
                <h2 className="font-bold text-xs uppercase tracking-[0.2em] text-zinc-500">Новые</h2>
                <span className="bg-zinc-800 text-[10px] font-bold px-2 py-0.5 rounded-full">{pendingRequests.length}</span>
              </div>
              <div className="space-y-3">
                {pendingRequests.length === 0 ? (
                  <div className="text-center py-12 bg-zinc-900/30 rounded-3xl border border-dashed border-zinc-800 text-zinc-600 text-xs uppercase tracking-widest">Нет новых задач</div>
                ) : (
                  pendingRequests.map(req => (
                    <TaskCard 
                      key={req.id}
                      req={req}
                      user={users[req.userId]}
                      car={cars[req.carId]}
                      onAssign={() => handleAssignClick(req.id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Column 2: In Progress */}
            <div className={`${activeKanbanTab === 'in_progress' ? 'block' : 'hidden md:block'} min-w-full md:min-w-[320px] md:max-w-[350px] md:snap-center`}>
              <div className="hidden md:flex items-center justify-between mb-4 px-2">
                <h2 className="font-bold text-xs uppercase tracking-[0.2em] text-amber-500">В работе</h2>
                <span className="bg-amber-500/20 text-amber-500 text-[10px] font-bold px-2 py-0.5 rounded-full">{inProgressRequests.length}</span>
              </div>
              <div className="space-y-3">
                {inProgressRequests.length === 0 ? (
                  <div className="text-center py-12 bg-zinc-900/30 rounded-3xl border border-dashed border-zinc-800 text-zinc-600 text-xs uppercase tracking-widest">Пусто</div>
                ) : (
                  inProgressRequests.map(req => (
                    <TaskCard 
                      key={req.id}
                      req={req}
                      user={users[req.userId]}
                      car={cars[req.carId]}
                      pilot={users[req.pilotId || '']}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Column 3: Completed */}
            <div className={`${activeKanbanTab === 'completed' ? 'block' : 'hidden md:block'} min-w-full md:min-w-[320px] md:max-w-[350px] md:snap-center`}>
              <div className="hidden md:flex items-center justify-between mb-4 px-2">
                <h2 className="font-bold text-xs uppercase tracking-[0.2em] text-emerald-500">Завершенные</h2>
                <span className="bg-emerald-500/20 text-emerald-500 text-[10px] font-bold px-2 py-0.5 rounded-full">{completedRequests.length}</span>
              </div>
              <div className="space-y-3">
                {completedRequests.length === 0 ? (
                  <div className="text-center py-12 bg-zinc-900/30 rounded-3xl border border-dashed border-zinc-800 text-zinc-600 text-xs uppercase tracking-widest">Нет завершенных</div>
                ) : (
                  completedRequests.map(req => (
                    <TaskCard 
                      key={req.id}
                      req={req}
                      user={users[req.userId]}
                      car={cars[req.carId]}
                      pilot={users[req.pilotId || '']}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Поиск..."
                className="w-full bg-black border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-white transition-colors"
              />
            </div>
            <button className="p-2 text-zinc-400 hover:text-white transition-colors">
              <Filter size={20} />
            </button>
          </div>
          
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-950 text-[10px] uppercase tracking-widest text-zinc-500">
                  <th className="px-6 py-4 font-bold">ID</th>
                  <th className="px-6 py-4 font-bold">Клиент</th>
                  <th className="px-6 py-4 font-bold">Услуга</th>
                  <th className="px-6 py-4 font-bold">Статус</th>
                  <th className="px-6 py-4 font-bold">Пилот</th>
                  <th className="px-6 py-4 font-bold">Дата</th>
                  <th className="px-6 py-4 font-bold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {requests.map(req => (
                  <tr key={req.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4 text-xs font-mono text-zinc-500">#{req.id?.slice(-6) || '---'}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold">{users[req.userId]?.firstName || 'Неизвестно'}</div>
                      <div className="text-[10px] text-zinc-500">@{users[req.userId]?.username || '---'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-zinc-800 px-2 py-1 rounded">
                        {req.serviceType === 'logistics' ? 'Логистика' : 
                         req.serviceType === 'valet' ? 'Валет' : 
                         req.serviceType === 'parking' ? 'Паркинг' : 
                         req.serviceType === 'bureaucracy' ? 'Бюрократия' : 
                         req.serviceType === 'wash' ? 'Мойка' : 'СТО / ТО'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {req.pilotId ? users[req.pilotId]?.firstName : '---'}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link to={`/task/${req.id}`} className="p-2 text-zinc-500 hover:text-white transition-colors inline-block">
                        <ChevronRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden divide-y divide-zinc-800">
            {requests.map(req => (
              <Link 
                key={req.id} 
                to={`/task/${req.id}`}
                className="flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors active:bg-zinc-800"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                    <CarIcon size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{users[req.userId]?.firstName || 'Клиент'}</span>
                      <span className="text-[10px] font-mono text-zinc-500">#{req.id?.slice(-4)}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                      {req.serviceType} • {new Date(req.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={req.status} />
                  <ChevronRight size={16} className="text-zinc-700" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {assignModalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border-t md:border border-zinc-800 rounded-t-3xl md:rounded-3xl w-full max-w-md shadow-2xl animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] flex flex-col overflow-hidden">
            <div className="sticky top-0 z-10 bg-zinc-900 p-6 pb-2 border-b border-zinc-800/50 flex justify-between items-center md:rounded-t-3xl">
              <h2 className="text-xl font-bold uppercase tracking-tighter">Назначить пилота</h2>
              <button onClick={() => setAssignModalOpen(false)} className="text-zinc-500 hover:text-white p-2">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 pt-4 space-y-2 overflow-y-auto pb-[max(env(safe-area-inset-bottom),1.5rem)]">
              {pilots.length === 0 ? (
                <p className="text-zinc-400 text-sm text-center py-8">Нет доступных пилотов</p>
              ) : (
                <>
                {pilots.map(pilot => (
                  <button
                    key={pilot.id}
                    onClick={() => handleAssignPilot(pilot.id)}
                    className="w-full flex items-center justify-between p-4 bg-black border border-zinc-800 rounded-2xl hover:border-white transition-colors text-left group active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${pilot.isOnShift ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                      <div>
                        <div className="font-bold group-hover:text-white transition-colors">{pilot.firstName}</div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-widest">@{pilot.username}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {pilot.isOnShift && <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">На смене</span>}
                      <ChevronRight size={16} className="text-zinc-700 group-hover:text-white transition-colors" />
                    </div>
                  </button>
                ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, trend, isUp }: { title: string; value: React.ReactNode; icon: React.ReactNode; trend: string; isUp: boolean }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl md:rounded-3xl p-4 md:p-6">
      <div className="flex justify-between items-start mb-3 md:mb-4">
        <div className="p-2 md:p-3 bg-black rounded-xl md:rounded-2xl border border-zinc-800">
          {icon}
        </div>
        <div className={`hidden sm:flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${isUp ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
          {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {trend}
        </div>
      </div>
      <div className="text-lg md:text-2xl font-bold mb-0.5 md:mb-1 truncate">{value}</div>
      <div className="text-[8px] md:text-[10px] uppercase font-bold tracking-widest text-zinc-500">{title}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'pending': 'bg-zinc-800 text-zinc-400',
    'accepted': 'bg-blue-500/10 text-blue-500',
    'in_progress': 'bg-amber-500/10 text-amber-500',
    'completed': 'bg-emerald-500/10 text-emerald-500',
    'cancelled': 'bg-red-500/10 text-red-500'
  };
  
  const labels: Record<string, string> = {
    'pending': 'Новый',
    'accepted': 'Принят',
    'in_progress': 'В работе',
    'completed': 'Завершен',
    'cancelled': 'Отменен'
  };

  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  );
}

function TaskCard({ req, user, car, pilot, onAssign }: { req: RequestData; user?: UserData; car?: CarData; pilot?: UserData; onAssign?: () => void }) {
  const typeLabels: Record<string, string> = {
    'logistics': 'Логистика',
    'valet': 'Валет',
    'parking': 'Паркинг',
    'bureaucracy': 'Бюрократия',
    'wash': 'Мойка',
    'service': 'СТО / ТО'
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition-all group active:scale-[0.98]">
      <div className="flex justify-between items-start mb-3">
        <span className="text-[9px] font-bold px-2 py-0.5 bg-black border border-zinc-800 rounded uppercase tracking-widest text-zinc-500">
          {typeLabels[req.serviceType] || req.serviceType}
        </span>
        <Link to={`/task/${req.id}`} className="text-zinc-700 group-hover:text-white transition-colors p-1">
          <ArrowUpRight size={16} />
        </Link>
      </div>
      
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="font-bold text-sm truncate">{user?.firstName || 'Клиент'}</h3>
          <span className="text-[9px] font-mono text-zinc-600">#{req.id?.slice(-4)}</span>
        </div>
        <p className="text-[9px] text-zinc-500 uppercase tracking-widest truncate">@{user?.username || '---'}</p>
      </div>

      <div className="flex items-center gap-2 text-zinc-400 text-[11px] mb-4 bg-black/40 p-2 rounded-xl border border-zinc-800/50">
        <CarIcon size={14} className="text-zinc-600 flex-shrink-0" />
        <span className="truncate font-medium">{car ? `${car.make} ${car.model}` : 'Автомобиль'}</span>
      </div>
      
      {pilot ? (
        <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[8px] font-bold border border-zinc-700">
              {pilot.firstName?.charAt(0) || '?'}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-amber-500 truncate max-w-[100px]">
              {pilot.firstName || 'Пилот'}
            </div>
          </div>
          <div className="text-[8px] text-zinc-600 font-mono">
            {new Date(req.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
          </div>
        </div>
      ) : (
        <button 
          onClick={onAssign}
          className="w-full py-2.5 bg-white text-black text-[9px] font-bold uppercase tracking-[0.2em] rounded-xl hover:bg-zinc-200 transition-all active:scale-95 shadow-lg shadow-white/5"
        >
          Назначить
        </button>
      )}
    </div>
  );
}
