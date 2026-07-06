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
      <div className="bg-surface-bg rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-slide-up border border-[#E2E8F0]">
        {/* Image & Header Overlay */}
        <div className="relative h-56 overflow-hidden">
          {item.image ? (
            <img src={item.image} alt={item.name} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#0F172A] to-[#475569] flex items-center justify-center text-white font-display font-bold">
              ☕ {item.name}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A]/90 via-[#0F172A]/40 to-transparent" />
          
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/35 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/50 active:scale-90 transition-all border border-white/10"
          >
            <X size={18} />
          </button>
          
          <div className="absolute bottom-4 left-5 right-5">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#38BDF8] px-2 py-0.5 rounded bg-[#0F172A]/60 border border-[#94A3B8]/30 w-fit block mb-1.5">
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
              <p className="text-[#475569] text-xs font-bold uppercase tracking-wider">Mức đường</p>
              <span className="text-[11px] font-semibold text-[#2563EB] bg-[#2563EB]/10 px-2 py-0.5 rounded-full">{sugar}</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {sugarOptions.map(s => (
                <button
                  key={s}
                  onClick={() => setSugar(s)}
                  className={`min-h-[42px] rounded-lg text-xs font-bold transition-all duration-200 transform active:scale-95 border ${
                    sugar === s
                      ? 'text-white border-transparent hover:scale-[1.03] shadow-sm'
                      : 'bg-surface-bg text-[#475569] border-[#E2E8F0]/50 hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                  }`}
                  style={sugar === s ? { background: 'linear-gradient(135deg, #2563EB, #0EA5E9)' } : {}}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Ice Level */}
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <p className="text-[#475569] text-xs font-bold uppercase tracking-wider">Lượng đá</p>
              <span className="text-[11px] font-semibold text-[#2563EB] bg-[#2563EB]/10 px-2 py-0.5 rounded-full">{ice}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {iceOptions.map(i => (
                <button
                  key={i}
                  onClick={() => setIce(i)}
                  className={`min-h-[42px] rounded-lg text-xs font-bold transition-all duration-200 transform active:scale-95 border ${
                    ice === i
                      ? 'text-white border-transparent hover:scale-[1.03] shadow-sm'
                      : 'bg-surface-bg text-[#475569] border-[#E2E8F0]/50 hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                  }`}
                  style={ice === i ? { background: 'linear-gradient(135deg, #2563EB, #0EA5E9)' } : {}}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <p className="text-[#475569] text-xs font-bold uppercase tracking-wider mb-2.5">Ghi chú món ăn / Đồ uống</p>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Không dùng ống hút, ít đá, nhiều sữa..."
              className="w-full bg-surface-bg/40 border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs font-medium placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 focus:border-[#2563EB] transition-all duration-150 min-h-[44px]"
            />
          </div>

          {/* Qty + Add Button */}
          <div className="flex items-center gap-4 pt-2 border-t border-[#E2E8F0]">
            <div className="flex items-center gap-1.5 bg-surface-bg p-1.5 rounded-lg border border-[#E2E8F0]">
              <button 
                onClick={() => setQty(Math.max(1, qty - 1))} 
                className="w-10 h-10 rounded-lg bg-white shadow-sm border border-[#E2E8F0]/60 flex items-center justify-center text-[#475569] hover:text-[#2563EB] hover:border-[#2563EB]/30 active:scale-90 transition-all"
              >
                <Minus size={16} />
              </button>
              <span className="w-10 text-center font-bold text-[#0F172A] text-base">{qty}</span>
              <button 
                onClick={() => setQty(qty + 1)} 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white active:scale-90 transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #2563EB, #0EA5E9)' }}
              >
                <Plus size={16} />
              </button>
            </div>
            
            <button
              onClick={() => { onConfirm(item, sugar, ice, note, qty); onClose(); }}
              className="flex-1 min-h-[48px] bg-gradient-to-r from-[#2563EB] to-[#38BDF8] hover:from-[#1D4ED8] hover:to-[#0284C7] text-white font-bold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0"
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
