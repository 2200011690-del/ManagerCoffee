import { createContext, useContext, useState } from 'react';
import { api } from '../api';
import { joinStore, leaveStore } from '../socket';

const AuthContext = createContext(null);
const AUTH_KEY = 'manager_coffee_auth_session';
const ADMIN_VIEWS = ['pos', 'tables', 'kitchen', 'dashboard', 'menu', 'promotions', 'employees', 'settings'];
const STAFF_BASE_VIEWS = ['pos', 'tables', 'kitchen'];

function getAllowedViews(user) {
  if (!user) return [];
  if (user.role === 'admin') return ADMIN_VIEWS;

  const allowedViews = [...STAFF_BASE_VIEWS];
  if (user.canViewReports) {
    allowedViews.push('dashboard');
  }
  return allowedViews;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem(AUTH_KEY);
      const user = saved ? JSON.parse(saved) : null;
      if (user?.role === 'platform_admin') {
        return user;
      }
      if (user && !user.storeId) {
        // Old session without storeId, force logout
        sessionStorage.removeItem(AUTH_KEY);
        return null;
      }
      if (user && user.storeId) {
        joinStore(user.storeId, user.token);
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
      user.allowedViews = getAllowedViews(user);
        
      setCurrentUser(user);
      setPinError('');
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
      
      if (user.storeId) {
        joinStore(user.storeId, user.token);
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

  const loginAdmin = async (storeCode, email, password) => {
    setIsLoading(true);
    try {
      const user = await api.post('/auth/login-admin', { storeCode, email, password });
      user.allowedViews = getAllowedViews(user);
        
      setCurrentUser(user);
      setPinError('');
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
      
      if (user.storeId) {
        joinStore(user.storeId, user.token);
      }
      
      return true;
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Email hoặc mật khẩu không chính xác. Vui lòng thử lại.';
      setPinError(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const loginPlatform = async (email, password) => {
    setIsLoading(true);
    try {
      const user = await api.post('/platform/auth/login', { email, password });
      setCurrentUser(user);
      setPinError('');
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
      return true;
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Email hoặc mật khẩu quản trị nền tảng không chính xác.';
      setPinError(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const switchBranch = async (branchId) => {
    setIsLoading(true);
    try {
      const user = await api.post(`/branches/${branchId}/switch`);
      user.allowedViews = getAllowedViews(user);
      leaveStore();
      setCurrentUser(user);
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
      joinStore(user.storeId, user.token);
      return true;
    } catch (err) {
      setPinError(err.response?.data?.error || 'Không thể chuyển chi nhánh.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setPinError('');
    sessionStorage.removeItem(AUTH_KEY);
    leaveStore();
    window.location.reload();
  };

  const isAdmin = currentUser?.role === 'admin';
  const canAccess = (viewId) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return currentUser.allowedViews?.includes(viewId);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      login,
      loginAdmin,
      loginPlatform,
      switchBranch,
      logout,
      isAdmin,
      canAccess,
      pinError,
      setPinError,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
