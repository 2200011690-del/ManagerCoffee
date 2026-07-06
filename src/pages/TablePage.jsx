import { useState, useCallback, useMemo } from 'react';
import { Users, Coffee, Sparkles, Clock, MapPin, RefreshCw, ShoppingBag, Utensils, ChevronRight, Plus, Edit, Trash2, X } from 'lucide-react';
import { useTable } from '../context/TableContext';
import { useCart } from '../context/CartContext';
import { useUI } from '../context/UIContext';

// Hàm tính total từ giỏ hàng của bàn
function calcTableTotal(cartItems = []) {
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  return Math.round(subtotal * 1.08); // đã gồm VAT
}
function calcTableItemCount(cartItems = []) {
  return cartItems.reduce((s, i) => s + i.qty, 0);
}

function TableCard({ table, onGoToPOS, onMarkClean, tableCarts, isEditMode, onEdit, onDelete }) {
  const cartItems = tableCarts[table.id] ?? [];
  const total = calcTableTotal(cartItems);
  const itemCount = calcTableItemCount(cartItems);
  const hasCart = cartItems.length > 0;

  // --- Styles theo trạng thái ---
  const styles = {
    available: {
      border: 'border-green-200',
      bg: 'bg-white hover:bg-green-50/60',
      topBar: 'bg-emerald-500',
      badge: 'bg-green-100 text-green-700',
      label: 'Trống',
      icon: <Sparkles size={14} className="text-green-500" />,
      btnLabel: 'Mở bàn',
      btnClass: 'bg-emerald-600 text-white hover:bg-emerald-700',
    },
    occupied: {
      border: 'border-pink-200',
      bg: 'bg-white hover:bg-pink-50/40',
      topBar: 'bg-rose-500',
      badge: 'bg-pink-100 text-pink-700',
      label: 'Có khách',
      icon: <Users size={14} className="text-pink-500" />,
      btnLabel: 'Gọi thêm / Thu tiền',
      btnClass: 'bg-primary-600 hover:bg-primary-700 text-white',
    },
    dirty: {
      border: 'border-yellow-200',
      bg: 'bg-yellow-50/60 hover:bg-yellow-100/60',
      topBar: 'bg-amber-400',
      badge: 'bg-yellow-100 text-yellow-700',
      label: 'Chưa dọn',
      icon: <RefreshCw size={14} className="text-yellow-600" />,
      btnLabel: 'Đã dọn xong',
      btnClass: 'bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-200',
    },
  };

  const s = styles[table.status];

  const handleClick = () => {
    if (isEditMode || table.status === 'dirty') return;
    onGoToPOS(table);
  };

  return (
    <div
      onClick={handleClick}
      className={`relative rounded-lg border-2 overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${s.border} ${s.bg} ${(table.status === 'dirty' || isEditMode) ? 'cursor-default' : 'hover:-translate-y-0.5'}`}
    >
      {/* Top color bar */}
      <div className={`h-1.5 w-full ${s.topBar}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="font-bold text-base text-coffee-dark leading-tight">{table.name}</h3>
            <div className="flex items-center gap-1 mt-0.5">
              <Users size={11} className="text-coffee-light" />
              <span className="text-xs text-coffee-light">{table.capacity} chỗ • {table.zone}</span>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${s.badge}`}>
            {s.icon}
            {s.label}
          </span>
        </div>

        {/* Occupied: show order info */}
        {table.status === 'occupied' && (
          <div className="mt-2 mb-3 bg-pink-50 rounded-lg p-2.5 border border-pink-100">
            {hasCart ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-coffee-medium">
                  <Utensils size={13} />
                  <span className="text-xs font-medium">{itemCount} món</span>
                </div>
                <span className="text-sm font-bold text-coffee-dark">
                  {total.toLocaleString('vi-VN')}đ
                </span>
              </div>
            ) : (
              <span className="text-xs text-coffee-light italic">Chưa gọi món</span>
            )}
            {table.occupiedSince && (
              <div className="flex items-center gap-1 mt-1">
                <Clock size={11} className="text-pink-400" />
                <span className="text-xs text-pink-500">Từ {table.occupiedSince}</span>
              </div>
            )}
          </div>
        )}

        {/* Available: spacer */}
        {table.status === 'available' && <div className="mb-3" />}

        {/* Dirty: info */}
        {table.status === 'dirty' && (
          <div className="mt-2 mb-3 text-xs text-yellow-700 italic">Cần dọn dẹp</div>
        )}

        {/* Action Button */}
        {isEditMode ? (
          <div className="flex gap-2">
            <button
              onClick={e => { e.stopPropagation(); onEdit(table); }}
              className="flex-1 min-h-[36px] py-1.5 bg-cream-light hover:bg-cream-medium text-coffee-dark text-xs font-bold rounded-lg border border-cream-medium/40 transition-all flex items-center justify-center gap-1"
            >
              <Edit size={12} />
              Sửa
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(table.id); }}
              className="flex-1 min-h-[36px] py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-lg border border-red-100 transition-all flex items-center justify-center gap-1"
            >
              <Trash2 size={12} />
              Xóa
            </button>
          </div>
        ) : table.status === 'dirty' ? (
          <button
            onClick={e => { e.stopPropagation(); onMarkClean(table.id); }}
            className={`min-h-[40px] w-full py-2 rounded-lg text-sm font-semibold transition-all ${s.btnClass}`}
          >
            {s.btnLabel}
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onGoToPOS(table); }}
            className={`min-h-[40px] w-full py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${s.btnClass}`}
          >
            {table.status === 'available' ? <Coffee size={14} /> : <ChevronRight size={14} />}
            {s.btnLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default function TablePage() {
  const { tables, updateTableStatus, createTable, updateTable, deleteTable } = useTable();
  const { setSelectedTable, tableCarts } = useCart();
  const { setView } = useUI();
  const [activeZone, setActiveZone] = useState('Tất cả');
  
  // States cho quản lý bàn
  const [isEditMode, setIsEditMode] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalTable, setModalTable] = useState(null); // null: thêm mới, table: chỉnh sửa
  const [formName, setFormName] = useState('');
  const [formZone, setFormZone] = useState('Tầng trệt');
  const [formCapacity, setFormCapacity] = useState(4);

  // Lấy động danh sách khu vực đang có trong database
  const zonesList = useMemo(() => {
    const list = new Set(tables.map(t => t.zone).filter(Boolean));
    if (list.size === 0) {
      return ['Tầng trệt', 'Lầu 1', 'Sân vườn'];
    }
    return Array.from(list);
  }, [tables]);

  const zones = useMemo(() => ['Tất cả', ...zonesList], [zonesList]);

  const filteredTables = activeZone === 'Tất cả' ? tables : tables.filter(t => t.zone === activeZone);

  const stats = {
    available: tables.filter(t => t.status === 'available').length,
    occupied:  tables.filter(t => t.status === 'occupied').length,
    dirty:     tables.filter(t => t.status === 'dirty').length,
  };

  const handleGoToPOS = useCallback((table) => {
    setSelectedTable(table.id);
    setView('pos');
  }, [setSelectedTable, setView]);

  const handleMarkClean = useCallback((tableId) => {
    updateTableStatus(tableId, 'available');
  }, [updateTableStatus]);

  // Luồng kích hoạt CRUD
  const handleAddClick = () => {
    setModalTable(null);
    setFormName('');
    setFormZone(zonesList[0] || 'Tầng trệt');
    setFormCapacity(4);
    setShowModal(true);
  };

  const handleEditClick = useCallback((table) => {
    setModalTable(table);
    setFormName(table.name);
    setFormZone(table.zone);
    setFormCapacity(table.capacity);
    setShowModal(true);
  }, []);

  const handleDeleteClick = useCallback(async (tableId) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa bàn này?')) {
      try {
        await deleteTable(tableId);
      } catch (err) {
        alert('Không thể xóa bàn: ' + (err.response?.data?.error || err.message));
      }
    }
  }, [deleteTable]);

  const handleSaveTable = async (e) => {
    e.preventDefault();
    if (!formName.trim() || !formZone.trim()) {
      alert('Vui lòng nhập đầy đủ thông tin bàn và khu vực.');
      return;
    }
    const payload = {
      name: formName,
      zone: formZone.trim(),
      capacity: Number(formCapacity) || 4,
    };
    try {
      if (modalTable) {
        await updateTable(modalTable.id, payload);
      } else {
        await createTable(payload);
      }
      setShowModal(false);
    } catch (err) {
      alert('Không thể lưu thông tin bàn: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="h-full flex flex-col bg-cream-warm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-cream-medium/60 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display font-bold text-2xl text-coffee-dark">Sơ đồ bàn</h1>
            <p className="text-coffee-light text-sm mt-0.5">Theo dõi trạng thái bàn và đơn đang phục vụ</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              className={`min-h-[36px] px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                isEditMode
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  : 'bg-coffee-accent/10 text-coffee-accent border-coffee-accent/20 hover:bg-coffee-accent/20'
              }`}
            >
              {isEditMode ? 'Thoát chỉnh sửa' : 'Chỉnh sửa sơ đồ'}
            </button>
            <div className="flex items-center gap-1.5 bg-cream-light px-3 py-1.5 rounded-lg text-xs text-coffee-medium">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-soft" />
              Đang đồng bộ
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { count: stats.available, label: 'Bàn trống',  color: 'bg-status-available text-status-availableText border-status-availableBorder', icon: <Sparkles size={18} /> },
            { count: stats.occupied,  label: 'Có khách',   color: 'bg-status-occupied text-status-occupiedText border-status-occupiedBorder', icon: <Users size={18} /> },
            { count: stats.dirty,     label: 'Chưa dọn',   color: 'bg-status-dirty text-status-dirtyText border-status-dirtyBorder', icon: <RefreshCw size={18} /> },
          ].map((s, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${s.color}`}>
              {s.icon}
              <div>
                <span className="text-2xl font-bold block leading-none">{s.count}</span>
                <span className="text-xs font-semibold opacity-80">{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Zone Filter */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
            <MapPin size={15} className="text-coffee-light flex-shrink-0" />
            <div className="flex gap-2">
              {zones.map(zone => (
                <button
                  key={zone}
                  onClick={() => setActiveZone(zone)}
                  className={`min-h-[36px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    activeZone === zone ? 'text-white shadow-coffee' : 'bg-cream-light text-coffee-medium hover:bg-cream-medium'
                  }`}
                  style={activeZone === zone ? { background: 'linear-gradient(135deg, #2563EB, #0EA5E9)' } : {}}
                >
                  {zone}
                </button>
              ))}
            </div>
          </div>
          {isEditMode && (
            <button
              type="button"
              onClick={handleAddClick}
              className="min-h-[36px] px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Plus size={14} />
              Thêm bàn mới
            </button>
          )}
        </div>
      </div>

      {/* Table Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Takeaway quick-access */}
        {!isEditMode && (
          <div className="mb-6">
            <div
              onClick={() => { setSelectedTable(null); setView('pos'); }}
              className="flex items-center gap-4 p-4 rounded-lg border-2 border-dashed border-coffee-accent/40 bg-white hover:bg-coffee-accent/5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="w-12 h-12 rounded-lg bg-coffee-accent/10 flex items-center justify-center flex-shrink-0">
                <ShoppingBag size={22} className="text-coffee-accent" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-coffee-dark">Mang về</p>
                <p className="text-sm text-coffee-light">Đơn hàng không gắn bàn</p>
              </div>
              <ChevronRight size={20} className="text-coffee-light" />
            </div>
          </div>
        )}

        {/* Empty state when there are no tables at all */}
        {tables.length === 0 && (
          <div className="bg-white rounded-lg border border-cream-medium/40 p-12 text-center max-w-md mx-auto mt-12 shadow-sm">
            <div className="w-16 h-16 rounded-lg bg-cream-light flex items-center justify-center mx-auto mb-4">
              <Coffee size={28} className="text-coffee-light" />
            </div>
            <h3 className="font-bold text-coffee-dark text-lg">Chưa có bàn nào</h3>
            <p className="text-coffee-light text-sm mt-1 leading-relaxed">
              Cửa hàng mới lập chưa có danh sách phòng bàn. Hãy chuyển sang <strong>Chế độ chỉnh sửa</strong> để bắt đầu thiết kế các khu vực và sơ đồ bàn của quán!
            </p>
            <button
              type="button"
              onClick={() => { setIsEditMode(true); handleAddClick(); }}
              className="mt-6 min-h-[44px] px-6 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-2 mx-auto active:scale-98 transition-all"
            >
              <Plus size={16} />
              Tạo bàn đầu tiên
            </button>
          </div>
        )}

        {(activeZone === 'Tất cả' ? zonesList : [activeZone]).map(zone => {
          const zoneTables = filteredTables.filter(t => t.zone === zone);
          if (zoneTables.length === 0) return null;
          return (
            <div key={zone} className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(135deg, #2563EB, #0EA5E9)' }} />
                <h2 className="font-display font-bold text-coffee-dark text-lg">{zone}</h2>
                <span className="text-coffee-light text-sm">({zoneTables.length} bàn)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {zoneTables.map(table => (
                  <TableCard
                    key={table.id}
                    table={table}
                    onGoToPOS={handleGoToPOS}
                    onMarkClean={handleMarkClean}
                    tableCarts={tableCarts}
                    isEditMode={isEditMode}
                    onEdit={handleEditClick}
                    onDelete={handleDeleteClick}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Table Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-fade-in" style={{ background: 'rgba(26,15,10,0.4)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-lg border border-cream-medium/40 shadow-coffee-lg w-full max-w-sm overflow-hidden animate-slide-up">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-cream-light flex justify-between items-center">
              <h3 className="font-bold text-coffee-dark text-base">
                {modalTable ? 'Sửa thông tin bàn' : 'Thêm bàn mới'}
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full bg-cream-light hover:bg-cream-medium flex items-center justify-center text-coffee-medium transition">
                <X size={16} />
              </button>
            </div>
            
            {/* Modal Form */}
            <form onSubmit={handleSaveTable} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-coffee-medium">Tên bàn (Ví dụ: Bàn 1, Bàn 102)</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Nhập tên bàn..."
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-cream-warm/10"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-coffee-medium">Khu vực / Tầng (Ví dụ: Tầng trệt, Lầu 1, VIP, Sân vườn)</label>
                <input
                  type="text"
                  required
                  value={formZone}
                  onChange={e => setFormZone(e.target.value)}
                  placeholder="Nhập khu vực..."
                  list="zone-suggestions"
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-cream-warm/10"
                />
                <datalist id="zone-suggestions">
                  {zonesList.map(z => <option key={z} value={z} />)}
                </datalist>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-coffee-medium">Số lượng chỗ ngồi</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={formCapacity}
                  onChange={e => setFormCapacity(e.target.value)}
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm rounded-lg border border-coffee-light/20 focus:outline-none focus:border-coffee-accent bg-cream-warm/10"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 min-h-[44px] bg-cream-light hover:bg-cream-medium text-coffee-dark font-bold text-sm rounded-lg border border-cream-medium/40 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[44px] bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm rounded-lg shadow-sm transition-all"
                >
                  Lưu lại
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
