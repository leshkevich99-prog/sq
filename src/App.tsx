import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import { FirebaseProvider, useFirebase } from './components/FirebaseProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import DevTools from './components/DevTools';
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

function AppRoutes() {
  const { user, loading } = useFirebase();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-black text-white">Загрузка...</div>;
  }

  if (!user) {
    return <Login />;
  }

  const role = user.role || 'client';

  return (
    <div className="pt-10">
      <Routes>
        {role === 'client' && (
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="tariffs" element={<Tariffs />} />
            <Route path="garage" element={<Garage />} />
            <Route path="order" element={<Order />} />
            <Route path="test-drive" element={<TestDrive />} />
            <Route path="task/:id" element={<TaskDetails />} />
            <Route path="task/:id/chat" element={<Chat />} />
            <Route path="finances" element={<Finances />} />
            <Route path="profile" element={<Profile />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}

        {role === 'admin' && (
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="crm" element={<AdminCRM />} />
            <Route path="moderation" element={<AdminModeration />} />
            <Route path="pilots" element={<AdminPilots />} />
            <Route path="transactions" element={<AdminTransactions />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="task/:id" element={<TaskDetails />} />
            <Route path="task/:id/chat" element={<Chat />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}

        {role === 'pilot' && (
          <Route path="/" element={<PilotLayout />}>
            <Route index element={<PilotDashboard />} />
            <Route path="task/:id" element={<TaskDetails />} />
            <Route path="task/:id/chat" element={<Chat />} />
            <Route path="history" element={<PilotHistory />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="sos" element={<SOS />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    if (WebApp.disableVerticalSwipes) {
      WebApp.disableVerticalSwipes();
    }
    WebApp.setHeaderColor('#000000');
    WebApp.setBackgroundColor('#000000');
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <FirebaseProvider>
          <AppRoutes />
          <DevTools />
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
