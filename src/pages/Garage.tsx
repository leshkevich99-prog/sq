import React from 'react';
import { Settings, AlertCircle, Calendar } from 'lucide-react';

export default function Garage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6 mt-2 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter uppercase">Бортовой журнал</h1>
          <p className="text-zinc-400 text-sm mt-1">Цифровая история автомобиля</p>
        </div>
        <button className="p-2 bg-zinc-900 rounded-full border border-zinc-800">
          <Settings size={20} />
        </button>
      </header>

      <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 mb-6">
        <div className="aspect-video bg-zinc-800 relative">
          <img 
            src="https://images.unsplash.com/photo-1503376713251-872439a4561b?q=80&w=1000&auto=format&fit=crop" 
            alt="Porsche 911" 
            className="w-full h-full object-cover opacity-80"
            referrerPolicy="no-referrer"
          />
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <h2 className="text-xl font-bold">Porsche 911 Carrera S</h2>
            <p className="text-sm text-zinc-300">Гос. номер: 0001 MI-7</p>
          </div>
        </div>
        
        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="bg-black rounded-xl p-3 border border-zinc-800">
            <div className="text-xs text-zinc-500 mb-1">Пробег</div>
            <div className="font-mono text-lg">42,500 км</div>
          </div>
          <div className="bg-black rounded-xl p-3 border border-zinc-800">
            <div className="text-xs text-zinc-500 mb-1">Год выпуска</div>
            <div className="font-mono text-lg">2021</div>
          </div>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">Статусы и регламенты</h3>
      
      <div className="space-y-3">
        <StatusCard 
          icon={<AlertCircle size={20} className="text-amber-500" />}
          title="Техническое обслуживание"
          value="Через 2,500 км"
          urgent
        />
        <StatusCard 
          icon={<Calendar size={20} className="text-zinc-400" />}
          title="Страховка КАСКО"
          value="До 15.08.2026"
        />
        <StatusCard 
          icon={<Calendar size={20} className="text-zinc-400" />}
          title="Гостехосмотр"
          value="До 10.10.2026"
        />
      </div>
    </div>
  );
}

function StatusCard({ icon, title, value, urgent }: { icon: React.ReactNode; title: string; value: string; urgent?: boolean }) {
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border ${urgent ? 'bg-amber-500/10 border-amber-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
      <div className="shrink-0">{icon}</div>
      <div className="flex-1">
        <h4 className="text-sm font-medium">{title}</h4>
        <p className={`text-xs mt-0.5 ${urgent ? 'text-amber-500' : 'text-zinc-400'}`}>{value}</p>
      </div>
    </div>
  );
}
