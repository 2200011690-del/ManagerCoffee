import { createContext, useContext, useState } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [currentView, setCurrentView] = useState('pos'); // 'pos' | 'tables' | 'dashboard'
  const [notification, setNotification] = useState(null); // { message, type: 'success'|'error'|'info' }
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const setView = (view) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  };

  const clearNotification = () => setNotification(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => clearNotification(), 2500);
  };

  const value = {
    currentView,
    setView,
    notification,
    setNotification,
    showNotification,
    clearNotification,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
