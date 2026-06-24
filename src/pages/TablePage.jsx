import { useState, useCallback } from 'react';
import { Users, Coffee, Sparkles, Clock, MapPin, RefreshCw, CheckCircle, ShoppingBag, Utensils, ChevronRight } from 'lucide-react';
import { useTable } from '../context/TableContext';
import { useCart } from '../context/CartContext';
import { useUI } from '../context/UIContext';

const zones = ['Tất cả', 'Tầng trệt', 'Lầu 1', 'Sân vườn'];

// Hàm tính total từ giỏ hàng của bàn
function calcTableTotal(cartItems = []) {
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  return Math.round(subtotal * 1.08); // with VAT
}
function calcTableItemCount(cartItems = []) {
  return cartItems.reduce((s, i) => s + i.qty, 0);
}

function TableCard({ table, onGoToPOS, onMarkClean, tableCarts }) {
  const cartItems = tableCarts[table.id] ?? [];
  const total = calcTableTotal(cartItems);
  const itemCount = calcTableItemCount(cartItems);
  const hasCart = cartItems.length > 0;

  // --- Styles theo trạng thái ---
  const styles = {
    available: {
      border: 'border-green-200',
      bg: 'bg-white hover:bg-green-50/60',
      topBar: 'bg-gradient-to-r from-green-400 to-emerald-500',
      badge: 'bg-green-100 text-green-700',
      label: 'Trống',
      icon: <Sparkles size={14} className="text-green-500" />,
      btnLabel: 'Mở bàn',
      btnClass: 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600',
    },
    occupied: {
      border: 'border-pink-200',
      bg: 'bg-white hover:bg-pink-50/40',
      topBar: 'bg-gradient-to-r from-pink-400 to-rose-500',
      badge: 'bg-pink-100 text-pink-700',
      label: 'Có khách',
      icon: <Users size={14} className="text-pink-500" />,
      btnLabel: 'Gọi thêm / Thu tiền',
      btnClass: 'bg-gradient-to-r from-coffee-accent to-amber-600 text-white hover:from-amber-600 hover:to-amber-700',
    },
    dirty: {
      border: 'border-yellow-200',
      bg: 'bg-yellow-50/60 hover:bg-yellow-100/60',
      topBar: 'bg-gradient-to-r from-yellow-400 to-amber-400',
      badge: 'bg-yellow-100 text-yellow-700',
      label: 'Chưa dọn',
      icon: <RefreshCw size={14} className="text-yellow-600" />,
      btnLabel: '✅ Đã dọn xong',
      btnClass: 'bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-200',
    },
  };

  const s = styles[table.status];

  const handleClick = () => {
    if (table.status === 'dirty') return; // dirty: no click to POS
    onGoToPOS(table);
  };

  return (
    <div
      onClick={handleClick}
      className={`relative rounded-2xl border-2 overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${s.border} ${s.bg} ${table.status === 'dirty' ? 'cursor-default' : 'hover:-translate-y-0.5'}`}
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
          <div className="mt-2 mb-3 bg-pink-50 rounded-xl p-2.5 border border-pink-100">
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
        {table.status === 'dirty' ? (
          <button
            onClick={e => { e.stopPropagation(); onMarkClean(table.id); }}
            className={`min-h-[40px] w-full py-2 rounded-xl text-sm font-semibold transition-all ${s.btnClass}`}
          >
            {s.btnLabel}
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onGoToPOS(table); }}
            className={`min-h-[40px] w-full py-2 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${s.btnClass}`}
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
  const { tables, updateTableStatus } = useTable();
  const { setSelectedTable, tableCarts } = useCart();
  const { setView } = useUI();
  const [activeZone, setActiveZone] = useState('Tất cả');

  const filteredTables = activeZone === 'Tất cả' ? tables : tables.filter(t => t.zone === activeZone);

  const stats = {
    available: tables.filter(t => t.status === 'available').length,
    occupied:  tables.filter(t => t.status === 'occupied').length,
    dirty:     tables.filter(t => t.status === 'dirty').length,
  };

  // Click vào bàn → vào POS NGAY (như KiotViet/Sapo)
  const handleGoToPOS = useCallback((table) => {
    setSelectedTable(table.id);
    setView('pos');
  }, [setSelectedTable, setView]);

  const handleMarkClean = useCallback((tableId) => {
    updateTableStatus(tableId, 'available');
  }, [updateTableStatus]);

  return (
    <div className="h-full flex flex-col bg-cream-warm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-cream-medium/60 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display font-bold text-2xl text-coffee-dark">Sơ đồ bàn</h1>
            <p className="text-coffee-light text-sm mt-0.5">Bấm vào bàn để gọi món hoặc thu tiền</p>
          </div>
          <div className="flex items-center gap-1.5 bg-cream-light px-3 py-1.5 rounded-xl text-xs text-coffee-medium">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-soft" />
            Realtime
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { count: stats.available, label: 'Bàn trống',  color: 'bg-status-available text-status-availableText border-status-availableBorder', icon: <Sparkles size={18} /> },
            { count: stats.occupied,  label: 'Có khách',   color: 'bg-status-occupied text-status-occupiedText border-status-occupiedBorder', icon: <Users size={18} /> },
            { count: stats.dirty,     label: 'Chưa dọn',   color: 'bg-status-dirty text-status-dirtyText border-status-dirtyBorder', icon: <RefreshCw size={18} /> },
          ].map((s, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${s.color}`}>
              {s.icon}
              <div>
                <span className="text-2xl font-bold block leading-none">{s.count}</span>
                <span className="text-xs font-semibold opacity-80">{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Zone Filter */}
        <div className="flex items-center gap-2">
          <MapPin size={15} className="text-coffee-light flex-shrink-0" />
          <div className="flex gap-2 flex-wrap">
            {zones.map(zone => (
              <button
                key={zone}
                onClick={() => setActiveZone(zone)}
                className={`min-h-[36px] px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                  activeZone === zone ? 'text-white shadow-coffee' : 'bg-cream-light text-coffee-medium hover:bg-cream-medium'
                }`}
                style={activeZone === zone ? { background: 'linear-gradient(135deg, #A76D42, #C8956C)' } : {}}
              >
                {zone}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Takeaway quick-access */}
        <div className="mb-6">
          <div
            onClick={() => { setSelectedTable(null); setView('pos'); }}
            className="flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-coffee-accent/40 bg-white hover:bg-coffee-accent/5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="w-12 h-12 rounded-xl bg-coffee-accent/10 flex items-center justify-center flex-shrink-0">
              <ShoppingBag size={22} className="text-coffee-accent" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-coffee-dark">Mang về / Takeaway</p>
              <p className="text-sm text-coffee-light">Đơn hàng không gắn bàn</p>
            </div>
            <ChevronRight size={20} className="text-coffee-light" />
          </div>
        </div>

        {(activeZone === 'Tất cả' ? ['Tầng trệt', 'Lầu 1', 'Sân vườn'] : [activeZone]).map(zone => {
          const zoneTables = filteredTables.filter(t => t.zone === zone);
          if (zoneTables.length === 0) return null;
          return (
            <div key={zone} className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }} />
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
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
