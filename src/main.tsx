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

// 2. Bulletproof Fetch Patch
const { fetch: originalFetch } = window;
window.fetch = async (...args) => {
  let [resource, config] = args;
  
  // Normalize URL
  const url = typeof resource === 'string' ? resource : (resource instanceof Request ? resource.url : String(resource));

  if (url.includes('/api/')) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      if (resource instanceof Request) {
        // If it's a Request object, we must clone it and add headers
        const headers = new Headers(resource.headers);
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        resource = new Request(resource, { headers });
      } else {
        // If it's a string, update config
        config = config || {};
        const headers = new Headers(config.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        config.headers = headers;
      }
    }
  }
  
  return originalFetch(resource, config);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
