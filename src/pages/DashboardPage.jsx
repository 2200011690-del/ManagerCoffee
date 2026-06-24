import { useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Minus as MinusIcon, ShoppingBag, Users, DollarSign,
  Target, Clock, Award, ChevronRight, FileText, Search, Download, Trash2,
  CheckCircle, Banknote, CreditCard, X, AlertTriangle, Package, RefreshCw
} from 'lucide-react';
import { dashboardData } from '../data/coffeeData';
import { useOrderHistory } from '../context/OrderHistoryContext';
import { useInventory } from '../context/InventoryContext';

// ---- Mini Bar Chart ----
function MiniBarChart({ data }) {
  const maxRevenue = Math.max(...data.map(d => d.revenue));
  const todayIndex = data.length - 1;
  return (
    <div className="flex items-end gap-1.5 h-24">
      {data.map((d, i) => {
        const height = (d.revenue / maxRevenue) * 100;
        const isToday = i === todayIndex;
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col items-center justify-end" style={{ height: '80px' }}>
              <div
                className={`w-full rounded-t-lg transition-all duration-500 ${isToday ? '' : 'opacity-50'}`}
                style={{
                  height: `${height}%`,
                  background: isToday
                    ? 'linear-gradient(135deg, #A76D42, #C8956C)'
                    : 'linear-gradient(135deg, #D4C4AE, #EDE3D4)',
                }}
              />
            </div>
            <span className={`text-xs font-medium ${isToday ? 'text-coffee-accent font-bold' : 'text-coffee-light'}`}>{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Stat Card ----
function StatCard({ icon: Icon, label, value, sub, color, trend }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
            trend > 0 ? 'bg-green-50 text-green-600' : trend < 0 ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-500'
          }`}>
            {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <MinusIcon size={12} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-coffee-light text-sm font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-coffee-dark">{value}</p>
      {sub && <p className="text-coffee-light text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ---- Top Item Row ----
function TopItemRow({ item, rank }) {
  const trendColor = item.trend === 'up' ? 'text-green-500' : item.trend === 'down' ? 'text-red-400' : 'text-gray-400';
  const TrendIcon = item.trend === 'up' ? TrendingUp : item.trend === 'down' ? TrendingDown : MinusIcon;
  return (
    <div className="flex items-center gap-4 py-3 border-b border-cream-medium/40 last:border-0">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${rank <= 3 ? 'text-white' : 'bg-cream-light text-coffee-light'}`}
        style={rank <= 3 ? { background: 'linear-gradient(135deg, #A76D42, #C8956C)' } : {}}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-coffee-dark truncate">{item.name}</p>
        <p className="text-xs text-coffee-light">{item.sold} ly đã bán</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-coffee-accent">{item.revenue.toLocaleString('vi-VN')}đ</p>
        <div className={`flex items-center justify-end gap-0.5 text-xs ${trendColor}`}>
          <TrendIcon size={11} />
        </div>
      </div>
    </div>
  );
}

// ---- Order History Table ----
function OrderHistoryTab() {
  const { orderHistory, clearHistory } = useOrderHistory();
  const [searchQuery, setSearchQuery] = useState('');
  const [detailOrder, setDetailOrder] = useState(null);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return orderHistory;
    const q = searchQuery.toLowerCase();
    return orderHistory.filter(o =>
      o.id.toLowerCase().includes(q) ||
      o.tableName.toLowerCase().includes(q) ||
      o.date.includes(q)
    );
  }, [orderHistory, searchQuery]);

  const handleExportCSV = () => {
    if (orderHistory.length === 0) return;
    const header = 'Mã HĐ,Ngày,Giờ,Bàn,Tổng tiền,Hình thức,Số món\n';
    const rows = orderHistory.map(o =>
      `"${o.id}","${o.date}","${o.time}","${o.tableName}","${o.total}","${o.paymentMethod === 'cash' ? 'Tiền mặt' : 'Thẻ/QR'}","${o.items.reduce((s, i) => s + i.qty, 0)}"`
    ).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lich_su_hoa_don_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-coffee-light" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã HD, số bàn..."
            className="input-field pl-9 min-h-[44px] text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV}
            className="min-h-[44px] btn-secondary flex items-center gap-2 text-sm px-4">
            <Download size={16} />
            Xuất CSV
          </button>
          {orderHistory.length > 0 && (
            <button onClick={() => { if (window.confirm('Xóa toàn bộ lịch sử?')) clearHistory(); }}
              className="min-h-[44px] btn-danger flex items-center gap-2 text-sm px-4">
              <Trash2 size={16} />
              Xóa hết
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {orderHistory.length === 0 ? (
        <div className="bg-white rounded-2xl border border-cream-medium/30 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-cream-light flex items-center justify-center mx-auto mb-4">
            <FileText size={24} className="text-coffee-light" />
          </div>
          <p className="font-semibold text-coffee-medium">Chưa có hóa đơn nào</p>
          <p className="text-coffee-light text-sm mt-1">Các hóa đơn sau khi thanh toán sẽ xuất hiện ở đây</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-cream-medium/30 overflow-hidden shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-light border-b border-cream-medium/40">
                  <th className="text-left px-4 py-3 font-semibold text-coffee-medium">Mã HĐ</th>
                  <th className="text-left px-4 py-3 font-semibold text-coffee-medium">Bàn</th>
                  <th className="text-left px-4 py-3 font-semibold text-coffee-medium hidden sm:table-cell">Thời gian</th>
                  <th className="text-left px-4 py-3 font-semibold text-coffee-medium hidden sm:table-cell">Nhân viên</th>
                  <th className="text-left px-4 py-3 font-semibold text-coffee-medium hidden md:table-cell">Món</th>
                  <th className="text-left px-4 py-3 font-semibold text-coffee-medium">Hình thức</th>
                  <th className="text-right px-4 py-3 font-semibold text-coffee-medium">Tổng</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <tr key={order.timestamp} className="border-b border-cream-medium/30 hover:bg-cream-light/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-coffee-accent text-xs bg-coffee-accent/10 px-2 py-1 rounded-lg">{order.id}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-coffee-dark">{order.tableName}</td>
                    <td className="px-4 py-3 text-coffee-light hidden sm:table-cell">
                      <p>{order.time}</p>
                      <p className="text-xs">{order.date}</p>
                    </td>
                    <td className="px-4 py-3 text-coffee-dark font-medium hidden sm:table-cell">
                      {order.employee?.name || '---'}
                    </td>
                    <td className="px-4 py-3 text-coffee-medium hidden md:table-cell">
                      {order.items.reduce((s, i) => s + i.qty, 0)} món
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full w-fit ${
                        order.paymentMethod === 'cash'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {order.paymentMethod === 'cash' ? <Banknote size={11} /> : <CreditCard size={11} />}
                        {order.paymentMethod === 'cash' ? 'Tiền mặt' : 'Thẻ/QR'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-coffee-accent">
                      {order.total.toLocaleString('vi-VN')}đ
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDetailOrder(order)}
                        className="min-w-[36px] min-h-[36px] rounded-lg bg-cream-light flex items-center justify-center text-coffee-light hover:bg-cream-medium hover:text-coffee-dark transition-colors">
                        <FileText size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-8 text-center text-coffee-light text-sm">Không tìm thấy hóa đơn phù hợp</div>
            )}
          </div>
          <p className="text-coffee-light text-xs mt-2 text-right">Hiển thị {filtered.length}/{orderHistory.length} hóa đơn</p>
        </>
      )}

      {/* Order Detail Modal */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(26,15,10,0.6)', backdropFilter: 'blur(5px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
            <div className="px-5 py-4 border-b border-cream-medium/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-green-500" />
                <h3 className="font-display font-bold text-coffee-dark">Chi tiết {detailOrder.id}</h3>
              </div>
              <button onClick={() => setDetailOrder(null)}
                className="min-w-[36px] min-h-[36px] rounded-lg bg-cream-light flex items-center justify-center text-coffee-medium hover:bg-cream-medium">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-cream-light rounded-xl p-3">
                  <p className="text-coffee-light text-xs">Bàn</p>
                  <p className="font-bold text-coffee-dark">{detailOrder.tableName}</p>
                </div>
                <div className="bg-cream-light rounded-xl p-3">
                  <p className="text-coffee-light text-xs">Thời gian</p>
                  <p className="font-bold text-coffee-dark">{detailOrder.time} · {detailOrder.date}</p>
                </div>
                <div className="bg-cream-light rounded-xl p-3 col-span-2 flex justify-between items-center">
                  <div>
                    <p className="text-coffee-light text-xs">Nhân viên</p>
                    <p className="font-bold text-coffee-dark">{detailOrder.employee?.name || 'Không rõ'}</p>
                  </div>
                  {detailOrder.customer && (
                    <div className="text-right">
                      <p className="text-coffee-light text-xs">Khách hàng</p>
                      <p className="font-bold text-coffee-dark text-coffee-accent">{detailOrder.customer.name}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-cream-light rounded-xl p-3">
                <p className="text-coffee-light text-xs mb-2">Danh sách món</p>
                {detailOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between py-1 border-b border-cream-medium/40 last:border-0 text-sm">
                    <div>
                      <p className="font-medium text-coffee-dark">{item.name}</p>
                      <p className="text-xs text-coffee-light">{item.sugar} · {item.ice}{item.note ? ` · ${item.note}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-coffee-medium">x{item.qty}</p>
                      <p className="font-bold text-coffee-accent text-xs">{(item.price * item.qty).toLocaleString('vi-VN')}đ</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-coffee-medium">
                  <span>Tạm tính</span><span>{detailOrder.subtotal.toLocaleString('vi-VN')}đ</span>
                </div>
                {detailOrder.discountAmount > 0 && (
                  <div className="flex justify-between text-coffee-accent font-medium">
                    <span>Giảm giá ({detailOrder.voucherCode}):</span>
                    <span>-{detailOrder.discountAmount.toLocaleString('vi-VN')}đ</span>
                  </div>
                )}
                <div className="flex justify-between text-coffee-medium">
                  <span>VAT 8%</span><span>+{detailOrder.vatAmount.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="flex justify-between font-bold text-base text-coffee-dark pt-1 border-t border-cream-medium">
                  <span>Tổng cộng</span>
                  <span className="text-coffee-accent">{detailOrder.total.toLocaleString('vi-VN')}đ</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Inventory Row (interactive restock) ----
function InventoryRow({ item, pct, isLow, isCritical, onRestock }) {
  const [restockAmount, setRestockAmount] = useState('');

  const handleRestock = () => {
    const amount = Number(restockAmount);
    if (!amount || amount <= 0) return;
    onRestock(item.id, amount);
    setRestockAmount('');
  };

  return (
    <tr className={`border-b border-cream-medium/30 transition-colors ${isCritical ? 'bg-red-50' : isLow ? 'bg-yellow-50' : 'hover:bg-cream-light/30'}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{item.icon}</span>
          <span className="font-semibold text-coffee-dark">{item.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <p className={`font-bold ${isCritical ? 'text-red-600' : isLow ? 'text-yellow-700' : 'text-coffee-dark'}`}>
          {item.qty.toLocaleString('vi-VN')} {item.unit}
        </p>
        <div className="w-20 h-1.5 rounded-full bg-gray-200 ml-auto mt-1">
          <div className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(pct, 100)}%`,
              background: isCritical ? '#ef4444' : isLow ? '#eab308' : 'linear-gradient(90deg,#A76D42,#C8956C)',
            }}
          />
        </div>
      </td>
      <td className="px-4 py-3 text-right text-coffee-medium hidden sm:table-cell">
        {item.minQty.toLocaleString('vi-VN')} {item.unit}
      </td>
      <td className="px-4 py-3 text-center">
        {isCritical
          ? <span className="text-xs bg-red-100 text-red-700 border border-red-300 px-2 py-1 rounded-full font-bold">⚠ Cạn kiệt</span>
          : isLow
          ? <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 px-2 py-1 rounded-full font-bold">Sắp hết</span>
          : <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-full font-semibold">✓ Ổn</span>
        }
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 justify-center">
          <input
            type="number"
            value={restockAmount}
            onChange={e => setRestockAmount(e.target.value)}
            placeholder="Số lượng"
            className="w-24 input-field min-h-[36px] text-xs px-2"
            min="1"
          />
          <button onClick={handleRestock}
            disabled={!restockAmount}
            className="min-h-[36px] px-3 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}>
            Nhập
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---- Main Dashboard ----
export default function DashboardPage() {
  const { today, weeklyRevenue, topItems, recentOrders, shifts, thisWeek } = dashboardData;
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'history' | 'inventory'
  const { inventory, lowStockItems, restock, resetInventory } = useInventory();

  const progressPct = Math.min((today.revenue / today.target) * 100, 100).toFixed(0);

  return (
    <div className="h-full overflow-y-auto bg-cream-warm">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl text-coffee-dark">Báo cáo & Thống kê</h1>
            <p className="text-coffee-light text-sm mt-1">
              {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          {/* Tab switcher */}
          <div className="flex bg-cream-light rounded-xl p-1 gap-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'overview'
                  ? 'text-white shadow-coffee'
                  : 'text-coffee-medium hover:text-coffee-dark'
              }`}
              style={activeTab === 'overview' ? { background: 'linear-gradient(135deg, #A76D42, #C8956C)' } : {}}
            >
              Tổng quan
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'text-white shadow-coffee'
                  : 'text-coffee-medium hover:text-coffee-dark'
              }`}
              style={activeTab === 'history' ? { background: 'linear-gradient(135deg, #A76D42, #C8956C)' } : {}}
            >
              <FileText size={14} />
              Hóa đơn
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'inventory'
                  ? 'text-white shadow-coffee'
                  : 'text-coffee-medium hover:text-coffee-dark'
              }`}
              style={activeTab === 'inventory' ? { background: 'linear-gradient(135deg, #A76D42, #C8956C)' } : {}}
            >
              <Package size={14} />
              Kho
              {lowStockItems.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {lowStockItems.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Low-stock global banner */}
        {lowStockItems.length > 0 && activeTab !== 'inventory' && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 cursor-pointer hover:bg-red-100 transition-colors"
            onClick={() => setActiveTab('inventory')}>
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
            <p className="text-red-700 text-sm font-semibold flex-1">
              Cảnh báo: <span className="font-bold">{lowStockItems.length} nguyên liệu</span> sắp hết hàng!
              <span className="font-normal"> ({lowStockItems.map(i => i.name).join(', ')})</span>
            </p>
            <span className="text-red-500 text-xs font-bold underline whitespace-nowrap">Xem kho →</span>
          </div>
        )}

        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === 'overview' && (
          <>
            {/* Row 1: Key Stats */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
              <StatCard icon={DollarSign} label="Doanh thu hôm nay" value={`${(today.revenue / 1_000_000).toFixed(1)}M`} sub={`Mục tiêu: ${(today.target / 1_000_000).toFixed(0)}M`} color="bg-gradient-to-br from-coffee-accent to-coffee-gold" trend={8.3} />
              <StatCard icon={ShoppingBag} label="Số đơn hàng" value={today.orders} sub={`Trung bình: ${today.avgOrderValue.toLocaleString('vi-VN')}đ/đơn`} color="bg-gradient-to-br from-blue-500 to-blue-400" trend={5.2} />
              <StatCard icon={Users} label="Khách hôm nay" value={today.customers} sub="Lượt khách ghé thăm" color="bg-gradient-to-br from-purple-500 to-purple-400" trend={12.5} />
              <StatCard icon={Target} label="Tuần này" value={`${(thisWeek.revenue / 1_000_000).toFixed(1)}M`} sub={`${thisWeek.orders} đơn hàng`} color="bg-gradient-to-br from-emerald-500 to-emerald-400" trend={thisWeek.growth} />
            </div>

            {/* Row 2: Chart + Progress */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
              <div className="xl:col-span-2 bg-white rounded-2xl p-6 shadow-card border border-cream-medium/30">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-display font-bold text-coffee-dark text-lg">Doanh thu tuần này</h2>
                    <p className="text-coffee-light text-sm">7 ngày gần nhất</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-coffee-accent">{(thisWeek.revenue / 1_000_000).toFixed(1)}M</p>
                    <div className="flex items-center gap-1 text-green-500 text-xs font-semibold justify-end">
                      <TrendingUp size={12} />
                      +{thisWeek.growth}% so với tuần trước
                    </div>
                  </div>
                </div>
                <MiniBarChart data={weeklyRevenue} />
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-card border border-cream-medium/30 flex flex-col">
                <h2 className="font-display font-bold text-coffee-dark text-lg mb-1">Tiến độ hôm nay</h2>
                <p className="text-coffee-light text-sm mb-5">Doanh thu / Mục tiêu ngày</p>
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="relative w-36 h-36 mb-4">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#EDE3D4" strokeWidth="10" />
                      <circle cx="50" cy="50" r="40" fill="none" stroke="url(#progressGrad)" strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        strokeDashoffset={`${2 * Math.PI * 40 * (1 - progressPct / 100)}`}
                        className="transition-all duration-1000"
                      />
                      <defs>
                        <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#A76D42" />
                          <stop offset="100%" stopColor="#C8956C" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-coffee-dark">{progressPct}%</span>
                      <span className="text-xs text-coffee-light">hoàn thành</span>
                    </div>
                  </div>
                  <div className="w-full space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-coffee-light">Đã đạt</span>
                      <span className="font-bold text-coffee-accent">{today.revenue.toLocaleString('vi-VN')}đ</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-coffee-light">Mục tiêu</span>
                      <span className="font-bold text-coffee-dark">{today.target.toLocaleString('vi-VN')}đ</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-coffee-light">Còn lại</span>
                      <span className="font-bold text-coffee-medium">{(today.target - today.revenue).toLocaleString('vi-VN')}đ</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Top Items + Recent Orders */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-2xl p-6 shadow-card border border-cream-medium/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Award size={18} className="text-coffee-accent" />
                    <h2 className="font-display font-bold text-coffee-dark text-lg">Món bán chạy</h2>
                  </div>
                  <span className="text-coffee-light text-xs">Tuần này</span>
                </div>
                {topItems.map((item, idx) => <TopItemRow key={item.id} item={item} rank={idx + 1} />)}
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-card border border-cream-medium/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-coffee-accent" />
                    <h2 className="font-display font-bold text-coffee-dark text-lg">Đơn hàng gần đây</h2>
                  </div>
                  <button
                    onClick={() => setActiveTab('history')}
                    className="text-coffee-accent text-xs font-semibold flex items-center gap-1 hover:underline">
                    Xem tất cả <ChevronRight size={13} />
                  </button>
                </div>
                {recentOrders.map(order => (
                  <div key={order.id} className="flex items-center justify-between py-3 border-b border-cream-medium/40 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-cream-light flex items-center justify-center text-coffee-medium text-xs font-bold">
                        {order.id}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-coffee-dark">{order.table}</p>
                        <p className="text-xs text-coffee-light">{order.items} món · {order.time}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-coffee-accent">{order.total.toLocaleString('vi-VN')}đ</p>
                      <span className="text-xs bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full font-semibold">
                        Hoàn thành
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 4: Shift Log */}
            <div className="bg-white rounded-2xl p-6 shadow-card border border-cream-medium/30">
              <div className="flex items-center gap-2 mb-5">
                <Clock size={18} className="text-coffee-accent" />
                <h2 className="font-display font-bold text-coffee-dark text-lg">Nhật ký ca làm việc</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {shifts.map(shift => (
                  <div key={shift.id} className="rounded-2xl p-4 border border-cream-medium/60" style={{ background: '#FAF7F2' }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-coffee-dark">{shift.name}</h3>
                        <p className="text-coffee-light text-sm">{shift.staff}</p>
                      </div>
                      <span className="text-xs font-semibold text-coffee-accent bg-coffee-accent/10 px-2.5 py-1 rounded-full">
                        {shift.start} – {shift.end}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl p-3 text-center shadow-card">
                        <p className="text-xl font-bold text-coffee-dark">{shift.orders}</p>
                        <p className="text-xs text-coffee-light mt-0.5">Đơn hàng</p>
                      </div>
                      <div className="bg-white rounded-xl p-3 text-center shadow-card">
                        <p className="text-xl font-bold text-coffee-accent">{(shift.revenue / 1_000_000).toFixed(1)}M</p>
                        <p className="text-xs text-coffee-light mt-0.5">Doanh thu</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ===== HISTORY TAB ===== */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl p-6 shadow-card border border-cream-medium/30">
            <div className="flex items-center gap-2 mb-5">
              <FileText size={18} className="text-coffee-accent" />
              <h2 className="font-display font-bold text-coffee-dark text-lg">Lịch sử hóa đơn</h2>
            </div>
            <OrderHistoryTab />
          </div>
        )}

        {/* ===== INVENTORY TAB ===== */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-6 shadow-card border border-cream-medium/30">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Package size={18} className="text-coffee-accent" />
                  <h2 className="font-display font-bold text-coffee-dark text-lg">Quản lý Kho nguyên liệu</h2>
                </div>
                <button onClick={resetInventory}
                  className="min-h-[40px] btn-secondary flex items-center gap-2 text-sm px-4">
                  <RefreshCw size={15} />
                  Reset về mặc định
                </button>
              </div>

              {/* Low stock summary */}
              {lowStockItems.length > 0 && (
                <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-red-500" />
                    <p className="text-red-700 font-bold text-sm">{lowStockItems.length} nguyên liệu cần nhập hàng ngay!</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {lowStockItems.map(item => (
                      <span key={item.id} className="text-xs bg-red-100 text-red-700 border border-red-300 px-2 py-1 rounded-lg font-semibold">
                        {item.icon} {item.name}: còn {item.qty.toLocaleString('vi-VN')}{item.unit}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Inventory table */}
              <div className="overflow-hidden rounded-xl border border-cream-medium/30">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-cream-light border-b border-cream-medium/40">
                      <th className="text-left px-4 py-3 font-semibold text-coffee-medium">Nguyên liệu</th>
                      <th className="text-right px-4 py-3 font-semibold text-coffee-medium">Tồn kho</th>
                      <th className="text-right px-4 py-3 font-semibold text-coffee-medium hidden sm:table-cell">Mức tối thiểu</th>
                      <th className="text-center px-4 py-3 font-semibold text-coffee-medium">Trạng thái</th>
                      <th className="text-center px-4 py-3 font-semibold text-coffee-medium">Nhập thêm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map(item => {
                      const pct = item.minQty > 0 ? Math.min((item.qty / item.minQty) * 100, 300) : 100;
                      const isLow = item.qty <= item.minQty;
                      const isCritical = item.qty <= item.minQty * 0.5;
                      return (
                        <InventoryRow
                          key={item.id}
                          item={item}
                          pct={pct}
                          isLow={isLow}
                          isCritical={isCritical}
                          onRestock={restock}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
