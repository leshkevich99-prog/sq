import React, { useState, useEffect } from 'react';
import { Search, Car, CreditCard, ShieldAlert, X, DollarSign, Edit2, LayoutGrid, List as ListIcon, Users, UserCheck, ShieldCheck, Zap, ChevronDown } from 'lucide-react';
import { BynIcon } from '../../components/BynIcon';
import { db, handleFirestoreError, OperationType, collection, onSnapshot, addDoc, doc, updateDoc, deleteField } from '../../firebase';
import toast from 'react-hot-toast';
import { useKeyboard } from '../../hooks/useKeyboard';

interface UserData {
  id: string;
  firstName: string;
  username: string;
  role: string;
  subscription?: string;
  quotas?: {
    logistics?: number;
    wash?: number;
    [key: string]: number | undefined;
  };
  limits?: {
    logistics?: number;
    wash?: number;
    [key: string]: number | undefined;
  };
  usedQuotas?: {
    logistics?: number;
    wash?: number;
    [key: string]: number | undefined;
  };
  createdAt: string;
}

interface CarData {
  id: string;
  userId: string;
  make: string;
  model: string;
  vin?: string;
  year?: string;
  color?: string;
  plateNumber?: string;
  maintenanceSchedule?: string;
  inspectionDate?: string;
  insuranceDate?: string;
}

interface TransactionData {
  id: string;
  userId: string;
  type: string;
  amount: number;
}

