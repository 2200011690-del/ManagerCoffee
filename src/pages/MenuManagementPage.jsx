import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, X, Check, ChefHat, Search, AlertTriangle } from 'lucide-react';
import { useMenu } from '../context/MenuContext';
import { useInventory } from '../context/InventoryContext';
import { useUI } from '../context/UIContext';
import { categories } from '../data/coffeeData';

const BLANK_FORM = { name: '', price: '', category: 'Cà phê', description: '', image: '' };

// ── Form Modal ───────────────────────────────────────────────────────────────
function ItemForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial ?? BLANK_FORM);
  const [errors, setErrors] = useState({});
  const { inventory, fetchRecipe } = useInventory();
  const [recipeItems, setRecipeItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initial && initial.id) {
      fetchRecipe(initial.id).then(data => {
        if (Array.isArray(data)) {
          setRecipeItems(data.map(item => ({
            inventoryId: item.inventoryId,
            name: item.inventory?.name || '',
            unit: item.inventory?.unit || '',
            qty: item.qty
          })));
        }
      });
    }
  }, [initial, fetchRecipe]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Vui lòng nhập tên món';
    if (!form.price || isNaN(form.price) || Number(form.price) <= 0) e.price = 'Giá phải > 0';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    const recipeErrors = {};
    recipeItems.forEach(item => {
      if (item.qty === '' || isNaN(item.qty) || Number(item.qty) < 0) {
        recipeErrors[item.inventoryId] = true;
      }
    });

    if (Object.keys(e).length || Object.keys(recipeErrors).length) {
      setErrors(prev => ({ ...prev, ...e }));
      if (Object.keys(recipeErrors).length) {
        alert('Vui lòng nhập số lượng định lượng hợp lệ (>= 0).');
      }
      return;
    }

    const cleanedRecipe = recipeItems.map(item => ({
      inventoryId: item.inventoryId,
      qty: Number(item.qty)
    }));

    try {
      setIsSubmitting(true);
      await onSave(form, cleanedRecipe);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddIngredient = (e) => {
    const invId = e.target.value;
    if (!invId) return;
    const invItem = inventory.find(i => i.id === invId);
    if (!invItem) return;
    setRecipeItems(prev => [
      ...prev,
      {
        inventoryId: invItem.id,
        name: invItem.name,
        unit: invItem.unit,
        qty: 0
      }
    ]);
    e.target.value = ''; // reset select
  };

  const handleRemoveIngredient = (invId) => {
    setRecipeItems(prev => prev.filter(i => i.inventoryId !== invId));
  };

  const handleQtyChange = (invId, val) => {
    setRecipeItems(prev => prev.map(i => {
      if (i.inventoryId === invId) {
        return { ...i, qty: val };
      }
      return i;
    }));
  };

  const availableIngredients = inventory.filter(
    inv => !recipeItems.some(item => item.inventoryId === inv.id)
  );

  const field = (label, key, type = 'text', placeholder = '') => (
    <div>
      <label className="text-coffee-medium text-xs font-semibold uppercase tracking-wider mb-1.5 block">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(prev => ({ ...prev, [key]: '' })); }}
        placeholder={placeholder}
        className={`input-field min-h-[44px] ${errors[key] ? 'border-red-400 ring-1 ring-red-400' : ''}`}
      />
      {errors[key] && <p className="text-red-500 text-xs mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(26,15,10,0.65)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] animate-slide-up">
        <div className="px-5 py-4 border-b border-cream-medium/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ChefHat size={18} className="text-coffee-accent" />
            <h3 className="font-display font-bold text-coffee-dark">
              {initial && initial.id ? 'Sửa món' : 'Thêm món mới'}
            </h3>
          </div>
          <button onClick={onClose} className="min-w-[36px] min-h-[36px] rounded-lg bg-cream-light flex items-center justify-center text-coffee-medium hover:bg-cream-medium">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {field('Tên món *', 'name', 'text', 'VD: Caramel Macchiato')}
          <div className="grid grid-cols-2 gap-3">
            {field('Giá (đ) *', 'price', 'number', '55000')}
            <div>
              <label className="text-coffee-medium text-xs font-semibold uppercase tracking-wider mb-1.5 block">Danh mục</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="input-field min-h-[44px]"
              >
                {categories.filter(c => c !== 'Tất cả').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {field('Mô tả', 'description', 'text', 'Mô tả ngắn về món...')}
          {field('Link ảnh (URL)', 'image', 'url', 'https://...')}
          {form.image && (
            <div className="rounded-xl overflow-hidden h-28 bg-cream-light">
              <img src={form.image} alt="preview" className="w-full h-full object-cover"
                onError={e => { e.target.style.display = 'none'; }} />
            </div>
          )}

          {/* Recipe Configuration */}
          <div className="border-t border-cream-medium/20 pt-4 mt-2">
            <h4 className="font-display font-bold text-coffee-dark text-sm mb-3 flex items-center gap-1.5">
              <ChefHat size={16} className="text-coffee-accent" />
              Định lượng Nguyên liệu (Hao phí)
            </h4>

            {recipeItems.length > 0 ? (
              <div className="space-y-2 mb-3">
                {recipeItems.map(item => (
                  <div key={item.inventoryId} className="flex items-center gap-2 bg-cream-light/40 p-2 rounded-xl border border-cream-medium/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-coffee-dark truncate">{item.name}</p>
                      <p className="text-[10px] text-coffee-light">Đơn vị: {item.unit}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="any"
                        value={item.qty}
                        onChange={e => handleQtyChange(item.inventoryId, e.target.value)}
                        placeholder="Số lượng"
                        className="w-20 px-2 py-1 text-xs border border-cream-medium/30 rounded-lg text-right focus:outline-none focus:ring-1 focus:ring-coffee-accent"
                        min="0"
                      />
                      <span className="text-xs text-coffee-medium font-medium min-w-[30px]">{item.unit}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredient(item.inventoryId)}
                        className="p-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-coffee-light italic mb-3">Món này chưa được thiết lập định lượng.</p>
            )}

            {availableIngredients.length > 0 ? (
              <div className="relative">
                <select
                  onChange={handleAddIngredient}
                  value=""
                  className="w-full bg-cream-light/60 hover:bg-cream-medium/40 text-coffee-medium text-xs font-semibold px-3 py-2 rounded-xl border border-cream-medium/30 transition-all cursor-pointer focus:outline-none"
                >
                  <option value="" disabled>+ Chọn nguyên liệu để định lượng...</option>
                  {availableIngredients.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.icon} {inv.name} ({inv.unit})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-coffee-light/80 italic text-center">Đã sử dụng hết tất cả nguyên liệu trong kho.</p>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-cream-medium/40 flex gap-3 shrink-0">
          <button onClick={onClose} disabled={isSubmitting} className="min-h-[44px] flex-1 btn-secondary disabled:opacity-50">Hủy</button>
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="min-h-[44px] flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <Check size={16} />
            )}
            {isSubmitting ? 'Đang xử lý...' : (initial && initial.id ? 'Lưu thay đổi' : 'Thêm món')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function MenuManagementPage() {
  const { menuList, addItem, updateItem, removeItem, toggleHidden } = useMenu();
  const { saveRecipe } = useInventory();
  const { showNotification } = useUI();
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('Tất cả');
  const [editTarget, setEditTarget] = useState(null);  // item being edited
  const [showAdd, setShowAdd] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filtered = menuList.filter(item => {
    const matchCat = filterCat === 'Tất cả' || item.category === filterCat;
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleAdd = async (form, recipeIngredients) => {
    try {
      const createdProduct = await addItem(form);
      if (createdProduct && createdProduct.id && recipeIngredients && recipeIngredients.length > 0) {
        await saveRecipe(createdProduct.id, recipeIngredients);
      }
      showNotification('Thêm món mới thành công! 🎉', 'success');
      setShowAdd(false);
    } catch {
      showNotification('Lỗi khi thêm món mới!', 'error');
    }
  };

  const handleEdit = async (form, recipeIngredients) => {
    try {
      await updateItem(editTarget.id, {
        name: form.name,
        price: Number(form.price),
        category: form.category,
        description: form.description,
        image: form.image,
      });
      if (recipeIngredients) {
        await saveRecipe(editTarget.id, recipeIngredients);
      }
      showNotification('Cập nhật món thành công! 🎉', 'success');
      setEditTarget(null);
    } catch {
      showNotification('Lỗi khi cập nhật món!', 'error');
    }
  };

  const handleDelete = async (item) => {
    try {
      setIsDeleting(true);
      await removeItem(item.id);
      showNotification('Xóa món thành công! 🗑️', 'success');
      setDeleteConfirm(null);
    } catch {
      showNotification('Lỗi khi xóa món!', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const statsVisible = menuList.filter(i => !i.hidden).length;
  const statsHidden  = menuList.filter(i => i.hidden).length;

  return (
    <div className="h-full overflow-y-auto bg-cream-warm">
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl text-coffee-dark">Quản lý Thực đơn</h1>
            <p className="text-coffee-light text-sm mt-1">
              {menuList.length} món tổng · <span className="text-green-600 font-semibold">{statsVisible} đang hiển thị</span>
              {statsHidden > 0 && <> · <span className="text-yellow-600 font-semibold">{statsHidden} đã ẩn</span></>}
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="min-h-[44px] btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            Thêm món mới
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-coffee-light" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm tên món..."
              className="input-field pl-9 min-h-[44px] text-sm"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`min-h-[44px] flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  filterCat === cat ? 'text-white shadow-coffee' : 'bg-cream-light text-coffee-medium hover:bg-cream-medium'
                }`}
                style={filterCat === cat ? { background: 'linear-gradient(135deg, #A76D42, #C8956C)' } : {}}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-cream-medium/30 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream-light border-b border-cream-medium/40">
                <th className="text-left px-4 py-3 font-semibold text-coffee-medium w-16">Ảnh</th>
                <th className="text-left px-4 py-3 font-semibold text-coffee-medium">Tên món</th>
                <th className="text-left px-4 py-3 font-semibold text-coffee-medium hidden sm:table-cell">Danh mục</th>
                <th className="text-right px-4 py-3 font-semibold text-coffee-medium">Giá</th>
                <th className="text-center px-4 py-3 font-semibold text-coffee-medium">Trạng thái</th>
                <th className="text-center px-4 py-3 font-semibold text-coffee-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}
                  className={`border-b border-cream-medium/30 transition-colors ${item.hidden ? 'opacity-50 bg-gray-50' : 'hover:bg-cream-light/40'}`}>
                  <td className="px-4 py-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-cream-light flex-shrink-0">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover"
                        onError={e => { e.target.src = 'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=100&q=60'; }} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-coffee-dark">{item.name}</p>
                    <p className="text-xs text-coffee-light truncate max-w-[180px]">{item.description}</p>
                    {item.popular && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold mt-0.5 inline-block">🔥 Hot</span>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs bg-cream-light text-coffee-medium px-2 py-1 rounded-lg font-medium">{item.category}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-coffee-accent">
                    {Number(item.price).toLocaleString('vi-VN')}đ
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleHidden(item.id)}
                      className={`min-w-[44px] min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        item.hidden
                          ? 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100'
                          : 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {item.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                      {item.hidden ? 'Đã ẩn' : 'Hiện'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setEditTarget(item)}
                        className="min-w-[36px] min-h-[36px] rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors"
                        title="Sửa"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(item)}
                        className="min-w-[36px] min-h-[36px] rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors"
                        title="Xóa"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-coffee-light">Không tìm thấy món nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Form */}
      {showAdd && <ItemForm onSave={handleAdd} onClose={() => setShowAdd(false)} />}

      {/* Edit Form */}
      {editTarget && (
        <ItemForm
          initial={{
            id: editTarget.id,
            name: editTarget.name,
            price: String(editTarget.price),
            category: editTarget.category,
            description: editTarget.description ?? '',
            image: editTarget.image ?? '',
          }}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(26,15,10,0.65)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={26} className="text-red-500" />
            </div>
            <h3 className="font-display font-bold text-xl text-coffee-dark mb-1">Xóa món này?</h3>
            <p className="text-coffee-light text-sm mb-5">
              "<span className="font-semibold text-coffee-dark">{deleteConfirm.name}</span>" sẽ bị xóa vĩnh viễn khỏi hệ thống.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} disabled={isDeleting} className="min-h-[44px] flex-1 btn-secondary disabled:opacity-50">Hủy</button>
              <button 
                onClick={() => handleDelete(deleteConfirm)} 
                disabled={isDeleting}
                className="min-h-[44px] flex-1 btn-danger flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <Trash2 size={16} />
                )}
                {isDeleting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
