import { useState } from 'react';
import { X, Banknote, CreditCard, Smartphone, CheckCircle } from 'lucide-react';

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Tiền mặt', icon: Banknote, color: 'text-green-600 bg-green-50 border-green-200' },
  { id: 'card', label: 'Thẻ ngân hàng', icon: CreditCard, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'transfer', label: 'Chuyển khoản', icon: CreditCard, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { id: 'momo', label: 'MoMo', icon: Smartphone, color: 'text-pink-600 bg-pink-50 border-pink-200' },
  { id: 'zalopay', label: 'ZaloPay', icon: Smartphone, color: 'text-blue-500 bg-blue-50 border-blue-200' },
];

export default function SplitPaymentModal({ total, onClose, onConfirm }) {
  const [payments, setPayments] = useState([
    { method: 'cash', amount: total, reference: '' }
  ]);

  const addPayment = (method) => {
    if (payments.find(p => p.method === method)) return;
    setPayments(prev => [...prev, { method, amount: 0, reference: '' }]);
  };

  const removePayment = (idx) => {
    if (payments.length <= 1) return;
    setPayments(prev => prev.filter((_, i) => i !== idx));
  };

  const updatePayment = (idx, field, value) => {
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = total - totalPaid;
  const isValid = Math.abs(remaining) < 1; // Allow 1đ rounding

  // Auto-fill remaining to first empty payment
  const autoFillRemaining = () => {
    const emptyIdx = payments.findIndex(p => !p.amount || Number(p.amount) === 0);
    if (emptyIdx >= 0 && remaining > 0) {
      updatePayment(emptyIdx, 'amount', remaining);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(26,15,10,0.65)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-lg shadow-coffee-lg w-full max-w-md p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display font-bold text-lg text-coffee-dark">Thanh toán kết hợp</h3>
            <p className="text-xs text-coffee-light">Chia thanh toán theo nhiều phương thức</p>
          </div>
          <button onClick={onClose} className="min-w-[36px] min-h-[36px] rounded-lg bg-cream-light flex items-center justify-center text-coffee-medium hover:bg-cream-medium transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Total */}
        <div className="bg-cream-light/60 rounded-lg p-4 mb-4 text-center border border-cream-medium/30">
          <p className="text-xs text-coffee-light uppercase tracking-wider mb-1">Tổng cần thanh toán</p>
          <p className="text-2xl font-bold text-coffee-accent font-mono">{total.toLocaleString('vi-VN')}đ</p>
        </div>

        {/* Payment entries */}
        <div className="space-y-3 mb-4">
          {payments.map((payment, idx) => {
            const methodConfig = PAYMENT_METHODS.find(m => m.id === payment.method);
            const Icon = methodConfig?.icon || Banknote;
            return (
              <div key={idx} className={`rounded-lg border-2 p-3 ${methodConfig?.color || 'border-cream-dark'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon size={16} />
                    <span className="text-sm font-semibold">{methodConfig?.label}</span>
                  </div>
                  {payments.length > 1 && (
                    <button onClick={() => removePayment(idx)} className="text-xs text-red-400 hover:text-red-600 underline">Xóa</button>
                  )}
                </div>
                <input
                  type="number"
                  value={payment.amount || ''}
                  onChange={e => updatePayment(idx, 'amount', e.target.value)}
                  placeholder="Nhập số tiền..."
                  className="w-full px-3 py-2 rounded-lg border border-current/20 bg-white text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-coffee-accent/30"
                />
                {(payment.method !== 'cash') && (
                  <input
                    type="text"
                    value={payment.reference}
                    onChange={e => updatePayment(idx, 'reference', e.target.value)}
                    placeholder="Mã giao dịch (tùy chọn)..."
                    className="w-full px-3 py-1.5 rounded-lg border border-current/10 bg-white/70 text-xs mt-1.5 focus:outline-none"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Add method buttons */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {PAYMENT_METHODS.filter(m => !payments.find(p => p.method === m.id)).map(method => (
            <button
              key={method.id}
              onClick={() => addPayment(method.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-cream-dark text-xs text-coffee-medium hover:border-coffee-accent hover:text-coffee-accent transition-all"
            >
              <method.icon size={12} />
              + {method.label}
            </button>
          ))}
        </div>

        {/* Remaining */}
        <div className={`rounded-lg p-3 mb-4 flex items-center justify-between text-sm font-bold ${
          isValid ? 'bg-green-50 border border-green-200 text-green-800' :
          remaining > 0 ? 'bg-amber-50 border border-amber-200 text-amber-800' :
          'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <span>{remaining > 0 ? 'Còn thiếu:' : remaining < 0 ? 'Thanh toán thừa:' : 'Đã đủ'}</span>
          {!isValid && <span className="font-mono">{Math.abs(remaining).toLocaleString('vi-VN')}đ</span>}
          {isValid && <CheckCircle size={18} className="text-green-600" />}
        </div>

        {remaining > 0 && (
          <button onClick={autoFillRemaining} className="w-full text-xs text-coffee-accent hover:underline mb-3 text-center">
            Tự động điền số tiền còn lại
          </button>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 min-h-[44px] btn-secondary">Hủy</button>
          <button
            onClick={() => onConfirm(payments.filter(p => Number(p.amount) > 0))}
            disabled={!isValid}
            className={`flex-[2] min-h-[44px] btn-primary font-bold ${!isValid ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Xác nhận thanh toán
          </button>
        </div>
      </div>
    </div>
  );
}
