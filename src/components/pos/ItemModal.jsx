import { useState } from 'react';
import { X, Minus, Plus, ShoppingCart } from 'lucide-react';
import { sugarOptions, iceOptions } from '../../data/coffeeData';

export default function ItemModal({ item, onClose, onConfirm }) {
  const [sugar, setSugar] = useState('100%');
  const [ice, setIce] = useState('Nhiều đá');
  const [note, setNote] = useState('');
  const [qty, setQty] = useState(1);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: 'rgba(26,15,10,0.65)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-cream-warm rounded-3xl shadow-coffee-lg w-full max-w-md overflow-hidden animate-slide-up">
        {/* Image */}
        <div className="relative h-48 overflow-hidden">
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(26,15,10,0.6) 0%, transparent 60%)' }} />
          <button onClick={onClose} className="absolute top-4 right-4 min-w-[44px] min-h-[44px] rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/30 transition-all">
            <X size={20} />
          </button>
          <div className="absolute bottom-4 left-4">
            <h3 className="text-white font-display font-bold text-xl">{item.name}</h3>
            <p className="text-white/70 text-sm">{item.description}</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Sugar Level */}
          <div>
            <p className="text-coffee-medium text-xs font-semibold uppercase tracking-wider mb-2">Mức đường</p>
            <div className="grid grid-cols-5 gap-1.5">
              {sugarOptions.map(s => (
                <button
                  key={s}
                  onClick={() => setSugar(s)}
                  className={`min-w-[44px] min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-150 ${
                    sugar === s
                      ? 'text-white shadow-coffee'
                      : 'bg-cream-light text-coffee-medium hover:bg-cream-medium'
                  }`}
                  style={sugar === s ? { background: 'linear-gradient(135deg, #A76D42, #C8956C)' } : {}}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Ice Level */}
          <div>
            <p className="text-coffee-medium text-xs font-semibold uppercase tracking-wider mb-2">Lượng đá</p>
            <div className="grid grid-cols-4 gap-1.5">
              {iceOptions.map(i => (
                <button
                  key={i}
                  onClick={() => setIce(i)}
                  className={`min-w-[44px] min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-150 ${
                    ice === i
                      ? 'text-white shadow-coffee'
                      : 'bg-cream-light text-coffee-medium hover:bg-cream-medium'
                  }`}
                  style={ice === i ? { background: 'linear-gradient(135deg, #A76D42, #C8956C)' } : {}}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <p className="text-coffee-medium text-xs font-semibold uppercase tracking-wider mb-2">Ghi chú</p>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Không dùng ống hút, ít bọt..."
              className="input-field min-h-[44px]"
            />
          </div>

          {/* Qty + Add */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex items-center gap-2 bg-cream-light rounded-xl p-1">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="min-w-[44px] min-h-[44px] rounded-lg bg-white shadow-card flex items-center justify-center text-coffee-medium hover:text-coffee-accent transition-colors">
                <Minus size={20} />
              </button>
              <span className="w-8 text-center font-bold text-coffee-dark text-lg">{qty}</span>
              <button onClick={() => setQty(qty + 1)} className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-white transition-all" style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}>
                <Plus size={20} />
              </button>
            </div>
            <button
              onClick={() => { onConfirm(item, sugar, ice, note, qty); onClose(); }}
              className="flex-1 min-h-[44px] btn-primary flex items-center justify-center gap-2"
            >
              <ShoppingCart size={20} />
              <span className="text-base">Thêm · {(item.price * qty).toLocaleString('vi-VN')}đ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
