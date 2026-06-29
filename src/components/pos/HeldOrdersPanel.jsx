import { useState, useEffect } from 'react';
import { Pause, Play, Clock, X, Package, Trash2 } from 'lucide-react';
import { api } from '../../api';

export default function HeldOrdersPanel({ onClose, onRecall }) {
  const [heldOrders, setHeldOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHeldOrders();
  }, []);

  const fetchHeldOrders = async () => {
    try {
      const data = await api.get('/held-orders');
      setHeldOrders(data);
    } catch (err) {
      console.error('Error fetching held orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa đơn tạm giữ này?')) return;
    try {
      await api.delete(`/held-orders/${id}`);
      setHeldOrders(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      console.error('Error deleting held order:', err);
    }
  };

  const handleRecall = (held) => {
    onRecall(held);
    handleDelete(held.id);
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} giờ trước`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(26,15,10,0.55)', backdropFilter: 'blur(5px)' }}>
      <div className="bg-white rounded-3xl shadow-coffee-lg w-full max-w-md animate-slide-up max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-cream-medium/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Pause size={20} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-display font-bold text-coffee-dark">Đơn tạm giữ</h3>
              <p className="text-xs text-coffee-light">{heldOrders.length} đơn đang chờ</p>
            </div>
          </div>
          <button onClick={onClose} className="min-w-[36px] min-h-[36px] rounded-lg bg-cream-light flex items-center justify-center text-coffee-medium hover:bg-cream-medium transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="text-center py-12 text-coffee-light text-sm">Đang tải...</div>
          ) : heldOrders.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-cream-light mx-auto mb-3 flex items-center justify-center">
                <Package size={24} className="text-coffee-light" />
              </div>
              <p className="text-sm text-coffee-light font-medium">Không có đơn tạm giữ</p>
              <p className="text-xs text-coffee-light/60 mt-1">Bấm "Giữ đơn" để lưu giỏ hàng tạm thời</p>
            </div>
          ) : (
            <div className="space-y-3">
              {heldOrders.map(held => {
                const totalQty = held.items.reduce((s, i) => s + i.qty, 0);
                const totalPrice = held.items.reduce((s, i) => s + i.price * i.qty, 0);
                return (
                  <div key={held.id} className="bg-cream-light/50 rounded-2xl border border-cream-medium/30 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-coffee-dark">{held.tableName}</span>
                        {held.employeeName && (
                          <span className="text-[10px] text-coffee-light bg-cream-medium px-1.5 py-0.5 rounded-md">
                            {held.employeeName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-coffee-light">
                        <Clock size={10} />
                        {timeAgo(held.createdAt)}
                      </div>
                    </div>
                    {held.note && (
                      <p className="text-xs text-coffee-accent italic mb-2">"{held.note}"</p>
                    )}
                    <div className="space-y-1 mb-3">
                      {held.items.slice(0, 3).map((item, i) => (
                        <div key={i} className="flex justify-between text-xs text-coffee-medium">
                          <span className="truncate flex-1">{item.name} x{item.qty}</span>
                          <span className="font-mono">{(item.price * item.qty).toLocaleString('vi-VN')}đ</span>
                        </div>
                      ))}
                      {held.items.length > 3 && (
                        <p className="text-[10px] text-coffee-light">+{held.items.length - 3} sản phẩm khác...</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-cream-medium/40">
                      <span className="text-xs text-coffee-medium">{totalQty} món · <span className="font-bold text-coffee-accent">{totalPrice.toLocaleString('vi-VN')}đ</span></span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleDelete(held.id)}
                          className="min-w-[32px] min-h-[32px] rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors"
                          title="Xóa"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          onClick={() => handleRecall(held)}
                          className="min-h-[32px] px-3 rounded-lg flex items-center justify-center gap-1 text-xs font-bold text-white transition-all"
                          style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}
                        >
                          <Play size={12} />
                          Thu hồi
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
