import { UIProvider, useUI } from './context/UIContext';
import { CartProvider } from './context/CartContext';
import { TableProvider } from './context/TableContext';
import { OrderHistoryProvider } from './context/OrderHistoryContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MenuProvider } from './context/MenuContext';
import { InventoryProvider } from './context/InventoryContext';

import Sidebar from './components/Sidebar';
import POSPage from './pages/POSPage';
import TablePage from './pages/TablePage';
import DashboardPage from './pages/DashboardPage';
import MenuManagementPage from './pages/MenuManagementPage';
import EmployeeManagementPage from './pages/EmployeeManagementPage';
import PromotionManagementPage from './pages/PromotionManagementPage';
import StoreSettingsPage from './pages/StoreSettingsPage';
import LockScreen from './pages/LockScreen';

function AppContent() {
  const { currentView, notification } = useUI();
  const { currentUser, canAccess } = useAuth();

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
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {renderPage()}
      </main>

      {/* Global Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up pointer-events-none">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-coffee-lg text-white text-sm font-medium ${
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
  if (!currentUser) return <LockScreen />;
  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  );
}
