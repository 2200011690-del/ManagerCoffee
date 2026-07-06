import React from 'react';
import { Plus, Flame } from 'lucide-react';

// Category color map
const CATEGORY_COLORS = {
  'Cà phê':   { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  'Trà':      { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-400' },
  'Bánh':     { bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-700',   dot: 'bg-pink-400' },
  'Đá xay':   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-400' },
  'Nước ép':  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-400' },
};

function getCategoryStyle(category) {
  return CATEGORY_COLORS[category] ?? { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' };
}

const ProductGrid = React.memo(function ProductGrid({ items, onAddToCart, onSelectItem }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-ink-light">
        <p className="text-lg font-medium">Không tìm thấy món</p>
        <p className="text-sm">Thử tìm kiếm với từ khóa khác</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
      {items.map(item => {
        const cat = getCategoryStyle(item.category);
        return (
          <div
            key={item.id}
            onClick={() => onSelectItem(item)}
            className="bg-white rounded-lg border border-surface-border shadow-card cursor-pointer transition-all duration-150 hover:shadow-card-hover hover:border-primary-300 active:scale-95 overflow-hidden"
          >
            {/* Color top strip based on category */}
            <div className={`h-1 w-full ${cat.dot}`} />

            <div className="p-3">
              {/* Category tag */}
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${cat.bg} ${cat.text} border ${cat.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
                  {item.category}
                </span>
                {item.popular && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-orange-600">
                    <Flame size={10} />
                    Bán chạy
                  </span>
                )}
              </div>

              {/* Name */}
              <h3 className="font-semibold text-ink-dark text-sm leading-snug mb-1 line-clamp-2">{item.name}</h3>

              {/* Prep time */}
              {item.prepTime && (
                <p className="text-[10px] text-ink-light mb-2">{item.prepTime}</p>
              )}

              {/* Price + Add button */}
              <div className="flex items-center justify-between mt-auto pt-1">
                <span className="font-bold text-primary-600 text-sm">{item.price.toLocaleString('vi-VN')}đ</span>
                <button
                  onClick={e => { e.stopPropagation(); onAddToCart(item, '100%', 'Nhiều đá', ''); }}
                  aria-label={`Thêm ${item.name} vào giỏ`}
                  title={`Thêm ${item.name}`}
                  className="w-8 h-8 rounded-lg bg-primary-600 hover:bg-primary-700 flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 shadow-sm"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default ProductGrid;
