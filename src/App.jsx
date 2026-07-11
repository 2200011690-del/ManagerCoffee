import { UIProvider, useUI } from './context/UIContext';
import { CartProvider } from './context/CartContext';
import { TableProvider } from './context/TableContext';
import { OrderHistoryProvider } from './context/OrderHistoryContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MenuProvider } from './context/MenuContext';
import { InventoryProvider } from './context/InventoryContext';

import Sidebar from './components/Sidebar';
import LockScreen from './pages/LockScreen';
import { lazy, Suspense, useEffect } from 'react';
import { Menu } from 'lucide-react';

const POSPage = lazy(() => import('./pages/POSPage'));
const TablePage = lazy(() => import('./pages/TablePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MenuManagementPage = lazy(() => import('./pages/MenuManagementPage'));
const EmployeeManagementPage = lazy(() => import('./pages/EmployeeManagementPage'));
const PromotionManagementPage = lazy(() => import('./pages/PromotionManagementPage'));
const StoreSettingsPage = lazy(() => import('./pages/StoreSettingsPage'));
const KitchenPage = lazy(() => import('./pages/KitchenPage'));
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage'));
const GuestOrderPage = lazy(() => import('./pages/GuestOrderPage'));

function getGuestOrderToken() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  return hashParams.get('order') || new URLSearchParams(window.location.search).get('order');
}

function PageFallback() {
  return (
    <div className="h-full flex items-center justify-center bg-cream-light text-coffee-medium text-sm font-semibold">
      Đang tải...
    </div>
  );
}

function AppContent() {
  const { currentView, setView, notification, setIsMobileMenuOpen } = useUI();
  const { currentUser, canAccess } = useAuth();

  useEffect(() => {
    if (window.location.hash === '#kitchen' || window.location.pathname === '/kitchen') {
      setView('kitchen');
    }
  }, [setView]);

  const renderPage = () => {
    switch (currentView) {
      case 'pos': 
        return canAccess('pos') ? <POSPage /> : <div className="p-8">Không có quyền truy cập</div>;
      case 'tables': 
        return canAccess('tables') ? <TablePage /> : <div className="p-8">Không có quyền truy cập</div>;
      case 'dashboard': 
        return canAccess('dashboard') ? <DashboardPage /> : <div className="p-8">Không có quyền truy cập</div>;
      case 'menu':
        return canAccess('menu') ? <MenuManagementPage /> : <div className="p-8">Không có quyền truy cập</div>;
      case 'promotions':
        return canAccess('promotions') ? <PromotionManagementPage /> : <div className="p-8">Không có quyền truy cập</div>;
      case 'employees':
        return canAccess('employees') ? <EmployeeManagementPage /> : <div className="p-8">Không có quyền truy cập</div>;
      case 'settings':
        return canAccess('settings') ? <StoreSettingsPage /> : <div className="p-8">Không có quyền truy cập</div>;
      default: 
        return <POSPage />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {currentView !== 'kitchen' && <Sidebar />}
      <main className="flex-1 overflow-hidden flex flex-col h-full">
        {/* Mobile top bar */}
        {currentView !== 'kitchen' && (
          <div className="lg:hidden flex items-center justify-between bg-sidebar-bg text-white px-4 py-3 border-b border-sidebar-border z-30">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 hover:bg-sidebar-hover rounded-lg text-white"
            >
              <Menu size={20} />
            </button>
            <span className="font-display font-bold text-sm">
              {currentView === 'pos' ? 'Bán hàng' :
               currentView === 'tables' ? 'Sơ đồ bàn' :
               currentView === 'dashboard' ? 'Báo cáo' :
               currentView === 'menu' ? 'Thực đơn' :
               currentView === 'promotions' ? 'Khuyến mãi' :
               currentView === 'employees' ? 'Nhân sự' : 'Cấu hình'}
            </span>
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold text-white">
              {(currentUser?.name ?? '?')[0].toUpperCase()}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-hidden relative">
          <Suspense fallback={<PageFallback />}>
            {currentView === 'kitchen' ? <KitchenPage /> : renderPage()}
          </Suspense>
        </div>
      </main>

      {/* Global Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up pointer-events-none">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-lg shadow-card text-white text-sm font-medium ${
            notification.type === 'success' ? 'bg-green-600' :
            notification.type === 'error' ? 'bg-red-600' : 'bg-coffee-dark'
          }`}>
            {notification.message}
          </div>
        </div>
      )}
    </div>
  );
}

function AuthenticatedApp() {
  return (
    <InventoryProvider>
      <MenuProvider>
        <UIProvider>
          <TableProvider>
            <OrderHistoryProvider>
              <CartProvider>
                <AppContent />
              </CartProvider>
            </OrderHistoryProvider>
          </TableProvider>
        </UIProvider>
      </MenuProvider>
    </InventoryProvider>
  );
}

function AppRoot() {
  const { currentUser } = useAuth();
  const guestOrderToken = getGuestOrderToken();
  if (guestOrderToken) {
    return (
      <Suspense fallback={<PageFallback />}>
        <GuestOrderPage token={guestOrderToken} />
      </Suspense>
    );
  }
  if (!currentUser) return <LockScreen />;
  if (currentUser.role === 'platform_admin') {
    return (
      <Suspense fallback={<PageFallback />}>
        <PlatformAdminPage />
      </Suspense>
    );
  }
  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  );
}
