import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';
import Layout from './components/Layout';
import Home from './pages/Home';
import Tariffs from './pages/Tariffs';
import Garage from './pages/Garage';
import Order from './pages/Order';

export default function App() {
  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    WebApp.setHeaderColor('#000000');
    WebApp.setBackgroundColor('#000000');
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="tariffs" element={<Tariffs />} />
          <Route path="garage" element={<Garage />} />
          <Route path="order" element={<Order />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
