import React from 'react';
import { ArrowRight, ShieldCheck, Clock, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8 mt-2">
        <h1 className="text-3xl font-bold tracking-tighter uppercase">Squadra</h1>
        <p className="text-zinc-400 text-sm mt-1">Премиальный сервис управления автопарком</p>
      </header>

      <section className="mb-8">
        <div className="bg-zinc-900 rounded-2xl p-5 relative overflow-hidden border border-zinc-800">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <ShieldCheck size={120} />
          </div>
          <div className="relative z-10">
            <div className="inline-block px-2 py-1 bg-zinc-800 text-xs rounded-md text-zinc-300 mb-3 uppercase tracking-wider font-medium">
              Активный тариф
            </div>
            <h2 className="text-2xl font-bold mb-1">PIT STOP</h2>
            <p className="text-zinc-400 text-sm mb-4">Осталось 2 мойки и 1 поручение</p>
            <Link 
              to="/tariffs"
              className="inline-flex items-center text-sm font-medium text-white hover:text-zinc-300 transition-colors"
            >
              Управление тарифом <ArrowRight size={16} className="ml-1" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">Быстрые действия</h3>
        <div className="grid grid-cols-2 gap-3">
          <QuickAction to="/order" icon={<MapPin size={20} />} label="Вызвать пилота" />
          <QuickAction to="/garage" icon={<Clock size={20} />} label="Запись на ТО" />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">Последние события</h3>
        <div className="space-y-3">
          <EventCard 
            title="Комплексная мойка" 
            date="Вчера, 14:30" 
            car="Porsche 911" 
            status="Выполнено" 
          />
          <EventCard 
            title="Забор автомобиля" 
            date="12 Марта, 09:00" 
            car="Porsche 911" 
            status="Выполнено" 
          />
        </div>
      </section>
    </div>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-zinc-800 transition-colors active:scale-95">
      <div className="text-white">{icon}</div>
      <span className="text-xs font-medium text-center">{label}</span>
    </Link>
  );
}

function EventCard({ title, date, car, status }: { title: string; date: string; car: string; status: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex justify-between items-center">
      <div>
        <h4 className="font-medium text-sm">{title}</h4>
        <p className="text-xs text-zinc-500 mt-1">{car} • {date}</p>
      </div>
      <div className="text-[10px] uppercase tracking-wider px-2 py-1 bg-zinc-800 text-zinc-300 rounded">
        {status}
      </div>
    </div>
  );
}
