import { Plus, Flame } from 'lucide-react';

export default function ProductGrid({ items, onAddToCart, onSelectItem }) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map(item => (
        <div
          key={item.id}
          className="menu-card"
          onClick={() => onSelectItem(item)}
        >
          <div className="relative h-36 overflow-hidden">
            <img src={item.image} alt={item.name} className="w-full h-full object-cover transition-transform duration-300 hover:scale-105" />
            {item.popular && (
              <div className="absolute top-2 left-2 flex items-center gap-1 bg-coffee-accent/90 text-white text-xs font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
                <Flame size={11} />
                Hot
              </div>
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(26,15,10,0.35) 0%, transparent 50%)' }} />
          </div>
          <div className="p-3">
            <h3 className="font-semibold text-coffee-dark text-sm leading-snug mb-0.5">{item.name}</h3>
            <p className="text-coffee-light text-xs truncate mb-2">{item.description}</p>
            <div className="flex items-center justify-between">
              <span className="font-bold text-coffee-accent">{item.price.toLocaleString('vi-VN')}đ</span>
              <button
                onClick={e => { e.stopPropagation(); onAddToCart(item, '100%', 'Nhiều đá', ''); }}
                className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
