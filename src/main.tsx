import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import WebApp from '@twa-dev/sdk';

// 1. IMMEDIATE Telegram Initialization
try {
  WebApp.ready();
  WebApp.expand();
} catch (e) {
  console.error("Telegram SDK Early Init Error", e);
}

// Error overlay for debugging
if (typeof window !== 'undefined') {
  window.onerror = function(msg, url, line, col, error) {
    const errorMsg = `🔥 JS Error: ${msg}\nLine: ${line}`;
    console.error(errorMsg);
    if (document.body) {
      document.body.insertAdjacentHTML('afterbegin', `<div style="background:red;color:white;padding:10px;position:fixed;top:0;left:0;right:0;z-index:999999;font-size:10px">${errorMsg}</div>`);
    }
    return false;
  };
}

import App from './App.tsx';
import './index.css';

// 2. Safe Fetch Patch
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const resource = args[0];
  let config = args[1] || {};
  
  // Normalize resource to string to check for /api/
  const url = typeof resource === 'string' ? resource : (resource instanceof Request ? resource.url : String(resource));

  if (url.includes('/api/')) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      const headers = new Headers(config.headers || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      config.headers = headers;
    }
  }
  
  return originalFetch.apply(this, [resource, config]);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
