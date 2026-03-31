import React, { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Home, Car, Shield, PlusCircle, Wallet } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import Header from './Header';
import { useKeyboard } from '../hooks/useKeyboard';

export default function Layout() {
  const { user } = useFirebase();
  const isKeyboardVisible = useKeyboard();

  return (
    <div className="min-h-[100dvh] bg-black text-white pb-28 font-sans selection:bg-zinc-800 relative flex flex-col w-full max-w-full ">
      <Header />

      <main className="flex-1 p-4 w-full max-w-full ">
        <Outlet />
      </main>

      <nav className={`${isKeyboardVisible ? 'hidden' : 'fixed'} bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-900 px-1 pt-4 pb-safe flex justify-around items-center z-30`}>
        <NavItem to="/" icon={<Home size={24} />} label="Главная" />
        <NavItem to="/garage" icon={<Car size={24} />} label="Гараж" />
        <NavItem to="/order" icon={<PlusCircle size={24} />} label="Заказ" />
        <NavItem to="/finances" icon={<Wallet size={24} />} label="Депозит" />
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
        `flex flex-col items-center gap-1 transition-colors flex-1 min-w-0 ${
          isActive ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'
        }`
      }
    >
      {icon}
      <span className="text-[8px] sm:text-[10px] uppercase tracking-tighter font-bold truncate w-full text-center px-0.5">{label}</span>
    </NavLink>
  );
}
