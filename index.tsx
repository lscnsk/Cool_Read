import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/literata/400.css';
import '@fontsource/literata/700.css';
import '@fontsource/dancing-script/700.css';
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/uncial-antiqua/400.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import App from './App';
import './index.css';

// Register Service Worker for Offline support
if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // In development, unregister any active service worker to prevent stale caching issues
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().then(() => {
          console.log('Active Service Worker unregistered in development mode');
        });
      }
    });
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((registration) => {
          console.log('SW registered: ', registration);
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);