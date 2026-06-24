import { useState, useEffect } from 'react';
import { Coffee, LayoutGrid, BarChart3, ChefHat, ChevronRight, Wifi, LogOut, Shield, Users } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';

const ALL_NAV_ITEMS = [
  { id: 'pos',       label: 'Bán hàng',     icon: Coffee,     subtitle: 'POS System',   roles: ['admin', 'staff'] },
  { id: 'tables',    label: 'Sơ đồ bàn',    icon: LayoutGrid, subtitle: 'Table Map',    roles: ['admin', 'staff'] },
  { id: 'dashboard', label: 'Báo cáo',      icon: BarChart3,  subtitle: 'Analytics',    roles: ['admin'] },
  { id: 'menu',      label: 'Quản lý Menu', icon: ChefHat,    subtitle: 'Menu & CRUD',  roles: ['admin'] },
  { id: 'employees', label: 'Nhân sự',      icon: Users,      subtitle: 'Employee',     roles: ['admin'] },
];

export default function Sidebar() {
  const { currentView, setView } = useUI();
  const { cartCount } = useCart();
  const { currentUser, logout, isAdmin } = useAuth();
  const { lowStockItems } = useInventory();

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });

  // Filter nav items based on current user's role
  const navItems = ALL_NAV_ITEMS.filter(item =>
    currentUser && item.roles.includes(currentUser.role)
  );

  const handleLogout = () => {
    logout();
  };

  return (
    <aside className="flex flex-col h-screen w-64 flex-shrink-0"
      style={{ background: 'linear-gradient(180deg, #2C1B14 0%, #1A0F0A 100%)' }}>

      {/* Logo Header */}
      <div className="px-6 pt-7 pb-5 border-b border-white/10">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}>
            <Coffee size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-display text-white font-bold text-lg leading-tight">Manager</h1>
            <p className="text-white/40 text-xs font-medium tracking-wider">COFFEE POS</p>
          </div>
        </div>
        {/* Role badge */}
        {isAdmin && (
          <div className="flex items-center gap-1.5 mt-3 px-2 py-1 rounded-lg w-fit"
            style={{ background: 'rgba(167,109,66,0.25)', border: '1px solid rgba(167,109,66,0.3)' }}>
            <Shield size={11} className="text-coffee-gold" />
            <span className="text-coffee-gold text-[11px] font-bold tracking-wide">ADMIN</span>
          </div>
        )}
      </div>

      {/* Live Clock */}
      <div className="mx-4 mt-4 mb-2 px-4 py-3 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/40 text-xs mb-0.5">{dateStr}</p>
            <p className="text-white font-mono text-lg font-bold tracking-wider">{timeStr}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-soft" />
            <Wifi size={13} className="text-white/40" />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        <p className="text-white/25 text-xs font-semibold tracking-widest px-4 mb-3 uppercase">Menu chính</p>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const showBadge = item.id === 'pos' && cartCount > 0;
          const showWarning = item.id === 'dashboard' && lowStockItems.length > 0;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full nav-item group ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 ${isActive ? 'bg-coffee-accent/30' : 'bg-white/5 group-hover:bg-white/10'}`}>
                <Icon size={18} className={isActive ? 'text-coffee-gold' : 'text-white/50 group-hover:text-white/70'} />
              </div>
              <div className="flex-1 text-left">
                <p className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white/85'}`}>{item.label}</p>
                <p className={`text-xs ${isActive ? 'text-white/50' : 'text-white/30'}`}>{item.subtitle}</p>
              </div>
              {showBadge && (
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}>
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
              {showWarning && (
                <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-bold">
                  {lowStockItems.length}
                </span>
              )}
              {isActive && <ChevronRight size={14} className="text-white/40" />}
            </button>
          );
        })}
      </nav>

      {/* Bottom: Staff Info + Logout */}
      <div className="px-4 pb-6 border-t border-white/10 pt-4 space-y-2">
        {/* Staff card */}
        <div className="px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}>
              {currentUser?.initial ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/80 text-xs font-semibold truncate">{currentUser?.name ?? 'Chưa đăng nhập'}</p>
              <p className="text-white/35 text-xs truncate">{currentUser?.roleLabel ?? ''}</p>
            </div>
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="w-full min-h-[44px] flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 group"
        >
          <div className="w-9 h-9 rounded-xl bg-white/5 group-hover:bg-red-500/20 flex items-center justify-center transition-all">
            <LogOut size={17} className="text-red-400/60 group-hover:text-red-400" />
          </div>
          <span className="text-sm font-semibold">Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}
