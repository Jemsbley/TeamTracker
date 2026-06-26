import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import App from './App';
import nutLogo from './assets/icons/nut.png';
import { useAuth } from './authStore';
import './index.css';

// Set the browser tab favicon to the nut logo (works in dev and prod
// builds because Vite resolves the import to the bundled asset URL).
{
  const existing = document.querySelectorAll('link[rel~="icon"]');
  existing.forEach((el) => el.remove());
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = nutLogo;
  document.head.appendChild(link);
}

// Drop the old zustand-persist key from before the backend existed. The app
// now sources everything from the server; leaving the orphaned key around
// would just be confusing if a user inspects localStorage.
localStorage.removeItem('team-tracker-state-v1');

// Kick off auth bootstrap: validates any stored token by hitting /me before
// the rest of the UI tries to use it.
useAuth.getState().init();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <NuqsAdapter>
        <App />
      </NuqsAdapter>
    </BrowserRouter>
  </React.StrictMode>
);
