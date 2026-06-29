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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in bg-black/60 backdrop-blur-sm">
      <div className="bg-cream-warm rounded-3xl shadow-coffee-lg w-full max-w-md overflow-hidden animate-slide-up border border-cream-dark/30">
        {/* Image & Header Overlay */}
        <div className="relative h-56 overflow-hidden">
          {item.image ? (
            <img src={item.image} alt={item.name} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-coffee-dark to-coffee-medium flex items-center justify-center text-white font-display font-bold">
              ☕ {item.name}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-coffee-dark/80 via-coffee-dark/40 to-transparent" />
          
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/35 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/50 active:scale-90 transition-all border border-white/10"
          >
            <X size={18} />
          </button>
          
          <div className="absolute bottom-4 left-5 right-5">
            <span className="text-[10px] uppercase font-bold tracking-widest text-coffee-gold px-2 py-0.5 rounded bg-coffee-dark/50 border border-coffee-light/20 w-fit block mb-1.5">
              {item.category}
            </span>
            <h3 className="text-white font-display font-bold text-2xl drop-shadow-sm">{item.name}</h3>
            <p className="text-white/80 text-xs mt-1 truncate">{item.description || 'Không có mô tả sản phẩm'}</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Sugar Level */}
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <p className="text-coffee-medium text-xs font-bold uppercase tracking-wider">Mức đường</p>
              <span className="text-[11px] font-semibold text-coffee-accent bg-coffee-accent/10 px-2 py-0.5 rounded-full">{sugar}</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {sugarOptions.map(s => (
                <button
                  key={s}
                  onClick={() => setSugar(s)}
                  className={`min-h-[42px] rounded-xl text-xs font-bold transition-all duration-200 transform active:scale-95 border ${
                    sugar === s
                      ? 'text-white shadow-coffee border-transparent hover:scale-[1.03]'
                      : 'bg-cream-light text-coffee-medium border-cream-dark/20 hover:bg-cream-medium/40 hover:text-coffee-dark'
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
            <div className="flex justify-between items-center mb-2.5">
              <p className="text-coffee-medium text-xs font-bold uppercase tracking-wider">Lượng đá</p>
              <span className="text-[11px] font-semibold text-coffee-accent bg-coffee-accent/10 px-2 py-0.5 rounded-full">{ice}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {iceOptions.map(i => (
                <button
                  key={i}
                  onClick={() => setIce(i)}
                  className={`min-h-[42px] rounded-xl text-xs font-bold transition-all duration-200 transform active:scale-95 border ${
                    ice === i
                      ? 'text-white shadow-coffee border-transparent hover:scale-[1.03]'
                      : 'bg-cream-light text-coffee-medium border-cream-dark/20 hover:bg-cream-medium/40 hover:text-coffee-dark'
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
            <p className="text-coffee-medium text-xs font-bold uppercase tracking-wider mb-2.5">Ghi chú món ăn / Đồ uống</p>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Không dùng ống hút, ít đá, nhiều sữa..."
              className="input-field min-h-[44px] text-xs font-medium bg-cream-light/40 border-cream-dark/30 focus:border-coffee-accent focus:ring-coffee-accent/10"
            />
          </div>

          {/* Qty + Add Button */}
          <div className="flex items-center gap-4 pt-2 border-t border-cream-dark/20">
            <div className="flex items-center gap-1.5 bg-cream-light/70 p-1.5 rounded-2xl border border-cream-dark/20">
              <button 
                onClick={() => setQty(Math.max(1, qty - 1))} 
                className="w-10 h-10 rounded-xl bg-white shadow-card border border-cream-dark/10 flex items-center justify-center text-coffee-medium hover:text-coffee-accent hover:border-coffee-accent/30 active:scale-90 transition-all"
              >
                <Minus size={16} />
              </button>
              <span className="w-10 text-center font-bold text-coffee-dark text-base">{qty}</span>
              <button 
                onClick={() => setQty(qty + 1)} 
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white active:scale-90 transition-all hover:scale-105" 
                style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}
              >
                <Plus size={16} />
              </button>
            </div>
            
            <button
              onClick={() => { onConfirm(item, sugar, ice, note, qty); onClose(); }}
              className="flex-1 min-h-[48px] bg-gradient-to-r from-coffee-accent to-coffee-gold hover:from-coffee-accent/90 hover:to-coffee-gold/90 text-white font-bold text-sm rounded-2xl shadow-coffee hover:shadow-coffee-lg transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0"
            >
              <ShoppingCart size={16} />
              <span>Thêm · {(item.price * qty).toLocaleString('vi-VN')}đ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
