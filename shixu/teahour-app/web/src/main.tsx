import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { StaffAuthProvider } from './lib/auth';
import { ConfirmProvider, ToastProvider } from './components/ui';
import './styles.css';
import './v7.css';
import './app-parity.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <StaffAuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </StaffAuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
