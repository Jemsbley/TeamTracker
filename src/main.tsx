import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import { useAuth } from './authStore';
import './index.css';

// The favicon is now a plain <link> to /favicon.png in index.html rather than
// a JS-injected bundled asset, so the tab icon (and any crawler looking for
// one) resolves without running the app.

// Drop the old zustand-persist key from before the backend existed. The app
// now sources everything from the server; leaving the orphaned key around
// would just be confusing if a user inspects localStorage.
localStorage.removeItem('team-tracker-state-v1');

// Kick off auth bootstrap: validates any stored token by hitting /me before
// the rest of the UI tries to use it.
useAuth.getState().init();

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

// index.html ships a static, no-JavaScript copy of the landing page inside
// #root so the site has readable content before (or without) this bundle.
// Clear it before mounting so it never renders alongside the app.
const rootEl = document.getElementById('root')!;
rootEl.innerHTML = '';

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <BrowserRouter>
        <NuqsAdapter>
          <App />
        </NuqsAdapter>
      </BrowserRouter>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
