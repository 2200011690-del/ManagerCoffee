import { useState, useEffect } from 'react';
import { Coffee, LayoutGrid, BarChart3, ChefHat, Wifi, WifiOff, LogOut, Shield, Users, ShoppingBag, Clock, Settings, Gift } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import QuickAttendanceModal from './pos/QuickAttendanceModal';

const ALL_NAV_ITEMS = [
  { id: 'pos',       label: 'Bán hàng',   icon: ShoppingBag, subtitle: 'Quầy POS',      roles: ['admin', 'staff'] },
  { id: 'tables',    label: 'Sơ đồ bàn',  icon: LayoutGrid,  subtitle: 'Khu vực bàn',   roles: ['admin', 'staff'] },
  { id: 'kitchen',   label: 'Nhà bếp',    icon: ChefHat,     subtitle: 'Bếp/Pha chế',   roles: ['admin', 'staff'] },
  { id: 'dashboard', label: 'Báo cáo',    icon: BarChart3,   subtitle: 'Doanh thu',     roles: ['admin'] },
  { id: 'menu',      label: 'Thực đơn',   icon: ChefHat,     subtitle: 'Món & giá',     roles: ['admin'] },
  { id: 'promotions', label: 'Khuyến mãi', icon: Gift,        subtitle: 'Ưu đãi',        roles: ['admin'] },
  { id: 'employees', label: 'Nhân sự',    icon: Users,       subtitle: 'Ca làm',        roles: ['admin'] },
  { id: 'settings',  label: 'Cấu hình',   icon: Settings,    subtitle: 'Cửa hàng',      roles: ['admin'] },
];

export default function Sidebar() {
  const { currentView, setView, isMobileMenuOpen, setIsMobileMenuOpen } = useUI();
  const { cartCount } = useCart();
  const { currentUser, logout, isAdmin, canAccess } = useAuth();
  const { lowStockItems } = useInventory();

  const [now, setNow] = useState(new Date());
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const roleLabel = currentUser?.role === 'admin'
    ? 'Quản trị viên'
    : currentUser?.role === 'staff'
      ? 'Nhân viên'
      : currentUser?.role ?? '';

  const navItems = ALL_NAV_ITEMS.filter((item) =>
    currentUser && item.roles.includes(currentUser.role) && canAccess(item.id)
  );

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity"
        />
      )}

      <aside className={`flex flex-col h-screen w-52 flex-shrink-0 bg-sidebar-bg border-r border-sidebar-border fixed lg:static top-0 left-0 z-50 transition-transform duration-300 transform ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>

      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary-600">
            <Coffee size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Manager Coffee</p>
            <p className="text-sidebar-text text-xs">Quản lý bán hàng</p>
          </div>
        </div>
        {isAdmin && (
          <div className="mt-3 inline-flex items-center gap-1 px-2 py-0.5 bg-primary-600/20 border border-primary-500/30 rounded-md">
            <Shield size={10} className="text-primary-400" />
            <span className="text-primary-400 text-[10px] font-bold tracking-wide">QUẢN TRỊ</span>
          </div>
        )}
      </div>

      {/* Live Clock */}
      <div className="mx-3 mt-3 px-3 py-2.5 rounded-lg bg-sidebar-hover border border-sidebar-border">
        <p className="text-sidebar-text text-[10px] mb-0.5">{dateStr}</p>
        <div className="flex items-center justify-between">
          <p className="text-white font-mono text-base font-bold tracking-wider">{timeStr}</p>
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400 animate-pulse-soft' : 'bg-orange-500 animate-pulse'}`} />
            {isOnline ? (
              <Wifi size={11} className="text-sidebar-text" />
            ) : (
              <WifiOff size={11} className="text-orange-500" />
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <p className="text-sidebar-text/40 text-[10px] font-bold tracking-widest px-3 mb-2 uppercase">Điều hướng</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const showBadge = item.id === 'pos' && cartCount > 0;
          const showWarning = item.id === 'dashboard' && lowStockItems.length > 0;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}
            >
              <Icon size={16} className={isActive ? 'text-white' : 'text-sidebar-text'} />
              <span className="flex-1 text-sm">{item.label}</span>
              {showBadge && (
                <span className="w-5 h-5 rounded-full bg-accent-orange flex items-center justify-center text-white text-[10px] font-bold">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
              {showWarning && (
                <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-bold">
                  {lowStockItems.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom: User + Logout */}
      <div className="px-3 pb-4 border-t border-sidebar-border pt-3 space-y-1">
        <div className="px-3 py-2.5 rounded-lg bg-sidebar-hover border border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {(currentUser?.name ?? '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{currentUser?.name ?? 'Chưa đăng nhập'}</p>
              <p className="text-sidebar-text text-[10px] truncate">{roleLabel}</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowAttendanceModal(true)}
          className="w-full min-h-[40px] flex items-center gap-2.5 px-3 py-2 rounded-lg text-sidebar-text hover:text-primary-400 hover:bg-primary-600/10 transition-all duration-150 group"
        >
          <Clock size={15} className="group-hover:text-primary-400" />
          <span className="text-sm">Điểm danh nhanh</span>
        </button>
        <button
          onClick={logout}
          className="w-full min-h-[40px] flex items-center gap-2.5 px-3 py-2 rounded-lg text-sidebar-text hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 group"
        >
          <LogOut size={15} className="group-hover:text-red-400" />
          <span className="text-sm">Đăng xuất</span>
        </button>
      </div>
      {showAttendanceModal && (
        <QuickAttendanceModal onClose={() => setShowAttendanceModal(false)} />
      )}
      </aside>
    </>
  );
}
