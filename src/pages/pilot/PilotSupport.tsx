import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  HelpCircle, 
  MessageCircle, 
  Phone, 
  ChevronDown, 
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  LifeBuoy
} from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "Как начать смену?",
    answer: "На главном экране нажмите кнопку 'ВЫЙТИ НА СМЕНУ' в правом верхнем углу. После этого вам станут доступны новые поручения в вашем районе."
  },
  {
    question: "Как работает система выплат?",
    answer: "Выплаты производятся по запросу в разделе 'Кошелек'. Срок обработки заявки — до 24 часов. Мы поддерживаем вывод на карты и через СБП."
  },
  {
    question: "Что делать, если клиент не выходит на связь?",
    answer: "Попробуйте позвонить клиенту через кнопку в карточке поручения. Если ответа нет более 10 минут, свяжитесь с диспетчером через кнопку SOS или чат поддержки."
  },
  {
    question: "Как повысить свой рейтинг?",
    answer: "Рейтинг зависит от отзывов клиентов. Будьте вежливы, соблюдайте сроки и делайте качественные фотоотчеты на каждом этапе выполнения поручения."
  }
];

export default function PilotSupport() {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 bg-zinc-900 rounded-full border border-zinc-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold uppercase tracking-wider">Поддержка</h1>
      </div>

      {/* Contact Options */}
      <div className="grid grid-cols-1 gap-4 mb-8">
        <a 
          href="https://t.me/your_admin_bot" 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex items-center justify-between active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
              <MessageCircle size={24} />
            </div>
            <div>
              <div className="text-sm font-bold">Чат с диспетчером</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Telegram Support</div>
            </div>
          </div>
          <ExternalLink size={18} className="text-zinc-700" />
        </a>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Phone size={24} />
            </div>
            <div>
              <div className="text-sm font-bold">Горячая линия</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest">8 (800) 555-35-35</div>
            </div>
          </div>
          <button className="px-4 py-2 bg-zinc-800 rounded-xl text-[10px] font-bold uppercase tracking-widest">Позвонить</button>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2 mb-2">
          <HelpCircle size={16} className="text-amber-500" />
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Частые вопросы</h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div 
              key={index} 
              className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden"
            >
              <button 
                onClick={() => toggleFaq(index)}
                className="w-full p-5 flex items-center justify-between text-left"
              >
                <span className="text-sm font-bold pr-4">{faq.question}</span>
                {openIndex === index ? <ChevronUp size={18} className="text-zinc-500" /> : <ChevronDown size={18} className="text-zinc-500" />}
              </button>
              {openIndex === index && (
                <div className="px-5 pb-5 text-sm text-zinc-400 leading-relaxed animate-in slide-in-from-top-2 duration-200">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Safety Info */}
      <div className="mt-8 p-6 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl">
        <div className="flex items-center gap-3 mb-3">
          <ShieldCheck size={20} className="text-zinc-500" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Ваша безопасность</h3>
        </div>
        <p className="text-[11px] text-zinc-600 leading-relaxed">
          Все поездки застрахованы. В случае возникновения конфликтных ситуаций или ДТП, немедленно активируйте режим SOS и следуйте инструкциям диспетчера.
        </p>
      </div>
    </div>
  );
}
