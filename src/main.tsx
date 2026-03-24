import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

// Error overlay for debugging on devices
if (typeof window !== 'undefined') {
  window.onerror = function(msg, url, line, col, error) {
    const errorMsg = `🔥 JS Error: ${msg}\nLine: ${line}\nUrl: ${url}`;
    console.error(errorMsg);
    if (document.body) {
      document.body.insertAdjacentHTML('afterbegin', `<div style="background:red;color:white;padding:20px;position:fixed;top:0;left:0;right:0;z-index:999999;font-size:12px;word-break:break-all">${errorMsg}</div>`);
    }
    return false;
  };
  window.onunhandledrejection = function(event) {
    const errorMsg = `🔥 Promise Rejection: ${event.reason}`;
    console.error(errorMsg);
    if (document.body) {
      document.body.insertAdjacentHTML('afterbegin', `<div style="background:red;color:white;padding:20px;position:fixed;top:0;left:0;right:0;z-index:999999;font-size:12px;word-break:break-all">${errorMsg}</div>`);
    }
    return false;
  };
}

import App from './App.tsx';
import './index.css';

// Patch fetch to include Authorization header safely
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const resource = args[0];
  let config = args[1] || {};
  
  if (typeof resource === 'string' && resource.startsWith('/api/')) {
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
