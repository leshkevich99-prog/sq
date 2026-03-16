import { Check } from 'lucide-react';

export default function Tariffs() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6 mt-2">
        <h1 className="text-2xl font-bold tracking-tighter uppercase">Уровни сопровождения</h1>
        <p className="text-zinc-400 text-sm mt-1">Выберите подходящий объем обслуживания</p>
      </header>

      <div className="space-y-4">
        <TariffCard 
          name="TELEMETRY"
          features={[
            "Бортовой журнал автомобиля",
            "1 логистическое поручение",
            "2 комплексные трехфазные мойки",
            "Сезонное хранение 1 комплекта шин"
          ]}
        />
        <TariffCard 
          name="PIT STOP"
          isActive
          features={[
            "Бортовой журнал автомобиля",
            "2 логистических поручения",
            "4 комплексные трехфазные мойки",
            "Сезонное хранение 1 комплекта шин"
          ]}
        />
        <TariffCard 
          name="SQUADRA FAMILY"
          features={[
            "Бортовой журнал для двух авто",
            "4 логистических поручения",
            "8 комплексных трехфазных моек",
            "Сезонное хранение 2 комплектов шин"
          ]}
        />
      </div>
    </div>
  );
}

function TariffCard({ name, features, isActive }: { name: string; features: string[]; isActive?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 border ${isActive ? 'bg-zinc-900 border-zinc-700' : 'bg-black border-zinc-800'}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold tracking-tight">{name}</h2>
        {isActive && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 bg-white text-black font-bold rounded">
            Текущий
          </span>
        )}
      </div>
      <ul className="space-y-3 mb-6">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
            <Check size={16} className="text-zinc-500 shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button className={`w-full py-3 rounded-xl text-sm font-medium uppercase tracking-wider transition-colors ${
        isActive 
          ? 'bg-zinc-800 text-zinc-400 cursor-default' 
          : 'bg-white text-black hover:bg-zinc-200 active:scale-[0.98]'
      }`}>
        {isActive ? 'Активен' : 'Выбрать тариф'}
      </button>
    </div>
  );
}