export default function AdminCRM() {
  const [search, setSearch] = useState('');
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editCarModalOpen, setEditCarModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<UserData | null>(null);
  const [selectedCar, setSelectedCar] = useState<CarData | null>(null);
  const [userDetailsModalOpen, setUserDetailsModalOpen] = useState(false);
  const [users, setUsers] = useState<UserData[]>([]);
  const [cars, setCars] = useState<CarData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [billingType, setBillingType] = useState('deposit_deduction');
  const [billingAmount, setBillingAmount] = useState('');
  const [billingDescription, setBillingDescription] = useState('');
  const [billingReceipt, setBillingReceipt] = useState<File | null>(null);
  const [billingSubmitting, setBillingSubmitting] = useState(false);

  // Edit User State
  const [editFirstName, setEditFirstName] = useState('');
  const [editRole, setEditRole] = useState('client');
  const [editSubscription, setEditSubscription] = useState('');
  const [editQuotaLogistics, setEditQuotaLogistics] = useState(0);
  const [editQuotaWash, setEditQuotaWash] = useState(0);
  const [editQuotaValet, setEditQuotaValet] = useState(0);
  const [editQuotaParking, setEditQuotaParking] = useState(0);
  const [editQuotaBureaucracy, setEditQuotaBureaucracy] = useState(0);
  const [editQuotaService, setEditQuotaService] = useState(0);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Edit Car State
  const [editCarMake, setEditCarMake] = useState('');
  const [editCarModel, setEditCarModel] = useState('');
  const [editCarYear, setEditCarYear] = useState('');
  const [editCarColor, setEditCarColor] = useState('');
  const [editCarPlateNumber, setEditCarPlateNumber] = useState('');
  const [editCarVin, setEditCarVin] = useState('');
  const [editCarMaintenance, setEditCarMaintenance] = useState('');
  const [editCarInspection, setEditCarInspection] = useState('');
  const [editCarInsurance, setEditCarInsurance] = useState('');
  const [editCarSubmitting, setEditCarSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [selectedRole, setSelectedRole] = useState<'all' | 'admin' | 'pilot' | 'client'>('all');
  const [selectedTariff, setSelectedTariff] = useState('all');
  const isKeyboardVisible = useKeyboard();

  const fetchData = React.useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const [userRes, carRes, txRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/cars', { headers }),
        fetch('/api/admin/transactions', { headers })
      ]);

      if (userRes.ok) {
        const data = await userRes.json();
        setUsers(data.users || []);
      }

      if (carRes.ok) {
        const data = await carRes.json();
        setCars(data.cars || []);
      }

      if (txRes.ok) {
        const data = await txRes.json();
        setTransactions(data.transactions || []);
      }

      setLoading(false);
    } catch (error) {
      console.error('CRM Fetch error:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const openBilling = (user: UserData) => {
    setSelectedClient(user);
    setBillingType('deposit_deduction');
    setBillingAmount('');
    setBillingDescription('');
    setBillingReceipt(null);
    setBillingModalOpen(true);
  };

  const openEditUser = (user: UserData) => {
    setSelectedClient(user);
    setEditFirstName(user.firstName || '');
    setEditRole(user.role || 'client');
    setEditSubscription(user.subscription || '');
    setEditQuotaLogistics(user.limits?.logistics || user.quotas?.logistics || 0);
    setEditQuotaWash(user.limits?.wash || user.quotas?.wash || 0);
    setEditQuotaValet(user.limits?.valet || user.quotas?.valet || 0);
    setEditQuotaParking(user.limits?.parking || user.quotas?.parking || 0);
    setEditQuotaBureaucracy(user.limits?.bureaucracy || user.quotas?.bureaucracy || 0);
    setEditQuotaService(user.limits?.service || user.quotas?.service || 0);
    setEditUserModalOpen(true);
  };

  const openEditCar = (car: CarData) => {
    setSelectedCar(car);
    setEditCarMake(car.make);
    setEditCarModel(car.model);
    setEditCarYear(car.year || '');
    setEditCarColor(car.color || '');
    setEditCarPlateNumber(car.plateNumber || '');
    setEditCarVin(car.vin || '');
    setEditCarMaintenance(car.maintenanceSchedule || '');
    setEditCarInspection(car.inspectionDate || '');
    setEditCarInsurance(car.insuranceDate || '');
    setEditCarModalOpen(true);
  };

  const openUserDetails = (user: UserData) => {
    setSelectedClient(user);
    setUserDetailsModalOpen(true);
  };

  const handleBillingSubmit = async () => {
    if (!selectedClient || !billingAmount || !billingDescription) return;
    
    setBillingSubmitting(true);
    const toastId = toast.loading('Проведение операции...');
    try {
      let receiptUrl = '';
      if (billingReceipt) {
        const formData = new FormData();
        formData.append('file', billingReceipt);
        const response = await fetch('/api/upload-proxy', {
          method: 'POST',
          body: formData
        });
        if (!response.ok) throw new Error('Failed to upload receipt');
        const data = await response.json();
        receiptUrl = data.url;
      }

      await addDoc(collection(db, 'transactions'), {
        userId: selectedClient.id,
        type: billingType,
        amount: parseFloat(billingAmount),
        description: billingDescription,
        receiptUrl: receiptUrl || null,
        status: billingType === 'external_invoice' ? 'pending' : 'completed',
        createdAt: new Date().toISOString()
      });
      toast.success('Операция успешно проведена', { id: toastId });
      setBillingModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
      toast.error('Ошибка при проведении операции', { id: toastId });
    } finally {
      setBillingSubmitting(false);
    }
  };

  const handleEditUserSubmit = async () => {
    if (!selectedClient) return;
    
    setEditSubmitting(true);
    const toastId = toast.loading('Сохранение изменений...');
    try {
      const updateData: any = {
        firstName: editFirstName,
        role: editRole,
      };
      
      if (editSubscription) {
        updateData.subscription = editSubscription;
      }
      
      updateData.limits = {
        logistics: editQuotaLogistics,
        wash: editQuotaWash,
        valet: editQuotaValet,
        parking: editQuotaParking,
        bureaucracy: editQuotaBureaucracy,
        service: editQuotaService
      };

      await updateDoc(doc(db, 'users', selectedClient.id), updateData);
      toast.success('Данные пользователя обновлены', { id: toastId });
      setEditUserModalOpen(false);
    } catch (error: any) {
      console.error('Save user error:', error);
      const isPermissionError = error.message?.includes('permission-denied') || error.code === 'permission-denied';
      toast.error(isPermissionError ? 'Ошибка доступа: некоторые поля защищены от изменений' : 'Ошибка при сохранении', { id: toastId });
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleEditCarSubmit = async () => {
    if (!selectedCar) return;
    
    setEditCarSubmitting(true);
    const toastId = toast.loading('Обновление автомобиля...');
    try {
      const { id, ...updateData } = selectedCar;
      await updateDoc(doc(db, 'cars', id), {
        make: editCarMake,
        model: editCarModel,
        year: editCarYear,
        color: editCarColor,
        plateNumber: editCarPlateNumber,
        vin: editCarVin,
        maintenanceSchedule: editCarMaintenance,
        inspectionDate: editCarInspection,
        insuranceDate: editCarInsurance,
        updatedAt: new Date().toISOString()
      });
      toast.success('Автомобиль обновлен', { id: toastId });
      setEditCarModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cars/${selectedCar.id}`);
      toast.error('Ошибка при обновлении', { id: toastId });
    } finally {
      setEditCarSubmitting(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.firstName?.toLowerCase().includes(search.toLowerCase()) || 
                         u.username?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = selectedRole === 'all' || u.role === selectedRole;
    const matchesTariff = selectedTariff === 'all' || u.subscription === selectedTariff;
    
    return matchesSearch && matchesRole && matchesTariff;
  });

  const roleStats = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    pilot: users.filter(u => u.role === 'pilot').length,
    client: users.filter(u => u.role === 'client').length,
  };

  const tariffs = ['SQUADRA FAMILY', 'PIT STOP', 'TELEMETRY', 'Базовый'];

  const kanbanColumns = [
    { id: 'admin', title: 'Админы', role: 'admin', filter: (u: UserData) => u.role === 'admin' },
    { id: 'pilot', title: 'Пилоты', role: 'pilot', filter: (u: UserData) => u.role === 'pilot' },
    { id: 'family', title: 'SQUADRA FAMILY', role: 'client', filter: (u: UserData) => u.role === 'client' && u.subscription === 'SQUADRA FAMILY' },
    { id: 'pitstop', title: 'PIT STOP', role: 'client', filter: (u: UserData) => u.role === 'client' && u.subscription === 'PIT STOP' },
    { id: 'telemetry', title: 'TELEMETRY', role: 'client', filter: (u: UserData) => u.role === 'client' && u.subscription === 'TELEMETRY' },
    { id: 'basic', title: 'Базовый', role: 'client', filter: (u: UserData) => u.role === 'client' && (!u.subscription || (u.subscription !== 'SQUADRA FAMILY' && u.subscription !== 'PIT STOP' && u.subscription !== 'TELEMETRY')) },
  ];

  // Linking selectedTariff to Kanban columns
  const activeColumns = kanbanColumns.filter(col => {
    const matchesRole = selectedRole === 'all' || col.role === selectedRole;
    const matchesTariff = selectedTariff === 'all' || col.title === selectedTariff || (selectedTariff === 'Базовый' && col.id === 'basic');
    return matchesRole && matchesTariff;
  });

  return (
    <div className="animate-in fade-in duration-500">
      <header className="mb-6 mt-2 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-normal tracking-wide uppercase">CRM База</h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1">Клиенты, автомобили и история</p>
        </div>
        <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 w-full sm:w-auto">
          <button 
            onClick={() => setViewMode('list')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${viewMode === 'list' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}
          >
            <ListIcon size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest sm:hidden">Список</span>
          </button>
          <button 
            onClick={() => setViewMode('kanban')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${viewMode === 'kanban' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}
          >
            <LayoutGrid size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest sm:hidden">Канбан</span>
          </button>
        </div>
      </header>

      {/* Filters Section */}
      <div className="space-y-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Role Selector */}
          <div className="flex-1">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 ml-1">Категория</label>
            <div className="grid grid-cols-4 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
              {[
                { id: 'all', label: 'Все', icon: Users, count: roleStats.all },
                { id: 'admin', label: 'Админы', icon: ShieldCheck, count: roleStats.admin },
                { id: 'pilot', label: 'Пилоты', icon: UserCheck, count: roleStats.pilot },
                { id: 'client', label: 'Клиенты', icon: Zap, count: roleStats.client },
              ].map(role => (
                <button
                  key={role.id}
                  onClick={() => {
                    setSelectedRole(role.id as any);
                    if (role.id !== 'client' && role.id !== 'all') setSelectedTariff('all');
                  }}
                  className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-all ${
                    selectedRole === role.id 
                      ? 'bg-zinc-800 text-white shadow-lg' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <role.icon size={14} className={selectedRole === role.id ? 'text-accent' : 'text-zinc-600'} />
                  <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-tighter mt-1">{role.label}</span>
                  {role.count > 0 && (
                    <span className={`absolute -top-1 -right-1 px-1 rounded-md text-[7px] font-mono ${
                      selectedRole === role.id ? 'bg-accent text-black' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {role.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tariff Dropdown */}
          {(selectedRole === 'client' || selectedRole === 'all') && (
            <div className="sm:w-64">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 ml-1">Тарифный план</label>
              <div className="relative">
                <select
                  value={selectedTariff}
                  onChange={(e) => setSelectedTariff(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-4 pr-10 text-xs font-bold uppercase tracking-wider focus:outline-none focus:border-accent appearance-none cursor-pointer transition-all"
                >
                  <option value="all">Все тарифы</option>
                  {tariffs.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={14} />
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input 
            type="text" 
            placeholder="Поиск по имени или @username..." 
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-accent transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center text-zinc-500 py-8">Загрузка клиентов...</div>
      ) : (
        <>
          {viewMode === 'list' ? (
            <div className="space-y-4">
              {filteredUsers.map(user => {
                const userCars = cars.filter(c => c.userId === user.id);
                const userTxs = transactions.filter(t => t.userId === user.id);
                const balance = userTxs.reduce((acc, tx) => {
                  if (tx.type === 'deposit') return acc + tx.amount;
                  if (tx.type === 'deposit_deduction') return acc - tx.amount;
                  return acc;
                }, 0);

                return (
                  <ClientCard 
                    key={user.id}
                    name={user.firstName || 'Без имени'}
                    username={user.username}
                    status={user.role} 
                    car={userCars.length > 0 ? `${userCars[0].make} ${userCars[0].model}${userCars.length > 1 ? ` (+${userCars.length - 1})` : ''}` : 'Нет авто'} 
                    deposit={balance.toFixed(2)} 
                    tariff={user.subscription || 'Базовый'}
                    quotas={user.limits || user.quotas}
                    usedQuotas={user.usedQuotas}
                    onBillingClick={() => openBilling(user)}
                    onEditClick={() => openEditUser(user)}
                    onViewClick={() => openUserDetails(user)}
                  />
                );
              })}
              {filteredUsers.length === 0 && (
                <div className="text-center text-zinc-500 py-8 italic text-sm">В этой категории пока никого нет</div>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {/* Kanban Grid - Stacked on mobile, Grid on desktop */}
              <div className={`flex flex-col sm:grid gap-8 ${
                activeColumns.length === 1 ? 'sm:grid-cols-1' : 
                activeColumns.length === 2 ? 'sm:grid-cols-2' :
                activeColumns.length === 3 ? 'sm:grid-cols-3' :
                'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              }`}>
                {activeColumns.map(col => {
                  const columnUsers = filteredUsers.filter(col.filter);

                  return (
                    <div 
                      key={col.id} 
                      className="flex flex-col"
                    >
                      <div className="flex items-center justify-between mb-4 px-1 sticky top-0 bg-black/50 backdrop-blur-md py-2 z-10 sm:static sm:bg-transparent sm:backdrop-blur-none sm:py-0">
                        <h3 className="font-bold text-[10px] uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            col.role === 'admin' ? 'bg-accent' : 
                            col.role === 'pilot' ? 'bg-blue-500' : 
                            'bg-emerald-500'
                          }`} />
                          {col.title} 
                          <span className="ml-2 px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-500 font-mono text-[9px]">{columnUsers.length}</span>
                        </h3>
                      </div>
                      <div className="space-y-4">
                        {columnUsers.map(user => {
                          const userCars = cars.filter(c => c.userId === user.id);
                          const userTxs = transactions.filter(t => t.userId === user.id);
                          const balance = userTxs.reduce((acc, tx) => {
                            if (tx.type === 'deposit') return acc + tx.amount;
                            if (tx.type === 'deposit_deduction') return acc - tx.amount;
                            return acc;
                          }, 0);

                          return (
                            <ClientCard 
                              key={user.id}
                              name={user.firstName || 'Без имени'}
                              username={user.username}
                              status={user.role} 
                              car={userCars.length > 0 ? `${userCars[0].make} ${userCars[0].model}${userCars.length > 1 ? ` (+${userCars.length - 1})` : ''}` : 'Нет авто'} 
                              deposit={balance.toFixed(2)} 
                              tariff={user.subscription || 'Базовый'}
                              quotas={user.limits || user.quotas}
                              usedQuotas={user.usedQuotas}
                              onBillingClick={() => openBilling(user)}
                              onEditClick={() => openEditUser(user)}
                              onViewClick={() => openUserDetails(user)}
                            />
                          );
                        })}
                        {columnUsers.length === 0 && (
                          <div className="border-2 border-dashed border-zinc-900 rounded-2xl h-24 flex items-center justify-center text-zinc-800 text-[10px] italic uppercase tracking-widest">
                            Пусто
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* User Details Modal */}
      {userDetailsModalOpen && selectedClient && (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-2xl mx-auto bg-zinc-900 rounded-t-3xl sm:rounded-2xl sm:mb-4 animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] flex flex-col relative overflow-hidden">
            <div className="sticky top-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-b border-zinc-800/50 flex justify-between items-start shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-zinc-800 flex items-center justify-center text-xl sm:text-2xl font-bold border border-zinc-700">
                  {selectedClient.firstName[0]}
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white">{selectedClient.firstName}</h2>
                  <p className="text-zinc-500 text-sm">@{selectedClient.username}</p>
                </div>
              </div>
              <button onClick={() => setUserDetailsModalOpen(false)} className="text-zinc-500 hover:text-white p-2">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6 sm:space-y-8 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4">Информация</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-zinc-800">
                      <span className="text-zinc-500 text-xs">Роль</span>
                      <span className="text-white text-xs font-bold uppercase tracking-wider">{selectedClient.role}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-800">
                      <span className="text-zinc-500 text-xs">Тариф</span>
                      <span className="text-white text-xs font-bold uppercase tracking-wider">{selectedClient.subscription || 'Базовый'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-800">
                      <span className="text-zinc-500 text-xs">Регистрация</span>
                      <span className="text-white text-xs">{new Date(selectedClient.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4">Автомобили</h3>
                  <div className="space-y-2">
                    {cars.filter(c => c.userId === selectedClient.id).map(car => (
                      <div key={car.id} className="flex flex-col p-3 bg-black border border-zinc-800 rounded-xl group">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-3">
                              <Car size={16} className="text-zinc-500" />
                              <span className="text-xs font-bold text-white">
                                {car.make} {car.model} {car.year ? `(${car.year})` : ''}
                              </span>
                            </div>
                            <button 
                              onClick={() => openEditCar(car)}
                              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 pl-7">
                            {car.plateNumber && (
                              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                                Номер: {car.plateNumber}
                              </div>
                            )}
                            {car.color && (
                              <div className="text-[10px] text-zinc-500">
                                Цвет: {car.color}
                              </div>
                            )}
                            {car.vin && (
                              <div className="text-[10px] text-zinc-500 font-mono">
                                VIN: {car.vin}
                              </div>
                            )}
                          </div>
                      </div>
                    ))}
                    {cars.filter(c => c.userId === selectedClient.id).length === 0 && (
                      <p className="text-zinc-600 text-xs italic">Автомобили не добавлены</p>
                    )}
                  </div>
                </section>
              </div>

              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4">Последние транзакции</h3>
                <div className="space-y-2">
                  {transactions
                    .filter(t => t.userId === selectedClient.id)
                    .slice(0, 5)
                    .map(tx => (
                      <div key={tx.id} className="flex justify-between items-center p-3 bg-black border border-zinc-800 rounded-xl">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{tx.type}</div>
                          <div className="text-[8px] text-zinc-600">ID: {tx.id.slice(-6)}</div>
                        </div>
                        <div className={`text-xs font-bold flex items-center gap-1 ${tx.type === 'deposit' ? 'text-emerald-500' : 'text-white'}`}>
                          {tx.type === 'deposit' ? '+' : '-'}{tx.amount.toFixed(2)} <BynIcon size="1em" />
                        </div>
                      </div>
                    ))}
                  {transactions.filter(t => t.userId === selectedClient.id).length === 0 && (
                    <p className="text-zinc-600 text-xs italic">Транзакций нет</p>
                  )}
                </div>
              </section>
            </div>

            <div className={`sticky bottom-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-t border-zinc-800/50 shrink-0 pb-[max(env(safe-area-inset-bottom),1.5rem)] ${isKeyboardVisible ? 'hidden' : 'block'}`}>
              <div className="flex gap-3">
                <button 
                  onClick={() => { setUserDetailsModalOpen(false); openEditUser(selectedClient); }}
                  className="flex-1 py-3 bg-zinc-800 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-700 transition-colors"
                >
                  Редактировать
                </button>
                <button 
                  onClick={() => { setUserDetailsModalOpen(false); openBilling(selectedClient); }}
                  className="flex-1 py-3 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-200 transition-colors"
                >
                  Биллинг
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Billing Modal */}
      {billingModalOpen && selectedClient && (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-md mx-auto bg-zinc-900 rounded-t-3xl sm:rounded-2xl sm:mb-4 animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] flex flex-col relative overflow-hidden">
            <div className="sticky top-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-b border-zinc-800/50 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold uppercase tracking-tighter">Ручной биллинг</h2>
              <button onClick={() => setBillingModalOpen(false)} className="text-zinc-500 hover:text-white p-2">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 pt-4 space-y-4 overflow-y-auto flex-1">
              <p className="text-sm text-zinc-400 mb-2">Клиент: <span className="text-white font-medium">{selectedClient.firstName} (@{selectedClient.username})</span></p>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Тип операции</label>
                <select 
                  value={billingType}
                  onChange={(e) => setBillingType(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-accent text-white"
                >
                  <option value="deposit">Пополнение депозита (+)</option>
                  <option value="deposit_deduction">Списание с депозита (-)</option>
                  <option value="external_invoice">Выставить счет вне депозита</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">Сумма (<BynIcon size="1em" />)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                  <input 
                    type="number" 
                    placeholder="0.00" 
                    value={billingAmount}
                    onChange={(e) => setBillingAmount(e.target.value)}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 pl-9 pr-4 text-sm focus:outline-none focus:border-accent text-white" 
                    enterKeyHint="done"
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Комментарий для клиента</label>
                <textarea 
                  placeholder="Например: Оплата ТО в Porsche Центр" 
                  value={billingDescription}
                  onChange={(e) => setBillingDescription(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-accent h-24 resize-none text-white"
                  enterKeyHint="done"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Квитанция / Чек (опционально)</label>
                <input 
                  type="file" 
                  accept="image/*,.pdf"
                  onChange={(e) => setBillingReceipt(e.target.files?.[0] || null)}
                  className="w-full bg-black border border-zinc-800 rounded-xl p-2 text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700"
                />
              </div>
            </div>
            
            <div className={`sticky bottom-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-t border-zinc-800/50 shrink-0 pb-[max(env(safe-area-inset-bottom),1.5rem)] ${isKeyboardVisible ? 'hidden' : 'block'}`}>
              <button 
                onClick={handleBillingSubmit}
                disabled={billingSubmitting || !billingAmount || !billingDescription}
                className="w-full py-3 bg-white text-black text-sm font-bold uppercase tracking-wider rounded-xl disabled:opacity-50 hover:bg-zinc-200 transition-colors"
              >
                {billingSubmitting ? 'Обработка...' : 'Провести операцию'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUserModalOpen && selectedClient && (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-md mx-auto bg-zinc-900 rounded-t-3xl sm:rounded-2xl sm:mb-4 animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] flex flex-col relative overflow-hidden">
            <div className="sticky top-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-b border-zinc-800/50 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold uppercase tracking-tighter">Настройки клиента</h2>
              <button onClick={() => setEditUserModalOpen(false)} className="text-zinc-500 hover:text-white p-2">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 pt-4 space-y-4 overflow-y-auto flex-1">
              <p className="text-sm text-zinc-400 mb-2">Клиент: <span className="text-white font-medium">{selectedClient.firstName} (@{selectedClient.username})</span></p>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Имя / Фамилия</label>
                <input 
                  type="text" 
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  placeholder="Имя клиента"
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-accent text-white"
                  enterKeyHint="done"
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Роль</label>
                <select 
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-accent text-white"
                >
                  <option value="client">Клиент</option>
                  <option value="pilot">Пилот</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Тариф</label>
                <select 
                  value={editSubscription}
                  onChange={(e) => setEditSubscription(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-accent text-white"
                >
                  <option value="">Базовый (Без тарифа)</option>
                  <option value="TELEMETRY">TELEMETRY</option>
                  <option value="PIT STOP">PIT STOP</option>
                  <option value="SQUADRA FAMILY">SQUADRA FAMILY</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Квота: Логистика</label>
                  <input 
                    type="number" 
                    value={editQuotaLogistics}
                    onChange={(e) => setEditQuotaLogistics(parseInt(e.target.value) || 0)}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent text-white" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Квота: Мойка</label>
                  <input 
                    type="number" 
                    value={editQuotaWash}
                    onChange={(e) => setEditQuotaWash(parseInt(e.target.value) || 0)}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent text-white" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Квота: Валет</label>
                  <input 
                    type="number" 
                    value={editQuotaValet}
                    onChange={(e) => setEditQuotaValet(parseInt(e.target.value) || 0)}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent text-white" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Квота: Паркинг</label>
                  <input 
                    type="number" 
                    value={editQuotaParking}
                    onChange={(e) => setEditQuotaParking(parseInt(e.target.value) || 0)}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent text-white" 
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Квота: Бюрократия</label>
                  <input 
                    type="number" 
                    value={editQuotaBureaucracy}
                    onChange={(e) => setEditQuotaBureaucracy(parseInt(e.target.value) || 0)}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent text-white" 
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Квота: СТО / ТО</label>
                  <input 
                    type="number" 
                    value={editQuotaService}
                    onChange={(e) => setEditQuotaService(parseInt(e.target.value) || 0)}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent text-white" 
                  />
                </div>
              </div>
            </div>

            <div className={`sticky bottom-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-t border-zinc-800/50 shrink-0 pb-[max(env(safe-area-inset-bottom),1.5rem)] ${isKeyboardVisible ? 'hidden' : 'block'}`}>
              <div className="flex gap-2">
                <button 
                  onClick={async () => {
                    if (!selectedClient) return;
                    try {
                      const userRef = doc(db, 'users', selectedClient.id);
                      await updateDoc(userRef, {
                        usedQuotas: deleteField()
                      });
                      toast.success('Использованные квоты сброшены');
                    } catch (error) {
                      console.error('Error resetting used quotas:', error);
                      toast.error('Ошибка при сбросе квот');
                    }
                  }}
                  className="flex-1 py-3 bg-zinc-800 text-white text-[10px] sm:text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-zinc-700 transition-colors"
                >
                  Сбросить использование
                </button>
                <button 
                  onClick={handleEditUserSubmit}
                  disabled={editSubmitting}
                  className="flex-[1.5] py-3 bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-wider rounded-xl disabled:opacity-50 hover:bg-zinc-200 transition-colors"
                >
                  {editSubmitting ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Car Modal */}
      {editCarModalOpen && selectedCar && (
        <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-sm mx-auto bg-zinc-900 rounded-t-3xl sm:rounded-2xl sm:mb-4 animate-in slide-in-from-bottom-full duration-300 max-h-[85vh] flex flex-col relative overflow-hidden">
            <div className="sticky top-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-b border-zinc-800/50 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold uppercase tracking-tighter">Редактировать авто</h2>
              <button onClick={() => setEditCarModalOpen(false)} className="text-zinc-500 hover:text-white p-2">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Марка</label>
                  <input 
                    type="text" 
                    value={editCarMake}
                    onChange={(e) => setEditCarMake(e.target.value)}
                    className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-accent text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Модель</label>
                  <input 
                    type="text" 
                    value={editCarModel}
                    onChange={(e) => setEditCarModel(e.target.value)}
                    className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-accent text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Год</label>
                  <input 
                    type="text" 
                    value={editCarYear}
                    onChange={(e) => setEditCarYear(e.target.value)}
                    placeholder="2024"
                    className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-accent text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Цвет</label>
                  <input 
                    type="text" 
                    value={editCarColor}
                    onChange={(e) => setEditCarColor(e.target.value)}
                    placeholder="Черный"
                    className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-accent text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Гос. номер</label>
                <input 
                  type="text" 
                  value={editCarPlateNumber}
                  onChange={(e) => setEditCarPlateNumber(e.target.value.toUpperCase())}
                  placeholder="7777 AB-7"
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:border-accent text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">VIN номер</label>
                <input 
                  type="text" 
                  value={editCarVin}
                  onChange={(e) => setEditCarVin(e.target.value.toUpperCase())}
                  placeholder="WBA..."
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm font-mono focus:outline-none focus:border-accent text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="bg-black rounded-xl p-4 border border-zinc-800">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Страховка до</label>
                  <input 
                    type="date" 
                    value={editCarInsurance || ''} 
                    onChange={(e) => setEditCarInsurance(e.target.value)}
                    className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-accent [color-scheme:dark]"
                  />
                </div>
                <div className="bg-black rounded-xl p-4 border border-zinc-800">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Техосмотр до</label>
                  <input 
                    type="date" 
                    value={editCarInspection || ''} 
                    onChange={(e) => setEditCarInspection(e.target.value)}
                    className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-accent [color-scheme:dark]"
                  />
                </div>
                <div className="bg-black rounded-xl p-4 border border-zinc-800">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Следующее ТО</label>
                  <input 
                    type="date" 
                    value={editCarMaintenance || ''} 
                    onChange={(e) => setEditCarMaintenance(e.target.value)}
                    className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white focus:outline-none focus:border-accent [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>
            
            <div className={`sticky bottom-0 z-20 bg-zinc-900/80 backdrop-blur-md p-6 border-t border-zinc-800/50 shrink-0 pb-[max(env(safe-area-inset-bottom),1.5rem)] ${isKeyboardVisible ? 'hidden' : 'block'}`}>
              <button 
                onClick={handleEditCarSubmit}
                disabled={editCarSubmitting || !editCarMake || !editCarModel}
                className="w-full py-3 bg-white text-black text-sm font-bold uppercase tracking-wider rounded-xl disabled:opacity-50 hover:bg-zinc-200 transition-colors"
              >
                {editCarSubmitting ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ClientCard: React.FC<{ 
  name: string, 
  username?: string,
  status: string, 
  car: string, 
  deposit: string, 
  tariff: string, 
  quotas?: { logistics?: number, wash?: number, valet?: number, parking?: number, bureaucracy?: number, service?: number },
  usedQuotas?: { logistics?: number, wash?: number, valet?: number, parking?: number, bureaucracy?: number, service?: number },
  onBillingClick: () => void,
  onEditClick: () => void,
  onViewClick: () => void
}> = ({ name, username, status, car, deposit, tariff, quotas, usedQuotas, onBillingClick, onEditClick, onViewClick }) => {
  const statusColors: Record<string, string> = {
    client: 'bg-emerald-500/20 text-emerald-500',
    admin: 'bg-accent/20 text-accent',
    pilot: 'bg-blue-500/20 text-blue-500'
  };
  
  const statusLabels: Record<string, string> = {
    client: 'Клиент',
    admin: 'Админ',
    pilot: 'Пилот'
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 sm:p-5 transition-all hover:border-zinc-700">
      <div className="flex justify-between items-start mb-3 sm:mb-4">
        <div className="cursor-pointer flex-1 min-w-0" onClick={onViewClick}>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-base sm:text-lg text-white leading-tight truncate">{name}</h3>
            <span className={`text-[8px] sm:text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wider ${statusColors[status] || statusColors.client}`}>
              {statusLabels[status] || status}
            </span>
          </div>
          {username && <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5 truncate">@{username}</p>}
        </div>
        <div className="flex gap-1 ml-2">
          <button 
            onClick={onEditClick}
            className="p-1.5 sm:p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            title="Настройки"
          >
            <Edit2 size={16} />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-5 cursor-pointer" onClick={onViewClick}>
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <div className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded-lg bg-black flex items-center justify-center border border-zinc-800">
              <Car size={12} className="text-zinc-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] sm:text-[9px] uppercase text-zinc-500 font-bold tracking-wider truncate">Авто</span>
              <span className="font-bold text-[10px] sm:text-xs truncate">{car || 'Нет'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <div className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded-lg bg-black flex items-center justify-center border border-zinc-800">
              <CreditCard size={12} className="text-zinc-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] sm:text-[9px] uppercase text-zinc-500 font-bold tracking-wider truncate">Депозит</span>
              <span className={`font-bold text-[10px] sm:text-xs truncate ${parseFloat(deposit) < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {deposit} <BynIcon size="1em" />
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <div className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded-lg bg-black flex items-center justify-center border border-zinc-800">
              <ShieldAlert size={12} className="text-zinc-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] sm:text-[9px] uppercase text-zinc-500 font-bold tracking-wider truncate">Тариф</span>
              <span className="font-bold text-[10px] sm:text-xs truncate">{tariff || 'Стандарт'}</span>
            </div>
          </div>
        </div>
      </div>

      {quotas && (
        <div className="mb-4 sm:mb-5 p-2 sm:p-3 bg-black/50 border border-zinc-800/50 rounded-xl">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500">Квоты (Остаток)</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-[8px] sm:text-[10px]">
            <div className="flex flex-col">
              <span className="text-zinc-500 uppercase tracking-tighter">Лог.</span>
              <span className="text-white font-bold">{quotas.logistics || 0}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-zinc-500 uppercase tracking-tighter">Мойка</span>
              <span className="text-white font-bold">{quotas.wash || 0}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-zinc-500 uppercase tracking-tighter">Валет</span>
              <span className="text-white font-bold">{quotas.valet || 0}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1.5 sm:gap-2">
        <button 
          onClick={onViewClick} 
          className="flex-1 py-2 sm:py-2.5 bg-zinc-800 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-wider rounded-xl hover:bg-zinc-700 transition-colors"
        >
          Профиль
        </button>
        <button 
          onClick={onBillingClick} 
          className="flex-1 py-2 sm:py-2.5 bg-white text-black text-[9px] sm:text-[10px] font-bold uppercase tracking-wider rounded-xl hover:bg-zinc-200 transition-colors"
        >
          Биллинг
        </button>
      </div>
    </div>
  );
};
