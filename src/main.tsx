import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

// Error overlay for debugging on devices
if (typeof window !== 'undefined') {
  window.onerror = function(msg, url, line, col, error) {
    const errorMsg = `🔥 JS Error: ${msg}\nLine: ${line}\nUrl: ${url}`;
    console.error(errorMsg);
    // document.body.insertAdjacentHTML('afterbegin', `<div style="background:red;color:white;padding:20px;position:fixed;z-index:999999">${errorMsg}</div>`);
    // alert(errorMsg); // Temporary for debugging heavy crashes on phones
    return false;
  };
  window.onunhandledrejection = function(event) {
    const errorMsg = `🔥 Promise Rejection: ${event.reason}`;
    console.error(errorMsg);
    // document.body.insertAdjacentHTML('afterbegin', `<div style="background:red;color:white;padding:20px;position:fixed;z-index:999999">${errorMsg}</div>`);
    return false;
  };
}
import App from './App.tsx';
import './index.css';

// Patch fetch to include Authorization header for API requests
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  
  if (typeof resource === 'string' && resource.startsWith('/api/')) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config = config || {};
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${token}`
      };
    }
  }
  
  return originalFetch(resource, config);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
