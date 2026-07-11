import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [currentView, setCurrentView] = useState('pos'); // 'pos' | 'tables' | 'dashboard'
  const [notification, setNotification] = useState(null); // { message, type: 'success'|'error'|'info' }
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const notificationTimer = useRef(null);

  const setView = useCallback((view) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  }, []);

  const clearNotification = useCallback(() => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    notificationTimer.current = null;
    setNotification(null);
  }, []);

  const showNotification = useCallback((message, type = 'success') => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification({ message, type });
    notificationTimer.current = setTimeout(() => {
      notificationTimer.current = null;
      setNotification(null);
    }, 2500);
  }, []);

  const value = useMemo(() => ({
    currentView,
    setView,
    notification,
    setNotification,
    showNotification,
    clearNotification,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  }), [clearNotification, currentView, isMobileMenuOpen, notification, setView, showNotification]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
