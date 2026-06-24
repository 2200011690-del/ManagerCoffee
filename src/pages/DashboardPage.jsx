import { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Minus as MinusIcon, ShoppingBag, Users, DollarSign,
  Target, Clock, Award, ChevronRight, FileText, Search, Download, Trash2,
  CheckCircle, Banknote, CreditCard, X, AlertTriangle, Package, RefreshCw,
  Plus, Edit, Truck, Sliders, History, BookOpen, Save, PlusCircle, Check
} from 'lucide-react';
import { dashboardData } from '../data/coffeeData';
import { useOrderHistory } from '../context/OrderHistoryContext';
import { useInventory } from '../context/InventoryContext';
import { useMenu } from '../context/MenuContext';

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
  const { 
    inventory, lowStockItems, resetInventory,
    suppliers, transactions, createIngredient, updateIngredient, deleteIngredient,
    importStock, adjustStock, createSupplier, updateSupplier, deleteSupplier,
    fetchRecipe, saveRecipe, fetchTransactions, fetchSuppliers
  } = useInventory();
  const { menuList } = useMenu();

  // Sub-tabs inside inventory
  const [invSubTab, setInvSubTab] = useState('stock'); // 'stock' | 'recipes' | 'history' | 'suppliers'

  // Search/Filters
  const [ingQuery, setIngQuery] = useState('');
  const [recipeQuery, setRecipeQuery] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('ALL');

  // Modals state
  const [showAddIng, setShowAddIng] = useState(false);
  const [showEditIng, setShowEditIng] = useState(false);
  const [selectedIng, setSelectedIng] = useState(null);

  const [showImport, setShowImport] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);

  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showEditSupplier, setShowEditSupplier] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  // Recipe configuration state
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [recipeProduct, setRecipeProduct] = useState(null);
  const [recipeLines, setRecipeLines] = useState([]); // array of { inventoryId, qty }

  // Modal forms fields
  const [ingForm, setIngForm] = useState({ name: '', unit: '', qty: 0, minQty: 0, icon: '☕' });
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [importForm, setImportForm] = useState({ inventoryId: '', qty: '', cost: '', supplierId: '', note: '' });
  const [adjustForm, setAdjustForm] = useState({ inventoryId: '', actualQty: '', note: '' });

  // Initial loads
  useEffect(() => {
    if (activeTab === 'inventory') {
      fetchSuppliers();
      fetchTransactions();
    }
  }, [activeTab, fetchSuppliers, fetchTransactions]);

  // Handlers for Inventory
  const handleAddIng = async (e) => {
    e.preventDefault();
    try {
      await createIngredient(ingForm);
      setShowAddIng(false);
      setIngForm({ name: '', unit: '', qty: 0, minQty: 0, icon: '☕' });
    } catch(err) {
      alert('Không thể tạo nguyên liệu: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSaveEditIng = async (e) => {
    e.preventDefault();
    try {
      await updateIngredient(selectedIng.id, ingForm);
      setShowEditIng(false);
    } catch(err) {
      alert('Không thể sửa nguyên liệu: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteIng = async (id) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa nguyên liệu này?")) {
      try {
        await deleteIngredient(id);
      } catch(err) {
        alert('Không thể xóa: ' + (err.response?.data?.error || err.message));
      }
    }
  };

  const handleImportStock = async (e) => {
    e.preventDefault();
    try {
      await importStock({
        inventoryId: importForm.inventoryId,
        qty: Number(importForm.qty),
        cost: Number(importForm.cost) || null,
        supplierId: importForm.supplierId || null,
        note: importForm.note
      });
      setShowImport(false);
      setImportForm({ inventoryId: '', qty: '', cost: '', supplierId: '', note: '' });
    } catch(err) {
      alert('Không thể nhập kho: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    try {
      await adjustStock({
        inventoryId: adjustForm.inventoryId,
        actualQty: Number(adjustForm.actualQty),
        note: adjustForm.note
      });
      setShowAdjust(false);
      setAdjustForm({ inventoryId: '', actualQty: '', note: '' });
    } catch(err) {
      alert('Không thể cân đối kiểm kho: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleAddSupplier = async (e) => {
    e.preventDefault();
    try {
      await createSupplier(supplierForm);
      setShowAddSupplier(false);
      setSupplierForm({ name: '', phone: '', email: '', address: '' });
    } catch(err) {
      alert('Không thể thêm nhà cung cấp: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleStartEditSupplier = (s) => {
    setSelectedSupplier(s);
    setSupplierForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: s.address || '' });
    setShowEditSupplier(true);
  };

  const handleSaveEditSupplier = async (e) => {
    e.preventDefault();
    try {
      await updateSupplier(selectedSupplier.id, supplierForm);
      setShowEditSupplier(false);
    } catch(err) {
      alert('Không thể cập nhật nhà cung cấp: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteSupplier = async (id) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa nhà cung cấp này?")) {
      try {
        await deleteSupplier(id);
      } catch(err) {
        alert('Không thể xóa nhà cung cấp: ' + (err.response?.data?.error || err.message));
      }
    }
  };

  const handleAddRecipeLine = () => {
    setRecipeLines(prev => [...prev, { inventoryId: inventory[0]?.id || '', qty: '' }]);
  };

  const handleUpdateRecipeLine = (idx, field, val) => {
    setRecipeLines(prev => prev.map((line, i) => i === idx ? { ...line, [field]: val } : line));
  };

  const handleRemoveRecipeLine = (idx) => {
    setRecipeLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveRecipe = async () => {
    try {
      const cleanLines = recipeLines.filter(l => l.inventoryId && Number(l.qty) > 0);
      await saveRecipe(recipeProduct.id, cleanLines);
      setShowRecipeModal(false);
      alert('Lưu công thức định lượng thành công!');
    } catch(err) {
      alert('Lỗi khi lưu định lượng: ' + (err.response?.data?.error || err.message));
    }
  };

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
              {/* Main Tab Header */}
              <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <Package size={22} className="text-blue-600" />
                  <h2 className="font-display font-bold text-coffee-dark text-xl">Hệ thống Quản lý Kho chuyên nghiệp</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={resetInventory}
                    className="min-h-[38px] px-3 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1.5 font-semibold">
                    <RefreshCw size={13} />
                    Reset kho mẫu
                  </button>
                </div>
              </div>

              {/* Sub-tab Switcher */}
              <div className="flex flex-wrap gap-2 border-b border-gray-100 mb-5">
                <button
                  onClick={() => setInvSubTab('stock')}
                  className={`pb-2.5 px-4 font-semibold text-sm transition-all border-b-2 flex items-center gap-1.5 ${
                    invSubTab === 'stock'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Package size={16} />
                  Kho nguyên liệu
                </button>
                <button
                  onClick={() => setInvSubTab('recipes')}
                  className={`pb-2.5 px-4 font-semibold text-sm transition-all border-b-2 flex items-center gap-1.5 ${
                    invSubTab === 'recipes'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <BookOpen size={16} />
                  Định lượng món ăn
                </button>
                <button
                  onClick={() => setInvSubTab('history')}
                  className={`pb-2.5 px-4 font-semibold text-sm transition-all border-b-2 flex items-center gap-1.5 ${
                    invSubTab === 'history'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <History size={16} />
                  Nhật ký biến động
                </button>
                <button
                  onClick={() => setInvSubTab('suppliers')}
                  className={`pb-2.5 px-4 font-semibold text-sm transition-all border-b-2 flex items-center gap-1.5 ${
                    invSubTab === 'suppliers'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Truck size={16} />
                  Nhà cung cấp
                </button>
              </div>

              {/* Sub-tab 1: KHO NGUYÊN LIỆU */}
              {invSubTab === 'stock' && (
                <div className="space-y-4">
                  {/* Actions & Search */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="relative w-full max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Tìm nguyên liệu..."
                        value={ingQuery}
                        onChange={e => setIngQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => {
                          setIngForm({ name: '', unit: '', qty: 0, minQty: 0, icon: '☕' });
                          setShowAddIng(true);
                        }}
                        className="flex-1 sm:flex-initial min-h-[38px] bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Plus size={16} />
                        Thêm nguyên liệu
                      </button>
                      <button
                        onClick={() => {
                          if (inventory.length === 0) return alert('Vui lòng tạo nguyên liệu trước');
                          setImportForm({ inventoryId: inventory[0].id, qty: '', cost: '', supplierId: suppliers[0]?.id || '', note: '' });
                          setShowImport(true);
                        }}
                        className="flex-1 sm:flex-initial min-h-[38px] bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Download size={16} />
                        Nhập hàng
                      </button>
                      <button
                        onClick={() => {
                          if (inventory.length === 0) return alert('Vui lòng tạo nguyên liệu trước');
                          setAdjustForm({ inventoryId: inventory[0].id, actualQty: '', note: '' });
                          setShowAdjust(true);
                        }}
                        className="flex-1 sm:flex-initial min-h-[38px] bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-700 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Sliders size={16} />
                        Kiểm kho
                      </button>
                    </div>
                  </div>

                  {/* Low Stock Alert */}
                  {lowStockItems.length > 0 && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={18} className="text-red-600" />
                        <p className="text-red-800 font-bold text-sm">{lowStockItems.length} nguyên liệu sắp hết hoặc cạn kiệt!</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {lowStockItems.map(item => (
                          <span key={item.id} className="text-xs bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-lg font-bold">
                            {item.icon} {item.name}: còn {item.qty.toLocaleString('vi-VN')} {item.unit} (định mức: {item.minQty} {item.unit})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Table */}
                  <div className="overflow-x-auto rounded-xl border border-gray-150">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-150">
                          <th className="px-4 py-3 font-semibold text-gray-700">Nguyên liệu</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 text-right">Tồn kho hiện tại</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 text-right hidden md:table-cell">Hạn mức tối thiểu</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 text-center">Trạng thái</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 text-center">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {inventory
                          .filter(item => item.name.toLowerCase().includes(ingQuery.toLowerCase()))
                          .map(item => {
                            const isLow = item.qty <= item.minQty;
                            const isCritical = item.qty <= item.minQty * 0.5;
                            return (
                              <tr key={item.id} className={`hover:bg-gray-50/50 transition-colors ${isCritical ? 'bg-red-50/40' : isLow ? 'bg-yellow-50/40' : ''}`}>
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-2xl w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">{item.icon || '☕'}</span>
                                    <span className="font-semibold text-gray-800">{item.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-right font-bold text-gray-900">
                                  {item.qty.toLocaleString('vi-VN')} <span className="text-xs font-normal text-gray-500">{item.unit}</span>
                                </td>
                                <td className="px-4 py-3.5 text-right text-gray-500 hidden md:table-cell">
                                  {item.minQty.toLocaleString('vi-VN')} {item.unit}
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  {isCritical ? (
                                    <span className="text-xs bg-red-100 text-red-800 px-2.5 py-1 rounded-full font-bold border border-red-200">⚠ Cạn kiệt</span>
                                  ) : isLow ? (
                                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full font-bold border border-yellow-250">Sắp hết</span>
                                  ) : (
                                    <span className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-bold border border-green-200">Ổn định</span>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => {
                                        setSelectedIng(item);
                                        setIngForm({ name: item.name, unit: item.unit, minQty: item.minQty, icon: item.icon || '☕' });
                                        setShowEditIng(true);
                                      }}
                                      className="p-1.5 hover:bg-gray-100 rounded text-blue-600 transition-colors"
                                      title="Sửa thông tin"
                                    >
                                      <Edit size={15} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setImportForm(prev => ({ ...prev, inventoryId: item.id }));
                                        setShowImport(true);
                                      }}
                                      className="px-2 py-1 text-xs hover:bg-emerald-50 text-emerald-600 rounded border border-emerald-200 transition-colors"
                                    >
                                      Nhập
                                    </button>
                                    <button
                                      onClick={() => {
                                        setAdjustForm(prev => ({ ...prev, inventoryId: item.id, actualQty: item.qty }));
                                        setShowAdjust(true);
                                      }}
                                      className="px-2 py-1 text-xs hover:bg-amber-50 text-amber-600 rounded border border-amber-200 transition-colors"
                                    >
                                      Cân đối
                                    </button>
                                    <button
                                      onClick={() => handleDeleteIng(item.id)}
                                      className="p-1.5 hover:bg-gray-150 rounded text-red-650 transition-colors"
                                      title="Xóa"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub-tab 2: ĐỊNH LƯỢNG MÓN ĂN */}
              {invSubTab === 'recipes' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="relative w-full max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Tìm kiếm sản phẩm..."
                        value={recipeQuery}
                        onChange={e => setRecipeQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <p className="text-xs text-gray-500 italic">Món chưa có định lượng sẽ không tự động trừ kho nguyên liệu khi bán.</p>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-150">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-150">
                          <th className="px-4 py-3 font-semibold text-gray-700">Món ăn / Đồ uống</th>
                          <th className="px-4 py-3 font-semibold text-gray-700">Nhóm danh mục</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 text-right">Đơn giá bán</th>
                          <th className="px-4 py-3 font-semibold text-gray-700">Định lượng thành phần</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 text-center">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {menuList
                          .filter(p => p.name.toLowerCase().includes(recipeQuery.toLowerCase()))
                          .map(p => {
                            // Fetch recipe items if any seeded. We need to query client-side, but wait, 
                            // as an optimization, we can fetch recipe in modal. But how to display in this list?
                            // Let's call API for recipe status? Or display simple state.
                            // To keep it simple and efficient, let's allow editing recipe via "Configure" button.
                            return (
                              <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3.5">
                                  <span className="font-semibold text-gray-800">{p.name}</span>
                                </td>
                                <td className="px-4 py-3.5 text-gray-500">{p.category}</td>
                                <td className="px-4 py-3.5 text-right font-semibold text-gray-900">
                                  {p.price.toLocaleString('vi-VN')}đ
                                </td>
                                <td className="px-4 py-3.5">
                                  {/* Summary info if loaded, otherwise placeholder */}
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                    Click cấu hình định lượng
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <button
                                    onClick={async () => {
                                      setRecipeProduct(p);
                                      const items = await fetchRecipe(p.id);
                                      setRecipeLines(items.map(it => ({ inventoryId: it.inventoryId, qty: it.qty })));
                                      setShowRecipeModal(true);
                                    }}
                                    className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 transition-colors font-semibold"
                                  >
                                    Cấu hình định lượng
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub-tab 3: NHẬT KÝ BIẾN ĐỘNG KHO */}
              {invSubTab === 'history' && (
                <div className="space-y-4">
                  {/* Ledger Filters */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-semibold uppercase">Bộ lọc giao dịch:</span>
                      <div className="flex bg-gray-150 rounded-lg p-0.5 gap-1">
                        {['ALL', 'IMPORT', 'SALE', 'ADJUST'].map(type => (
                          <button
                            key={type}
                            onClick={() => setTxTypeFilter(type)}
                            className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                              txTypeFilter === type
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-800'
                            }`}
                          >
                            {type === 'ALL' && 'Tất cả'}
                            {type === 'IMPORT' && 'Nhập hàng'}
                            {type === 'SALE' && 'Bán hàng'}
                            {type === 'ADJUST' && 'Kiểm kho'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={fetchTransactions}
                      className="text-xs text-blue-600 hover:underline font-semibold"
                    >
                      Làm mới nhật ký ↻
                    </button>
                  </div>

                  {/* Ledger Table */}
                  <div className="overflow-x-auto rounded-xl border border-gray-150">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-150">
                          <th className="px-4 py-3 font-semibold text-gray-700">Thời gian</th>
                          <th className="px-4 py-3 font-semibold text-gray-700">Nguyên liệu</th>
                          <th className="px-4 py-3 font-semibold text-gray-700">Loại giao dịch</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 text-right">Biến động</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 text-right">Số dư tồn</th>
                          <th className="px-4 py-3 font-semibold text-gray-700">Nhà cung cấp / Đối tác</th>
                          <th className="px-4 py-3 font-semibold text-gray-700">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {transactions
                          .filter(tx => txTypeFilter === 'ALL' || tx.type === txTypeFilter)
                          .map(tx => (
                            <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors text-xs">
                              <td className="px-4 py-3 text-gray-500">
                                {new Date(tx.createdAt).toLocaleString('vi-VN')}
                              </td>
                              <td className="px-4 py-3 font-semibold text-gray-800">
                                {tx.inventory?.icon} {tx.inventory?.name}
                              </td>
                              <td className="px-4 py-3">
                                {tx.type === 'IMPORT' && (
                                  <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-bold">Nhập hàng</span>
                                )}
                                {tx.type === 'SALE' && (
                                  <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-250 font-bold">Bán hàng</span>
                                )}
                                {tx.type === 'ADJUST' && (
                                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 font-bold">Kiểm kho</span>
                                )}
                              </td>
                              <td className={`px-4 py-3 text-right font-bold ${tx.qtyChange > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {tx.qtyChange > 0 ? '+' : ''}{tx.qtyChange.toLocaleString('vi-VN')} {tx.inventory?.unit}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-700">
                                {tx.balance.toLocaleString('vi-VN')} {tx.inventory?.unit}
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {tx.supplier?.name || '-'}
                              </td>
                              <td className="px-4 py-3 text-gray-500 italic max-w-xs truncate" title={tx.note}>
                                {tx.note}
                              </td>
                            </tr>
                          ))}
                        {transactions.length === 0 && (
                          <tr>
                            <td colSpan="7" className="text-center py-8 text-gray-400">Không tìm thấy giao dịch nào</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub-tab 4: NHÀ CUNG CẤP */}
              {invSubTab === 'suppliers' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="relative w-full max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Tìm nhà cung cấp..."
                        value={supplierQuery}
                        onChange={e => setSupplierQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setSupplierForm({ name: '', phone: '', email: '', address: '' });
                        setShowAddSupplier(true);
                      }}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                    >
                      <Plus size={16} />
                      Thêm nhà cung cấp
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-150">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-150">
                          <th className="px-4 py-3 font-semibold text-gray-700">Tên nhà cung cấp</th>
                          <th className="px-4 py-3 font-semibold text-gray-700">Số điện thoại</th>
                          <th className="px-4 py-3 font-semibold text-gray-700">Email</th>
                          <th className="px-4 py-3 font-semibold text-gray-700">Địa chỉ</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 text-center">Giao dịch</th>
                          <th className="px-4 py-3 font-semibold text-gray-700 text-center">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {suppliers
                          .filter(s => s.name.toLowerCase().includes(supplierQuery.toLowerCase()))
                          .map(s => (
                            <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-4 py-3.5 font-semibold text-gray-800">{s.name}</td>
                              <td className="px-4 py-3.5 text-gray-600">{s.phone || '-'}</td>
                              <td className="px-4 py-3.5 text-gray-600">{s.email || '-'}</td>
                              <td className="px-4 py-3.5 text-gray-500 text-xs max-w-xs truncate" title={s.address}>{s.address || '-'}</td>
                              <td className="px-4 py-3.5 text-center text-gray-500 font-bold">{s._count?.transactions || 0} lần</td>
                              <td className="px-4 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleStartEditSupplier(s)}
                                    className="p-1 hover:bg-gray-100 rounded text-blue-600 transition-colors"
                                    title="Sửa"
                                  >
                                    <Edit size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSupplier(s.id)}
                                    className="p-1 hover:bg-gray-100 rounded text-red-600 transition-colors"
                                    title="Xóa"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        {suppliers.length === 0 && (
                          <tr>
                            <td colSpan="6" className="text-center py-8 text-gray-400">Chưa có nhà cung cấp nào</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* MODAL 1: THÊM NGUYÊN LIỆU MỚI */}
            {showAddIng && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <h3 className="font-bold text-coffee-dark text-lg">Thêm nguyên liệu mới</h3>
                    <button onClick={() => setShowAddIng(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
                      <X size={18} />
                    </button>
                  </div>
                  <form onSubmit={handleAddIng} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Tên nguyên liệu *</label>
                      <input
                        type="text"
                        required
                        value={ingForm.name}
                        onChange={e => setIngForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Ví dụ: Cà phê Arabica, Sữa tươi..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Đơn vị tính *</label>
                        <input
                          type="text"
                          required
                          value={ingForm.unit}
                          onChange={e => setIngForm(prev => ({ ...prev, unit: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="kg, lít, lon, cái..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Icon (Emoji) *</label>
                        <select
                          value={ingForm.icon}
                          onChange={e => setIngForm(prev => ({ ...prev, icon: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="☕">☕ Cà phê</option>
                          <option value="🥛">🥛 Sữa tươi</option>
                          <option value="🥫">🥫 Hộp sữa đặc</option>
                          <option value="🍃">🍃 Lá trà/Trà đen</option>
                          <option value="🍵">🍵 Bột Matcha</option>
                          <option value="🍚">🍚 Đường/Bột</option>
                          <option value="🍋">🍋 Chanh quả</option>
                          <option value="🧊">🧊 Đá viên</option>
                          <option value="📦">📦 Hộp giấy/Ly giấy</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Tồn kho ban đầu</label>
                        <input
                          type="number"
                          step="any"
                          value={ingForm.qty}
                          onChange={e => setIngForm(prev => ({ ...prev, qty: Number(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Định mức tối thiểu</label>
                        <input
                          type="number"
                          step="any"
                          value={ingForm.minQty}
                          onChange={e => setIngForm(prev => ({ ...prev, minQty: Number(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setShowAddIng(false)}
                        className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-semibold"
                      >
                        Tạo nguyên liệu
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* MODAL 2: CHỈNH SỬA NGUYÊN LIỆU */}
            {showEditIng && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <h3 className="font-bold text-coffee-dark text-lg">Chỉnh sửa nguyên liệu</h3>
                    <button onClick={() => setShowEditIng(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
                      <X size={18} />
                    </button>
                  </div>
                  <form onSubmit={handleSaveEditIng} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Tên nguyên liệu *</label>
                      <input
                        type="text"
                        required
                        value={ingForm.name}
                        onChange={e => setIngForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Đơn vị tính *</label>
                        <input
                          type="text"
                          required
                          value={ingForm.unit}
                          onChange={e => setIngForm(prev => ({ ...prev, unit: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Icon (Emoji)</label>
                        <select
                          value={ingForm.icon}
                          onChange={e => setIngForm(prev => ({ ...prev, icon: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="☕">☕ Cà phê</option>
                          <option value="🥛">🥛 Sữa tươi</option>
                          <option value="🥫">🥫 Hộp sữa đặc</option>
                          <option value="🍃">🍃 Lá trà/Trà đen</option>
                          <option value="🍵">🍵 Bột Matcha</option>
                          <option value="🍚">🍚 Đường/Bột</option>
                          <option value="🍋">🍋 Chanh quả</option>
                          <option value="🧊">🧊 Đá viên</option>
                          <option value="📦">📦 Hộp giấy/Ly giấy</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Định mức tối thiểu</label>
                      <input
                        type="number"
                        step="any"
                        value={ingForm.minQty}
                        onChange={e => setIngForm(prev => ({ ...prev, minQty: Number(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setShowEditIng(false)}
                        className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-semibold"
                      >
                        Lưu thay đổi
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* MODAL 3: NHẬP HÀNG KHO */}
            {showImport && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <h3 className="font-bold text-coffee-dark text-lg flex items-center gap-1.5 text-emerald-600">
                      <Download size={18} />
                      Tạo phiếu nhập hàng
                    </h3>
                    <button onClick={() => setShowImport(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
                      <X size={18} />
                    </button>
                  </div>
                  <form onSubmit={handleImportStock} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Chọn nguyên liệu nhập *</label>
                      <select
                        required
                        value={importForm.inventoryId}
                        onChange={e => setImportForm(prev => ({ ...prev, inventoryId: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        {inventory.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.icon} {item.name} (Tồn hiện tại: {item.qty} {item.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Nhà cung cấp</label>
                      <select
                        value={importForm.supplierId}
                        onChange={e => setImportForm(prev => ({ ...prev, supplierId: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        <option value="">-- Không chọn / NCC vãng lai --</option>
                        {suppliers.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.phone || 'Không có SĐT'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Số lượng nhập *</label>
                        <input
                          type="number"
                          step="any"
                          required
                          value={importForm.qty}
                          onChange={e => setImportForm(prev => ({ ...prev, qty: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Số lượng thực nhập"
                          min="0.001"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Đơn giá nhập (đ/đơn vị)</label>
                        <input
                          type="number"
                          value={importForm.cost}
                          onChange={e => setImportForm(prev => ({ ...prev, cost: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Ví dụ: 140000"
                          min="0"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Ghi chú phiếu nhập</label>
                      <textarea
                        value={importForm.note}
                        onChange={e => setImportForm(prev => ({ ...prev, note: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 h-16 resize-none"
                        placeholder="Nhập kho định kỳ, nhập thêm cho sự kiện..."
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setShowImport(false)}
                        className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 font-semibold"
                      >
                        Xác nhận nhập
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* MODAL 4: KIỂM KHO / CÂN ĐỐI */}
            {showAdjust && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <h3 className="font-bold text-coffee-dark text-lg flex items-center gap-1.5 text-amber-600">
                      <Sliders size={18} />
                      Kiểm kho cân đối nguyên liệu
                    </h3>
                    <button onClick={() => setShowAdjust(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
                      <X size={18} />
                    </button>
                  </div>
                  <form onSubmit={handleAdjustStock} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Chọn nguyên liệu kiểm *</label>
                      <select
                        required
                        value={adjustForm.inventoryId}
                        onChange={e => {
                          const item = inventory.find(it => it.id === e.target.value);
                          setAdjustForm(prev => ({ ...prev, inventoryId: e.target.value, actualQty: item ? item.qty : '' }));
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        {inventory.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.icon} {item.name} (Tồn hệ thống: {item.qty} {item.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Số lượng thực tế kiểm đếm *</label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={adjustForm.actualQty}
                        onChange={e => setAdjustForm(prev => ({ ...prev, actualQty: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Nhập số tồn kho thực tế cân đo được"
                        min="0"
                      />
                    </div>
                    {adjustForm.inventoryId && (
                      <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-1">
                        <p>Tồn hệ thống: <span className="font-semibold text-gray-800">{inventory.find(i => i.id === adjustForm.inventoryId)?.qty || 0} {inventory.find(i => i.id === adjustForm.inventoryId)?.unit}</span></p>
                        <p>Số lượng lệch: <span className={`font-bold ${(Number(adjustForm.actualQty) - (inventory.find(i => i.id === adjustForm.inventoryId)?.qty || 0)) >= 0 ? 'text-green-600' : 'text-red-650'}`}>{(Number(adjustForm.actualQty) - (inventory.find(i => i.id === adjustForm.inventoryId)?.qty || 0)).toFixed(2)} {inventory.find(i => i.id === adjustForm.inventoryId)?.unit}</span></p>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Lý do điều chỉnh (Bắt buộc) *</label>
                      <textarea
                        required
                        value={adjustForm.note}
                        onChange={e => setAdjustForm(prev => ({ ...prev, note: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 h-16 resize-none"
                        placeholder="Hao hụt trong pha chế, đổ vỡ nguyên liệu, kiểm kho định kỳ..."
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setShowAdjust(false)}
                        className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 font-semibold"
                      >
                        Lưu cân đối kho
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* MODAL 5: THÊM NHÀ CUNG CẤP */}
            {showAddSupplier && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <h3 className="font-bold text-coffee-dark text-lg">Thêm nhà cung cấp</h3>
                    <button onClick={() => setShowAddSupplier(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
                      <X size={18} />
                    </button>
                  </div>
                  <form onSubmit={handleAddSupplier} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Tên nhà cung cấp *</label>
                      <input
                        type="text"
                        required
                        value={supplierForm.name}
                        onChange={e => setSupplierForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Ví dụ: Đại lý cà phê Trung Nguyên..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Số điện thoại</label>
                      <input
                        type="text"
                        value={supplierForm.phone}
                        onChange={e => setSupplierForm(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Ví dụ: 0909xxxxxx"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={supplierForm.email}
                        onChange={e => setSupplierForm(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Ví dụ: contact@daiLy.vn"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Địa chỉ</label>
                      <input
                        type="text"
                        value={supplierForm.address}
                        onChange={e => setSupplierForm(prev => ({ ...prev, address: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Ví dụ: 12 Hoàng Hoa Thám, Tân Bình"
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setShowAddSupplier(false)}
                        className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-semibold"
                      >
                        Lưu nhà cung cấp
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* MODAL 6: SỬA NHÀ CUNG CẤP */}
            {showEditSupplier && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <h3 className="font-bold text-coffee-dark text-lg">Cập nhật nhà cung cấp</h3>
                    <button onClick={() => setShowEditSupplier(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
                      <X size={18} />
                    </button>
                  </div>
                  <form onSubmit={handleSaveEditSupplier} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Tên nhà cung cấp *</label>
                      <input
                        type="text"
                        required
                        value={supplierForm.name}
                        onChange={e => setSupplierForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Số điện thoại</label>
                      <input
                        type="text"
                        value={supplierForm.phone}
                        onChange={e => setSupplierForm(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={supplierForm.email}
                        onChange={e => setSupplierForm(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Địa chỉ</label>
                      <input
                        type="text"
                        value={supplierForm.address}
                        onChange={e => setSupplierForm(prev => ({ ...prev, address: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setShowEditSupplier(false)}
                        className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-semibold"
                      >
                        Lưu cập nhật
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* MODAL 7: CẤU HÌNH ĐỊNH LƯỢNG MÓN (RECIPE EDITOR) */}
            {showRecipeModal && recipeProduct && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl animate-fade-in max-h-[85vh] flex flex-col">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <div>
                      <h3 className="font-bold text-coffee-dark text-lg">Cấu hình định lượng món ăn</h3>
                      <p className="text-xs text-blue-600 font-semibold">Sản phẩm: {recipeProduct.name} ({recipeProduct.category})</p>
                    </div>
                    <button onClick={() => setShowRecipeModal(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-full">
                      <X size={18} />
                    </button>
                  </div>
                  
                  {/* Recipe lines list */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1">
                    {recipeLines.map((line, idx) => {
                      const selectedIngredientObj = inventory.find(i => i.id === line.inventoryId);
                      return (
                        <div key={idx} className="flex items-end gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Thành phần nguyên liệu</label>
                            <select
                              value={line.inventoryId}
                              onChange={e => handleUpdateRecipeLine(idx, 'inventoryId', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            >
                              <option value="">-- Chọn nguyên liệu --</option>
                              {inventory.map(item => (
                                <option key={item.id} value={item.id}>
                                  {item.icon} {item.name} ({item.unit})
                                </option>
                              ))}
                            </select>
                          </div>
                          
                          <div className="w-1/3">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Số lượng sử dụng</label>
                            <div className="relative">
                              <input
                                type="number"
                                step="any"
                                required
                                value={line.qty}
                                onChange={e => handleUpdateRecipeLine(idx, 'qty', e.target.value)}
                                className="w-full pl-3 pr-14 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="0.02"
                                min="0.0001"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-550">
                                {selectedIngredientObj?.unit || 'đv'}
                              </span>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => handleRemoveRecipeLine(idx)}
                            className="p-2 bg-red-50 text-red-650 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
                            title="Xóa dòng"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}

                    {recipeLines.length === 0 && (
                      <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        Chưa định nghĩa thành phần. Món ăn này hiện đang bán trực tiếp không trừ kho nguyên liệu.
                      </div>
                    )}
                  </div>

                  {/* Footer options */}
                  <div className="pt-4 border-t border-gray-100 mt-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleAddRecipeLine}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-250 text-gray-700 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors border border-gray-200"
                    >
                      <PlusCircle size={15} />
                      Thêm thành phần
                    </button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRecipeModal(false)}
                        className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveRecipe}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-semibold flex items-center gap-1.5"
                      >
                        <Save size={15} />
                        Lưu định lượng
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
