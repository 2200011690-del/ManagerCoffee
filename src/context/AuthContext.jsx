import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';
import { joinStore } from '../socket';

const AuthContext = createContext(null);
const AUTH_KEY = 'manager_coffee_auth_session';

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem(AUTH_KEY);
      const user = saved ? JSON.parse(saved) : null;
      if (user && !user.storeId) {
        // Old session without storeId, force logout
        sessionStorage.removeItem(AUTH_KEY);
        return null;
      }
      if (user && user.storeId) {
        joinStore(user.storeId);
      }
      return user;
    } catch { return null; }
  });
  const [pinError, setPinError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const login = async (storeCode, pin) => {
    setIsLoading(true);
    try {
      const user = await api.post('/auth/login', { storeCode, pin });
      user.allowedViews = user.role === 'admin' 
        ? ['pos', 'tables', 'dashboard', 'menu', 'employees', 'settings'] 
        : (user.canViewReports ? ['pos', 'tables', 'dashboard'] : ['pos', 'tables']);
        
      setCurrentUser(user);
      setPinError('');
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
      
      if (user.storeId) {
        joinStore(user.storeId);
      }
      
      return true;
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Mã cửa hàng hoặc mã PIN không đúng. Vui lòng thử lại.';
      setPinError(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setPinError('');
    sessionStorage.removeItem(AUTH_KEY);
    // In a real app we might want to emit a leaveStore event, but a full reload is also fine.
    window.location.reload();
  };

  const isAdmin = currentUser?.role === 'admin';
  const canAccess = (viewId) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    if (viewId === 'dashboard') return !!currentUser.canViewReports;
    return currentUser.allowedViews?.includes(viewId);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      login,
      logout,
      isAdmin,
      canAccess,
      pinError,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
