import React, { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Home, Car, Shield, PlusCircle, Wallet } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import Header from './Header';

export default function Layout() {
  const { user } = useFirebase();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const handleViewportChange = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;
      
      // If the viewport height is significantly smaller than the window height, 
      // it's likely the keyboard is visible.
      const isKeyboardOpen = viewport.height < window.innerHeight * 0.85;
      setIsKeyboardVisible(isKeyboardOpen);
    };

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setIsKeyboardVisible(true);
      }
    };

    const handleBlur = () => {
      // Small delay to check if focus moved to another input
      setTimeout(() => {
        if (document.activeElement?.tagName !== 'INPUT' && 
            document.activeElement?.tagName !== 'TEXTAREA') {
          setIsKeyboardVisible(false);
        }
      }, 100);
    };

    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.addEventListener('focusin', handleFocus);
    window.addEventListener('focusout', handleBlur);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('focusin', handleFocus);
      window.removeEventListener('focusout', handleBlur);
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black text-white pb-28 font-sans selection:bg-zinc-800 relative flex flex-col w-full max-w-full overflow-x-hidden">
      <Header />

      <main className="flex-1 p-4 w-full max-w-full overflow-x-hidden">
        <Outlet />
      </main>

      <nav className={`${isKeyboardVisible ? 'hidden' : 'fixed'} bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-900 px-1 pt-4 pb-safe flex justify-around items-center z-50`}>
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
