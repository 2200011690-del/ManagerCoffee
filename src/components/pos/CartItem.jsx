import { useState } from 'react';
import { Minus, Plus, Trash2, Percent, Tag } from 'lucide-react';

export default function CartItem({ item, onRemove, onUpdateQty, onApplyDiscount }) {
  const [showDiscountPopup, setShowDiscountPopup] = useState(false);
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState('PERCENT');

  const itemTotal = item.price * item.qty;
  const discountAmt = item.discount || 0;
  const finalPrice = itemTotal - discountAmt;

  const handleApplyDiscount = () => {
    const val = Number(discountValue);
    if (!val || val <= 0) {
      // Remove discount
      onApplyDiscount?.(item.cartItemId, 0, null);
      setShowDiscountPopup(false);
      setDiscountValue('');
      return;
    }

    let amount = 0;
    if (discountType === 'PERCENT') {
      amount = Math.round(itemTotal * (val / 100));
    } else {
      amount = val;
    }
    // Cap discount to item total
    if (amount > itemTotal) amount = itemTotal;
    onApplyDiscount?.(item.cartItemId, amount, discountType);
    setShowDiscountPopup(false);
    setDiscountValue('');
  };

  const handleRemoveDiscount = () => {
    onApplyDiscount?.(item.cartItemId, 0, null);
  };

  return (
    <div className="relative flex items-start gap-3 py-3 border-b border-cream-medium/50 last:border-0 animate-fade-in">
      <div className="flex-1 min-w-0 pt-1">
        <p className="text-sm font-semibold text-coffee-dark truncate">{item.name}</p>
        <p className="text-xs text-coffee-light mt-0.5">{item.sugar} · {item.ice}</p>
        {item.note && <p className="text-xs text-coffee-accent italic mt-0.5 truncate">"{item.note}"</p>}
        <div className="flex items-center gap-2 mt-1">
          <p className={`text-sm font-bold ${discountAmt > 0 ? 'text-coffee-light line-through text-xs' : 'text-coffee-accent'}`}>
            {itemTotal.toLocaleString('vi-VN')}đ
          </p>
          {discountAmt > 0 && (
            <p className="text-sm font-bold text-green-600">{finalPrice.toLocaleString('vi-VN')}đ</p>
          )}
        </div>
        {discountAmt > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-green-50 text-green-700 text-[10px] font-semibold border border-green-200">
              <Tag size={9} /> -{discountAmt.toLocaleString('vi-VN')}đ
            </span>
            <button
              onClick={handleRemoveDiscount}
              className="text-[10px] text-red-400 hover:text-red-600 underline"
            >
              Xóa
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Discount button */}
        <button
          onClick={() => setShowDiscountPopup(true)}
          className="min-w-[36px] min-h-[36px] rounded-lg bg-green-50 flex items-center justify-center text-green-600 hover:bg-green-100 transition-colors"
          title="Giảm giá"
        >
          <Percent size={14} />
        </button>
        <button onClick={() => onUpdateQty(item.cartItemId, -1)} className="min-w-[36px] min-h-[36px] rounded-lg bg-cream-light flex items-center justify-center text-coffee-medium hover:bg-cream-medium transition-colors">
          <Minus size={14} />
        </button>
        <span className="w-6 text-center text-sm font-bold text-coffee-dark">{item.qty}</span>
        <button onClick={() => onUpdateQty(item.cartItemId, 1)} className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-white transition-all" style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}>
          <Plus size={14} />
        </button>
        <button onClick={() => onRemove(item.cartItemId)} className="min-w-[36px] min-h-[36px] rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Discount Popup */}
      {showDiscountPopup && (
        <div className="absolute right-0 top-0 z-30 bg-white rounded-2xl shadow-coffee-lg border border-cream-medium/60 p-4 w-56 animate-slide-up">
          <p className="text-xs font-bold text-coffee-dark mb-2">Giảm giá: {item.name}</p>
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setDiscountType('PERCENT')}
              className={`flex-1 min-h-[32px] rounded-lg text-xs font-semibold transition-all border ${
                discountType === 'PERCENT'
                  ? 'bg-coffee-accent text-white border-coffee-accent'
                  : 'bg-cream-light text-coffee-medium border-cream-dark'
              }`}
            >
              % Phần trăm
            </button>
            <button
              onClick={() => setDiscountType('FIXED')}
              className={`flex-1 min-h-[32px] rounded-lg text-xs font-semibold transition-all border ${
                discountType === 'FIXED'
                  ? 'bg-coffee-accent text-white border-coffee-accent'
                  : 'bg-cream-light text-coffee-medium border-cream-dark'
              }`}
            >
              VNĐ Tiền
            </button>
          </div>
          <input
            type="number"
            value={discountValue}
            onChange={e => setDiscountValue(e.target.value)}
            placeholder={discountType === 'PERCENT' ? 'Nhập % (vd: 10)' : 'Nhập số tiền'}
            className="input-field w-full text-xs min-h-[36px] mb-2 font-mono"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleApplyDiscount()}
          />
          <div className="flex gap-1.5">
            <button onClick={() => setShowDiscountPopup(false)} className="flex-1 min-h-[32px] btn-secondary text-xs">Hủy</button>
            <button onClick={handleApplyDiscount} className="flex-1 min-h-[32px] btn-primary text-xs">Áp dụng</button>
          </div>
        </div>
      )}
    </div>
  );
}
