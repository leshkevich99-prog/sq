import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { FirebaseProvider, useFirebase } from './components/FirebaseProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from 'react-hot-toast';

// Client Pages
import Layout from './components/Layout';
import Home from './pages/Home';
import Tariffs from './pages/Tariffs';
import Garage from './pages/Garage';
import Order from './pages/Order';
import TaskDetails from './pages/TaskDetails';
import Finances from './pages/client/Finances';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Login from './pages/Login';
import Chat from './pages/Chat';
import TestDrive from './pages/TestDrive';

// Admin Pages
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminCRM from './pages/admin/AdminCRM';
import AdminModeration from './pages/admin/AdminModeration';
import AdminPilots from './pages/admin/AdminPilots';
import AdminTransactions from './pages/admin/AdminTransactions';
import AdminSettings from './pages/admin/AdminSettings';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminNotifications from './pages/admin/AdminNotifications';

// Pilot Pages
import PilotLayout from './pages/pilot/PilotLayout';
import PilotDashboard from './pages/pilot/PilotDashboard';
import PilotHistory from './pages/pilot/PilotHistory';
import SOS from './pages/pilot/SOS';

import { Terminal } from 'lucide-react';
import DebugSwitcher from './components/DebugSwitcher';
import NotificationManager from './components/NotificationManager';

function AppRoutes() {
  const { user, loading } = useFirebase();
  const navigate = useNavigate();
  const [showDebug, setShowDebug] = React.useState(false);

  // Handle Telegram Deep Linking (start_param)
  useEffect(() => {
    if (!loading && user) {
      const startParam = WebApp.initDataUnsafe?.start_param;
      if (startParam) {
        if (startParam.startsWith('task_chat_')) {
          const taskId = startParam.replace('task_chat_', '');
          navigate(`/task/${taskId}/chat`);
        } else if (startParam.startsWith('task_')) {
          const taskId = startParam.replace('task_', '');
          navigate(`/task/${taskId}`);
        }
      }
    }
  }, [loading, user, navigate]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-black text-white">Загрузка...</div>;
  }

  if (!user) {
    return <Login />;
  }

  const role = user.role || 'client';

  return (
    <div className="w-full h-full relative">
      <NotificationManager />
      <Routes>
        {role === 'client' && (
          <>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="tariffs" element={<Tariffs />} />
              <Route path="garage" element={<Garage />} />
              <Route path="order" element={<Order />} />
              <Route path="test-drive" element={<TestDrive />} />
              <Route path="task/:id" element={<TaskDetails />} />
              <Route path="finances" element={<Finances />} />
              <Route path="profile" element={<Profile />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
            <Route path="/task/:id/chat" element={<Chat />} />
          </>
        )}

        {role === 'admin' && (
          <>
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="crm" element={<AdminCRM />} />
              <Route path="moderation" element={<AdminModeration />} />
              <Route path="pilots" element={<AdminPilots />} />
              <Route path="transactions" element={<AdminTransactions />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="task/:id" element={<TaskDetails />} />
              <Route path="profile" element={<Profile />} />
              <Route path="notifications" element={<AdminNotifications />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
            <Route path="/task/:id/chat" element={<Chat />} />
          </>
        )}

        {role === 'pilot' && (
          <>
            <Route path="/" element={<PilotLayout />}>
              <Route index element={<PilotDashboard />} />
              <Route path="task/:id" element={<TaskDetails />} />
              <Route path="history" element={<PilotHistory />} />
              <Route path="profile" element={<Profile />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="sos" element={<SOS />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
            <Route path="/task/:id/chat" element={<Chat />} />
          </>
        )}
      </Routes>

      {/* Floating QA Button */}
      <button 
        onClick={() => setShowDebug(true)}
        className="fixed bottom-24 right-4 z-[9999] bg-accent text-black font-bold p-3 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all flex items-center gap-2 border-2 border-black"
      >
        <Terminal size={18} />
        <span className="text-[10px] uppercase font-black tracking-tighter pr-1">QA</span>
      </button>

      {showDebug && <DebugSwitcher onClose={() => setShowDebug(false)} />}
    </div>
  );
}

export default function App() {
  const [isReady, setIsReady] = React.useState(false);

  useEffect(() => {
    try {
      // UI settings only (ready/expand moved to main.tsx for faster auth)
      const bgColor = '#000000';
      WebApp.setHeaderColor(bgColor);
      WebApp.setBackgroundColor(bgColor);
      
      if (WebApp.disableVerticalSwipes) {
        WebApp.disableVerticalSwipes();
      }
      
      const timer = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timer);
    } catch (e) {
      console.error("App UI Init error:", e);
      setIsReady(true);
    }
  }, []);

  if (!isReady) {
    return <div className="flex items-center justify-center min-h-screen bg-black text-white/50 animate-pulse uppercase tracking-widest text-xs">Squadra CRM...</div>;
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <FirebaseProvider>
          <AppRoutes />
          <Toaster 
            position="top-center"
            toastOptions={{
              style: {
                background: '#18181b',
                color: '#fff',
                border: '1px solid #27272a',
              },
              success: {
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#fff',
                },
              },
            }}
          />
        </FirebaseProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
