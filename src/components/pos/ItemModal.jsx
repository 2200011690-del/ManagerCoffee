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
      <div className="bg-[#FAF7F2] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up border border-[#E5DDD0]">
        {/* Image & Header Overlay */}
        <div className="relative h-56 overflow-hidden">
          {item.image ? (
            <img src={item.image} alt={item.name} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#2C1A10] to-[#5C4E43] flex items-center justify-center text-white font-display font-bold">
              ☕ {item.name}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#2C1A10]/90 via-[#2C1A10]/40 to-transparent" />
          
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/35 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/50 active:scale-90 transition-all border border-white/10"
          >
            <X size={18} />
          </button>
          
          <div className="absolute bottom-4 left-5 right-5">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#D4A373] px-2 py-0.5 rounded bg-[#2C1A10]/60 border border-[#A39081]/30 w-fit block mb-1.5">
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
              <p className="text-[#5C4E43] text-xs font-bold uppercase tracking-wider">Mức đường</p>
              <span className="text-[11px] font-semibold text-[#8C5E3C] bg-[#8C5E3C]/10 px-2 py-0.5 rounded-full">{sugar}</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {sugarOptions.map(s => (
                <button
                  key={s}
                  onClick={() => setSugar(s)}
                  className={`min-h-[42px] rounded-xl text-xs font-bold transition-all duration-200 transform active:scale-95 border ${
                    sugar === s
                      ? 'text-white border-transparent hover:scale-[1.03] shadow-md shadow-[#A76D42]/20'
                      : 'bg-[#FAF7F2] text-[#5C4E43] border-[#E5DDD0]/50 hover:bg-[#EFEAE2] hover:text-[#2C1A10]'
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
              <p className="text-[#5C4E43] text-xs font-bold uppercase tracking-wider">Lượng đá</p>
              <span className="text-[11px] font-semibold text-[#8C5E3C] bg-[#8C5E3C]/10 px-2 py-0.5 rounded-full">{ice}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {iceOptions.map(i => (
                <button
                  key={i}
                  onClick={() => setIce(i)}
                  className={`min-h-[42px] rounded-xl text-xs font-bold transition-all duration-200 transform active:scale-95 border ${
                    ice === i
                      ? 'text-white border-transparent hover:scale-[1.03] shadow-md shadow-[#A76D42]/20'
                      : 'bg-[#FAF7F2] text-[#5C4E43] border-[#E5DDD0]/50 hover:bg-[#EFEAE2] hover:text-[#2C1A10]'
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
            <p className="text-[#5C4E43] text-xs font-bold uppercase tracking-wider mb-2.5">Ghi chú món ăn / Đồ uống</p>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Không dùng ống hút, ít đá, nhiều sữa..."
              className="w-full bg-[#FAF7F2]/40 border border-[#E5DDD0] rounded-xl px-3 py-2 text-xs font-medium placeholder-[#A39081] focus:outline-none focus:ring-2 focus:ring-[#8C5E3C]/10 focus:border-[#8C5E3C] transition-all duration-150 min-h-[44px]"
            />
          </div>

          {/* Qty + Add Button */}
          <div className="flex items-center gap-4 pt-2 border-t border-[#E5DDD0]">
            <div className="flex items-center gap-1.5 bg-[#FAF7F2] p-1.5 rounded-2xl border border-[#E5DDD0]">
              <button 
                onClick={() => setQty(Math.max(1, qty - 1))} 
                className="w-10 h-10 rounded-xl bg-white shadow-sm border border-[#E5DDD0]/60 flex items-center justify-center text-[#5C4E43] hover:text-[#A76D42] hover:border-[#A76D42]/30 active:scale-90 transition-all"
              >
                <Minus size={16} />
              </button>
              <span className="w-10 text-center font-bold text-[#2C1A10] text-base">{qty}</span>
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
              className="flex-1 min-h-[48px] bg-gradient-to-r from-[#A76D42] to-[#D4A373] hover:from-[#965E36] hover:to-[#C59262] text-white font-bold text-sm rounded-2xl shadow-lg shadow-[#A76D42]/10 hover:shadow-xl hover:shadow-[#A76D42]/20 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0"
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
