import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  CheckSquare, 
  Wallet, 
  Settings,
  LogOut,
  Bell,
  History,
  Menu,
  X,
  BarChart3
} from 'lucide-react';
import { useFirebase } from '../../components/FirebaseProvider';
import DebugSwitcher from '../../components/DebugSwitcher';
import { useKeyboard } from '../../hooks/useKeyboard';

export default function AdminLayout() {
  const { user, logout } = useFirebase();
  const navigate = useNavigate();
  const isKeyboardVisible = useKeyboard();
  const [tapCount, setTapCount] = useState(0);
  const [showDebug, setShowDebug] = useState(false);

  const handleSecretTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);
    if (newCount === 5) {
      setShowDebug(true);
      setTapCount(0);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-[100dvh] bg-black text-white font-sans flex flex-col md:flex-row relative w-full max-w-full ">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-zinc-950 border-r border-zinc-900 flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-zinc-900 cursor-pointer select-none" onClick={handleSecretTap}>
          <div className="text-2xl font-serif font-bold tracking-tighter uppercase">Admin Panel</div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Control Center</div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <SidebarItem to="/" icon={<LayoutDashboard size={20} />} label="Дашборд" />
          <SidebarItem to="/analytics" icon={<BarChart3 size={20} />} label="Аналитика" />
          <SidebarItem to="/crm" icon={<Users size={20} />} label="Пользователи" />
          <SidebarItem to="/pilots" icon={<Users size={20} className="text-blue-500" />} label="Пилоты" />
          <SidebarItem to="/transactions" icon={<History size={20} />} label="Транзакции" />
          <SidebarItem to="/moderation" icon={<CheckSquare size={20} />} label="Модерация" />
          <SidebarItem to="/settings" icon={<Settings size={20} />} label="Настройки" />
          <SidebarItem to="/notifications" icon={<Bell size={20} />} label="Уведомления" />
        </nav>

        <div className="p-4 border-t border-zinc-900 space-y-2">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold">
              {user?.firstName?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">{user?.firstName}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest">Administrator</div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all"
          >
            <LogOut size={20} />
            <span className="text-sm font-bold uppercase tracking-wider">Выйти</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-[100dvh] relative pb-28 md:pb-0 w-full max-w-full ">
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full ">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav */}
        <nav className={`md:hidden ${isKeyboardVisible ? 'hidden' : 'fixed'} bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-900 px-1 pt-4 pb-safe flex justify-around items-center z-50`}>
          <NavItem to="/" icon={<LayoutDashboard size={24} />} label="Главная" />
          <NavItem to="/crm" icon={<Users size={24} />} label="CRM" />
          <NavItem to="/moderation" icon={<CheckSquare size={24} />} label="Доки" />
        </nav>
      </div>

      {showDebug && <DebugSwitcher onClose={() => setShowDebug(false)} />}
    </div>
  );
}

function SidebarItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink 
      to={to} 
      className={({ isActive }) => `
        flex items-center gap-3 px-4 py-3 rounded-xl transition-all
        ${isActive ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}
      `}
    >
      {icon}
      <span className="text-sm font-bold uppercase tracking-wider">{label}</span>
    </NavLink>
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
