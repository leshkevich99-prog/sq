import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Home, Car, Shield, PlusCircle } from 'lucide-react';

export default function Layout() {
  return (
    <div className="min-h-screen bg-black text-white pb-20 font-sans selection:bg-zinc-800">
      <main className="p-4">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-900 px-6 py-3 flex justify-between items-center z-50 pb-safe">
        <NavItem to="/" icon={<Home size={24} />} label="Главная" />
        <NavItem to="/garage" icon={<Car size={24} />} label="Гараж" />
        <NavItem to="/order" icon={<PlusCircle size={24} />} label="Заказ" />
        <NavItem to="/tariffs" icon={<Shield size={24} />} label="Тарифы" />
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 transition-colors ${
          isActive ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'
        }`
      }
    >
      {icon}
      <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
    </NavLink>
  );
}
