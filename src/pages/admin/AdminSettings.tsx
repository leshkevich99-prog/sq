import React, { useState, useEffect } from 'react';
import { BynIcon } from '../../components/BynIcon';
import { Save, Shield, Percent, DollarSign, Info, Plus, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { doc, onSnapshot, setDoc, collection, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface TariffConfig {
  id: string;
  name: string;
  price: number;
  commission: number;
  features: string[];
}

interface GlobalSettings {
  baseLogisticsPrice: number;
  baseWashPrice: number;
  pilotCommissionPercent: number;
  minPayoutAmount: number;
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<GlobalSettings>({
    baseLogisticsPrice: 35,
    baseWashPrice: 25,
    pilotCommissionPercent: 70,
    minPayoutAmount: 50
  });
  const [tariffs, setTariffs] = useState<TariffConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) {
        setSettings(doc.data() as GlobalSettings);
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/global'));

    const fetchTariffs = async () => {
      const snapshot = await getDocs(collection(db, 'tariffs'));
      const t: TariffConfig[] = [];
      snapshot.forEach(doc => {
        t.push({ id: doc.id, ...doc.data() } as TariffConfig);
      });
      setTariffs(t);
    };
    fetchTariffs();
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    const toastId = toast.loading('Сохранение настроек...');
    try {
      await setDoc(doc(db, 'settings', 'global'), settings);
      toast.success('Настройки сохранены', { id: toastId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
      toast.error('Ошибка при сохранении', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8">
        <h1 className="text-3xl font-serif font-normal tracking-wide uppercase">Настройки системы</h1>
        <p className="text-zinc-400 text-sm mt-1">Тарифы, комиссии и базовые цены</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Global Pricing */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="text-accent" size={24} />
            <h2 className="text-xl font-bold uppercase tracking-tighter">Базовое ценообразование</h2>
          </div>
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Логистика (База)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={settings.baseLogisticsPrice}
                    onChange={(e) => setSettings({...settings, baseLogisticsPrice: parseFloat(e.target.value)})}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-white transition-colors"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xs"><BynIcon size="1.2em" /></span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Мойка (База)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={settings.baseWashPrice}
                    onChange={(e) => setSettings({...settings, baseWashPrice: parseFloat(e.target.value)})}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-white transition-colors"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xs"><BynIcon size="1.2em" /></span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Доля пилота</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={settings.pilotCommissionPercent}
                    onChange={(e) => setSettings({...settings, pilotCommissionPercent: parseFloat(e.target.value)})}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-white transition-colors"
                  />
                  <Percent className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Мин. выплата</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={settings.minPayoutAmount}
                    onChange={(e) => setSettings({...settings, minPayoutAmount: parseFloat(e.target.value)})}
                    className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-white transition-colors"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xs"><BynIcon size="1.2em" /></span>
                </div>
              </div>
            </div>

            <button 
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full py-4 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-2xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
            >
              <Save size={18} />
              {saving ? 'Сохранение...' : 'Обновить конфигурацию'}
            </button>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex gap-3">
            <Info className="text-blue-500 shrink-0" size={20} />
            <p className="text-xs text-blue-200/70 leading-relaxed">
              Эти параметры влияют на автоматический расчет стоимости поручений и начислений пилотам. Изменения вступят в силу для всех новых поручений.
            </p>
          </div>
        </section>

        {/* Tariffs Management */}
        <section className="space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Shield className="text-accent" size={24} />
              <h2 className="text-xl font-bold uppercase tracking-tighter">Управление тарифами</h2>
            </div>
            <button className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors">
              <Plus size={20} />
            </button>
          </div>

          <div className="space-y-4">
            {tariffs.map(tariff => (
              <div key={tariff.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-white uppercase tracking-tight">{tariff.name}</h3>
                    <div className="text-2xl font-bold text-accent mt-1 flex items-center gap-1">{tariff.price.toFixed(2)} <BynIcon size="0.6em" className="text-zinc-500" /> <span className="text-sm font-normal text-zinc-500">/ мес</span></div>
                  </div>
                  <button className="text-zinc-600 hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
                
                <div className="space-y-2">
                  {tariff.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-zinc-400">
                      <div className="w-1 h-1 rounded-full bg-accent" />
                      {feature}
                    </div>
                  ))}
                </div>

                <button className="w-full mt-6 py-2.5 bg-zinc-800 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-700 transition-colors">
                  Редактировать тариф
                </button>
              </div>
            ))}
            
            {tariffs.length === 0 && (
              <div className="text-center py-12 bg-zinc-900/50 rounded-3xl border border-zinc-800/50 text-zinc-500">
                Тарифы не настроены
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
