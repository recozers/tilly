import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { AuthProvider } from './contexts/AuthContext.js';
import App from './App.js';
import './styles/App.css';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <ConvexAuthProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ConvexAuthProvider>
    </ConvexProvider>
  </React.StrictMode>
);
