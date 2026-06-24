import { useState } from 'react';
import { X, CheckCircle, SplitSquareVertical } from 'lucide-react';

export default function SplitBillModal({ cart, onClose, onConfirmSplit }) {
  // state to track how many of each item is selected to be split
  const [splitCounts, setSplitCounts] = useState({});

  const handleIncrement = (cartItemId, maxQty) => {
    setSplitCounts(prev => {
      const current = prev[cartItemId] || 0;
      if (current >= maxQty) return prev;
      return { ...prev, [cartItemId]: current + 1 };
    });
  };

  const handleDecrement = (cartItemId) => {
    setSplitCounts(prev => {
      const current = prev[cartItemId] || 0;
      if (current <= 0) return prev;
      return { ...prev, [cartItemId]: current - 1 };
    });
  };

  const handleSelectAll = (cartItemId, qty) => {
    setSplitCounts(prev => ({ ...prev, [cartItemId]: qty }));
  };

  const selectedItems = cart.filter(item => splitCounts[item.cartItemId] > 0).map(item => ({
    ...item,
    qty: splitCounts[item.cartItemId]
  }));

  const VAT_RATE = 0.08;
  const splitSubtotal = selectedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const splitVatAmount = Math.round(splitSubtotal * VAT_RATE);
  const splitTotal = splitSubtotal + splitVatAmount;
  const splitCount = selectedItems.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(26,15,10,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="px-6 py-4 border-b border-cream-medium/50 flex items-center justify-between bg-cream-light/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-coffee-accent/10 flex items-center justify-center text-coffee-accent">
              <SplitSquareVertical size={20} />
            </div>
            <div>
              <h2 className="font-display font-bold text-coffee-dark text-lg">Tách đơn thanh toán</h2>
              <p className="text-coffee-medium text-xs">Chọn số lượng các món cần thanh toán riêng</p>
            </div>
          </div>
          <button onClick={onClose} className="min-w-[40px] min-h-[40px] rounded-full bg-cream-light flex items-center justify-center text-coffee-medium hover:bg-cream-medium transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {cart.map(item => {
            const selectedQty = splitCounts[item.cartItemId] || 0;
            const remainingQty = item.qty - selectedQty;
            return (
              <div key={item.cartItemId} className="flex items-center justify-between p-3 rounded-xl border border-cream-medium/40 bg-white">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="font-semibold text-coffee-dark truncate">{item.name}</p>
                  <p className="text-coffee-light text-xs mt-0.5">{item.price.toLocaleString('vi-VN')}đ / món (Tổng: {item.qty})</p>
                </div>
                
                <div className="flex items-center gap-3">
                  <button onClick={() => handleSelectAll(item.cartItemId, item.qty)} className="text-xs text-coffee-accent font-semibold px-2 py-1 bg-coffee-accent/10 rounded-lg hover:bg-coffee-accent/20">
                    Chọn hết
                  </button>
                  <div className="flex items-center gap-3 bg-cream-light rounded-xl p-1 border border-cream-medium/30">
                    <button 
                      onClick={() => handleDecrement(item.cartItemId)}
                      disabled={selectedQty === 0}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-white shadow-sm text-coffee-dark disabled:opacity-40 disabled:shadow-none transition-all"
                    >-</button>
                    <span className="w-4 text-center font-bold text-coffee-dark text-sm">{selectedQty}</span>
                    <button 
                      onClick={() => handleIncrement(item.cartItemId, item.qty)}
                      disabled={selectedQty === item.qty}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-white shadow-sm text-coffee-dark disabled:opacity-40 disabled:shadow-none transition-all"
                    >+</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-cream-medium/50 bg-cream-light/30">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-coffee-medium text-sm mb-1">Tạm tính ({splitCount} món): {splitSubtotal.toLocaleString('vi-VN')}đ</p>
              <p className="text-coffee-medium text-sm">VAT (8%): {splitVatAmount.toLocaleString('vi-VN')}đ</p>
            </div>
            <div className="text-right">
              <p className="text-coffee-medium text-xs mb-1">Thành tiền</p>
              <p className="text-2xl font-bold text-coffee-accent">{splitTotal.toLocaleString('vi-VN')}đ</p>
            </div>
          </div>
          
          <button 
            onClick={() => onConfirmSplit(selectedItems, splitSubtotal, splitVatAmount, splitTotal)}
            disabled={splitCount === 0}
            className="w-full min-h-[48px] btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle size={20} />
            Thanh toán phần tách
          </button>
        </div>
      </div>
    </div>
  );
}
