import React, { useState } from 'react';
import { MapPin, Calendar, Clock, ChevronRight } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

export default function Order() {
  const [service, setService] = useState('logistics');

  const handleOrder = () => {
    try {
      WebApp.showAlert('Заявка отправлена. Пилот свяжется с вами в течение 5 минут.');
    } catch (e) {
      alert('Заявка отправлена. Пилот свяжется с вами в течение 5 минут.');
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6 mt-2">
        <h1 className="text-2xl font-bold tracking-tighter uppercase">Вызов пилота</h1>
        <p className="text-zinc-400 text-sm mt-1">Оформление заявки на обслуживание</p>
      </header>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
        <ServiceTab active={service === 'logistics'} onClick={() => setService('logistics')}>Логистика</ServiceTab>
        <ServiceTab active={service === 'wash'} onClick={() => setService('wash')}>Мойка</ServiceTab>
        <ServiceTab active={service === 'service'} onClick={() => setService('service')}>СТО / ТО</ServiceTab>
      </div>

      <div className="space-y-4 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between active:bg-zinc-800 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center">
              <MapPin size={18} className="text-zinc-400" />
            </div>
            <div>
              <div className="text-xs text-zinc-500">Откуда забрать</div>
              <div className="text-sm font-medium">Пр-т Победителей, 9</div>
            </div>
          </div>
          <ChevronRight size={20} className="text-zinc-600" />
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between active:bg-zinc-800 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center">
              <MapPin size={18} className="text-zinc-400" />
            </div>
            <div>
              <div className="text-xs text-zinc-500">Куда доставить</div>
              <div className="text-sm font-medium">Выбрать на карте</div>
            </div>
          </div>
          <ChevronRight size={20} className="text-zinc-600" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
            <Calendar size={18} className="text-zinc-400" />
            <div>
              <div className="text-xs text-zinc-500">Дата</div>
              <div className="text-sm font-medium">Сегодня</div>
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
            <Clock size={18} className="text-zinc-400" />
            <div>
              <div className="text-xs text-zinc-500">Время</div>
              <div className="text-sm font-medium">Как можно скорее</div>
            </div>
          </div>
        </div>
      </div>

      <button 
        onClick={handleOrder}
        className="w-full bg-white text-black py-4 rounded-xl font-bold uppercase tracking-wider active:scale-[0.98] transition-transform"
      >
        Подтвердить вызов
      </button>
      <p className="text-center text-xs text-zinc-500 mt-4">
        Нажимая кнопку, вы соглашаетесь с условиями сервиса
      </p>
    </div>
  );
}

function ServiceTab({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
      }`}
    >
      {children}
    </button>
  );
}
