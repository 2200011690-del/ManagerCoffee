import { Minus, Plus, Trash2 } from 'lucide-react';

export default function CartItem({ item, onRemove, onUpdateQty }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-cream-medium/50 last:border-0 animate-fade-in">
      <div className="flex-1 min-w-0 pt-1">
        <p className="text-sm font-semibold text-coffee-dark truncate">{item.name}</p>
        <p className="text-xs text-coffee-light mt-0.5">{item.sugar} · {item.ice}</p>
        {item.note && <p className="text-xs text-coffee-accent italic mt-0.5 truncate">"{item.note}"</p>}
        <p className="text-sm font-bold text-coffee-accent mt-1">{(item.price * item.qty).toLocaleString('vi-VN')}đ</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={() => onUpdateQty(item.cartItemId, item.qty - 1)} className="min-w-[44px] min-h-[44px] rounded-lg bg-cream-light flex items-center justify-center text-coffee-medium hover:bg-cream-medium transition-colors">
          <Minus size={16} />
        </button>
        <span className="w-6 text-center text-sm font-bold text-coffee-dark">{item.qty}</span>
        <button onClick={() => onUpdateQty(item.cartItemId, item.qty + 1)} className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-white transition-all" style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}>
          <Plus size={16} />
        </button>
        <button onClick={() => onRemove(item.cartItemId)} className="min-w-[44px] min-h-[44px] rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors ml-1">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
