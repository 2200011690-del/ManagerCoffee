import { useState } from 'react';
import { Users, Coffee, Sparkles, Clock, ChevronDown, MapPin, RefreshCw } from 'lucide-react';
import { useTable } from '../context/TableContext';
import { useCart } from '../context/CartContext';
import { useUI } from '../context/UIContext';

const STATUS_CONFIG = {
  available: { label: 'Trống', cardClass: 'table-card-available', badgeClass: 'badge-available', icon: Sparkles },
  occupied:  { label: 'Có khách', cardClass: 'table-card-occupied', badgeClass: 'badge-occupied', icon: Users },
  dirty:     { label: 'Chưa dọn', cardClass: 'table-card-dirty', badgeClass: 'badge-dirty', icon: RefreshCw },
};

const STATUS_CYCLE = { available: 'occupied', occupied: 'dirty', dirty: 'available' };
const STATUS_ACTIONS = { available: 'Ngồi vào bàn', occupied: 'Dọn xong → Trống', dirty: 'Đã dọn xong' };
const zones = ['Tất cả', 'Tầng trệt', 'Lầu 1', 'Sân vườn'];

function TableCard({ table, onStatusChange, onSelect, isSelected, hasCart }) {
  const config = STATUS_CONFIG[table.status];
  const Icon = config.icon;

  return (
    <div
      onClick={() => onSelect(table)}
      className={`relative rounded-2xl p-4 cursor-pointer transition-all duration-200 border-2 hover:shadow-card-hover hover:-translate-y-0.5 ${config.cardClass} ${
        isSelected ? 'ring-2 ring-offset-2 ring-coffee-accent scale-[1.02]' : ''
      }`}
    >
      {/* Cart indicator dot */}
      {hasCart && (
        <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-coffee-accent animate-pulse shadow-md" title="Có món trong giỏ" />
      )}

      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-base leading-tight">{table.name}</h3>
          <div className="flex items-center gap-1 mt-0.5">
            <Users size={11} className="opacity-60" />
            <span className="text-xs opacity-70">{table.capacity} chỗ</span>
          </div>
        </div>
        <div className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl flex items-center justify-center ${
          table.status === 'available' ? 'bg-green-200/60' :
          table.status === 'occupied' ? 'bg-pink-200/60' : 'bg-yellow-200/60'
        }`}>
          <Icon size={20} className="opacity-80" />
        </div>
      </div>

      <span className={config.badgeClass}>{config.label}</span>

      {table.status === 'occupied' && table.occupiedSince && (
        <div className="flex items-center gap-1 mt-2">
          <Clock size={11} className="opacity-60" />
          <span className="text-xs opacity-70">Từ {table.occupiedSince}</span>
        </div>
      )}

      <button
        onClick={e => { e.stopPropagation(); onStatusChange(table.id, STATUS_CYCLE[table.status]); }}
        className={`min-h-[44px] w-full mt-3 py-1.5 rounded-xl text-sm font-semibold border transition-all duration-150 hover:opacity-80 ${
          table.status === 'available' ? 'border-green-400/50 hover:bg-green-100/50' :
          table.status === 'occupied' ? 'border-pink-400/50 hover:bg-pink-100/50' :
          'border-yellow-400/50 hover:bg-yellow-100/50'
        }`}
      >
        {STATUS_ACTIONS[table.status]}
      </button>
    </div>
  );
}

export default function TablePage() {
  const { tables, updateTableStatus } = useTable();
  const { setSelectedTable, setView: _setView } = useCart(); // not using _setView - just setSelectedTable
  const { setView } = useUI();
  const { tableHasCart } = useCart();
  const [activeZone, setActiveZone] = useState('Tất cả');
  const [selectedTableDetail, setSelectedTableDetail] = useState(null);

  const filteredTables = activeZone === 'Tất cả' ? tables : tables.filter(t => t.zone === activeZone);

  const stats = {
    available: tables.filter(t => t.status === 'available').length,
    occupied:  tables.filter(t => t.status === 'occupied').length,
    dirty:     tables.filter(t => t.status === 'dirty').length,
  };

  const handleTableClick = (table) => {
    setSelectedTableDetail(prev => prev?.id === table.id ? null : table);
  };

  // Navigate to POS for this table
  const handleGoToPOS = (table) => {
    // If table is available => set it occupied first
    if (table.status === 'available') {
      updateTableStatus(table.id, 'occupied');
    }
    setSelectedTable(table.id);
    setView('pos');
  };

  return (
    <div className="h-full flex flex-col bg-cream-warm overflow-hidden">
      {/* Top Header */}
      <div className="px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-cream-medium/60 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display font-bold text-2xl text-coffee-dark">Sơ đồ bàn</h1>
            <p className="text-coffee-light text-sm mt-0.5">Quản lý trạng thái bàn theo thời gian thực</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-cream-light px-3 py-1.5 rounded-xl text-xs text-coffee-medium">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-soft" />
              Đang cập nhật
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { status: 'available', count: stats.available, label: 'Bàn trống', color: 'bg-status-available text-status-availableText border-status-availableBorder' },
            { status: 'occupied',  count: stats.occupied,  label: 'Có khách',  color: 'bg-status-occupied text-status-occupiedText border-status-occupiedBorder' },
            { status: 'dirty',     count: stats.dirty,     label: 'Chưa dọn',  color: 'bg-status-dirty text-status-dirtyText border-status-dirtyBorder' },
          ].map(s => (
            <div key={s.status} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${s.color}`}>
              <span className="text-2xl font-bold">{s.count}</span>
              <span className="text-sm font-semibold">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Zone Filter */}
        <div className="flex items-center gap-2">
          <MapPin size={15} className="text-coffee-light" />
          <div className="flex gap-2">
            {zones.map(zone => (
              <button
                key={zone}
                onClick={() => setActiveZone(zone)}
                className={`min-h-[44px] px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {zoneTables.map(table => (
                  <TableCard
                    key={table.id}
                    table={table}
                    onStatusChange={updateTableStatus}
                    onSelect={handleTableClick}
                    isSelected={selectedTableDetail?.id === table.id}
                    hasCart={tableHasCart(table.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Table Detail Panel */}
      {selectedTableDetail && (
        <div className="flex-shrink-0 bg-white border-t border-cream-medium/50 shadow-coffee-lg animate-slide-up">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h3 className="font-display font-bold text-coffee-dark text-lg">{selectedTableDetail.name}</h3>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className={STATUS_CONFIG[selectedTableDetail.status].badgeClass}>
                    {STATUS_CONFIG[selectedTableDetail.status].label}
                  </span>
                  <span className="text-coffee-light text-sm flex items-center gap-1">
                    <MapPin size={12} />
                    {selectedTableDetail.zone}
                  </span>
                  <span className="text-coffee-light text-sm flex items-center gap-1">
                    <Users size={12} />
                    {selectedTableDetail.capacity} chỗ
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedTableDetail.status !== 'dirty' && (
                <button
                  onClick={() => handleGoToPOS(selectedTableDetail)}
                  className="min-h-[44px] btn-primary flex items-center gap-2"
                >
                  <Coffee size={16} />
                  {selectedTableDetail.status === 'available' ? 'Gọi món (Mở bàn)' : 'Gọi thêm món'}
                </button>
              )}
              <button
                onClick={() => setSelectedTableDetail(null)}
                className="min-h-[44px] btn-secondary p-2"
              >
                <ChevronDown size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
