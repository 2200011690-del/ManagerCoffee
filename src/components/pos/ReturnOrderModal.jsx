import { useState } from 'react';
import { Search, RotateCcw, X, AlertTriangle, CheckCircle, Banknote, CreditCard } from 'lucide-react';
import { api } from '../../api';

export default function ReturnOrderModal({ onClose, onSuccess }) {
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedItems, setSelectedItems] = useState({}); // { orderItemId: { orderItemName, price, qty } }
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(null);

  const handleSearch = async () => {
    if (!orderNumber.trim()) return;
    setLoading(true);
    setError('');
    setOrder(null);
    setSelectedItems({});
    try {
      const searchTerm = orderNumber.startsWith('#') ? orderNumber : `#${orderNumber}`;
      const data = await api.get(`/orders/search/${encodeURIComponent(searchTerm)}`);
      setOrder(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Không tìm thấy hóa đơn');
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (item) => {
    const maxReturnQty = item.qty - (item.returnedQty || 0);
    if (maxReturnQty <= 0) return;
    setSelectedItems(prev => {
      const current = prev[item.id];
      if (current) {
        const { [item.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [item.id]: { orderItemId: item.id, orderItemName: item.name, qty: maxReturnQty, price: item.price } };
    });
  };

  const updateReturnQty = (orderItemId, qty) => {
    setSelectedItems(prev => ({
      ...prev,
      [orderItemId]: { ...prev[orderItemId], qty: Math.max(1, qty) }
    }));
  };

  const refundAmount = Object.entries(selectedItems).reduce(
    (sum, [, val]) => sum + val.price * val.qty, 0
  );

  const handleReturn = async () => {
    if (Object.keys(selectedItems).length === 0) return;
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do trả hàng');
      return;
    }
    setProcessing(true);
    setError('');
    try {
      const items = Object.values(selectedItems).map((val) => ({
        orderItemId: val.orderItemId,
        orderItemName: val.orderItemName,
        price: val.price,
        qty: val.qty,
        reason
      }));
      const result = await api.post(`/orders/${order.id}/return`, {
        items,
        reason,
        refundMethod,
        employeeId: null // Will use current user from context
      });
      setSuccess(result);
      onSuccess?.(result);
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi khi xử lý trả hàng');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(26,15,10,0.65)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-lg shadow-coffee-lg w-full max-w-lg animate-slide-up max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-cream-medium/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <RotateCcw size={20} className="text-red-500" />
            </div>
            <div>
              <h3 className="font-display font-bold text-coffee-dark">Trả hàng / Hoàn tiền</h3>
              <p className="text-xs text-coffee-light">Tìm hóa đơn để trả hàng</p>
            </div>
          </div>
          <button onClick={onClose} className="min-w-[36px] min-h-[36px] rounded-lg bg-cream-light flex items-center justify-center text-coffee-medium hover:bg-cream-medium transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {success ? (
            // Success state
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 mx-auto mb-4 flex items-center justify-center">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h4 className="font-bold text-lg text-coffee-dark mb-1">Trả hàng thành công!</h4>
              <p className="text-sm text-coffee-light mb-2">Mã trả hàng: <span className="font-mono font-bold text-coffee-accent">{success.returnNumber}</span></p>
              <p className="text-sm text-coffee-medium">Hoàn tiền: <span className="font-bold text-green-600">{success.refundAmount?.toLocaleString('vi-VN')}đ</span> ({refundMethod === 'cash' ? 'Tiền mặt' : 'Thẻ/QR'})</p>
              <button onClick={onClose} className="mt-6 min-h-[44px] btn-primary px-8">Đóng</button>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Nhập mã hóa đơn (vd: HD1001)"
                    className="input-field pl-9 w-full min-h-[44px] text-sm font-mono"
                    autoFocus
                  />
                </div>
                <button onClick={handleSearch} disabled={loading} className="btn-primary min-h-[44px] px-4 text-sm">
                  {loading ? '...' : 'Tìm'}
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Order details */}
              {order && (
                <>
                  <div className="bg-cream-light/60 rounded-lg p-4 border border-cream-medium/30">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-mono font-bold text-coffee-accent">{order.orderNumber}</span>
                      <span className="text-xs text-coffee-light">{order.date} · {order.time}</span>
                    </div>
                    <div className="flex justify-between text-xs text-coffee-medium">
                      <span>{order.tableName}</span>
                      <span className="font-bold">{order.total?.toLocaleString('vi-VN')}đ</span>
                    </div>
                    {order.employee && (
                      <p className="text-[10px] text-coffee-light mt-1">NV: {order.employee.name}</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-bold text-coffee-dark uppercase tracking-wider mb-2">Chọn sản phẩm trả:</p>
                    <div className="space-y-2">
                      {order.items.map(item => {
                        const maxReturnQty = item.qty - (item.returnedQty || 0);
                        const isSelected = !!selectedItems[item.id];
                        const isFullyReturned = maxReturnQty <= 0;
                        return (
                          <div key={item.id}
                            onClick={() => !isFullyReturned && toggleItem(item)}
                            className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                              isFullyReturned ? 'opacity-40 cursor-not-allowed border-gray-200' :
                              isSelected ? 'border-red-300 bg-red-50' : 'border-cream-dark hover:border-red-200'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300'
                            }`}>
                              {isSelected && <CheckCircle size={12} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-coffee-dark truncate">{item.name}</p>
                              <p className="text-xs text-coffee-light">SL: {item.qty} · Đã trả: {item.returnedQty || 0}</p>
                            </div>
                            {isSelected && (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <button onClick={() => updateReturnQty(item.id, selectedItems[item.id].qty - 1)}
                                  className="w-7 h-7 rounded bg-red-100 flex items-center justify-center text-red-600">
                                  <span className="text-xs font-bold">−</span>
                                </button>
                                <span className="w-6 text-center text-xs font-bold">{selectedItems[item.id].qty}</span>
                                <button onClick={() => updateReturnQty(item.id, Math.min(selectedItems[item.id].qty + 1, maxReturnQty))}
                                  className="w-7 h-7 rounded bg-red-100 flex items-center justify-center text-red-600">
                                  <span className="text-xs font-bold">+</span>
                                </button>
                              </div>
                            )}
                            <span className="text-sm font-bold text-coffee-accent flex-shrink-0">
                              {(item.price * (isSelected ? selectedItems[item.id].qty : item.qty)).toLocaleString('vi-VN')}đ
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {Object.keys(selectedItems).length > 0 && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-coffee-medium uppercase tracking-wider mb-1.5">
                          Lý do trả hàng <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          rows={2}
                          value={reason}
                          onChange={e => setReason(e.target.value)}
                          placeholder="Nhập lý do trả hàng..."
                          className="input-field w-full text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-coffee-medium uppercase tracking-wider mb-1.5">Phương thức hoàn tiền</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => setRefundMethod('cash')}
                            className={`min-h-[40px] flex items-center justify-center gap-2 rounded-lg text-sm font-semibold border-2 transition-all ${
                              refundMethod === 'cash' ? 'border-coffee-accent bg-coffee-accent/10 text-coffee-accent' : 'border-cream-dark text-coffee-light'
                            }`}>
                            <Banknote size={16} /> Tiền mặt
                          </button>
                          <button onClick={() => setRefundMethod('card')}
                            className={`min-h-[40px] flex items-center justify-center gap-2 rounded-lg text-sm font-semibold border-2 transition-all ${
                              refundMethod === 'card' ? 'border-coffee-accent bg-coffee-accent/10 text-coffee-accent' : 'border-cream-dark text-coffee-light'
                            }`}>
                            <CreditCard size={16} /> Thẻ / QR
                          </button>
                        </div>
                      </div>

                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex justify-between text-sm font-bold text-red-800">
                          <span>Tổng hoàn tiền:</span>
                          <span className="text-lg">{refundAmount.toLocaleString('vi-VN')}đ</span>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && order && Object.keys(selectedItems).length > 0 && (
          <div className="px-6 py-4 border-t border-cream-medium/50 flex gap-3">
            <button onClick={onClose} className="flex-1 min-h-[44px] btn-secondary">Hủy</button>
            <button onClick={handleReturn} disabled={processing}
              className="flex-[2] min-h-[44px] bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2">
              <RotateCcw size={18} />
              {processing ? 'Đang xử lý...' : 'Xác nhận trả hàng'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
