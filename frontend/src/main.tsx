import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App';
import { TranslatorPage } from './pages/TranslatorPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { QAPage } from './pages/QAPage';
import { QAValidationProvider } from './contexts/QAValidationContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QAValidationProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<App />}>
            <Route index element={<TranslatorPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="qa" element={<QAPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QAValidationProvider>
  </StrictMode>,
);
