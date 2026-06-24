import { useState, useMemo } from 'react';
import {
  Search, ShoppingCart, Trash2, CreditCard, Banknote, Receipt, Tag,
  LayoutGrid, X, ArrowLeftRight, User, Gift, SplitSquareVertical, CheckCircle
} from 'lucide-react';
import { categories } from '../data/coffeeData';
import { useMenu } from '../context/MenuContext';
import { useInventory } from '../context/InventoryContext';
import { useCart } from '../context/CartContext';
import { useTable } from '../context/TableContext';
import { useUI } from '../context/UIContext';
import { useOrderHistory } from '../context/OrderHistoryContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import ItemModal from '../components/pos/ItemModal';
import CartItem from '../components/pos/CartItem';
import ProductGrid from '../components/pos/ProductGrid';
import ThermalBillModal from '../components/pos/ThermalBillModal';
import SplitBillModal from '../components/pos/SplitBillModal';

// ---- Table Picker Panel ----
function TablePickerPanel({ onClose }) {
  const { tables } = useTable();
  const { setSelectedTable, setTakeaway, activeTableId, tableHasCart } = useCart();
  const { setView } = useUI();

  const statusColor = (s) => ({
    available: 'border-green-300 bg-green-50 text-green-800',
    occupied:  'border-pink-300 bg-pink-50 text-pink-800',
    dirty:     'border-yellow-300 bg-yellow-50 text-yellow-800',
  }[s] ?? '');

  const statusLabel = { available: 'Trống', occupied: 'Có khách', dirty: 'Chưa dọn' };

  const handlePick = (tableId) => {
    setSelectedTable(tableId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(26,15,10,0.6)', backdropFilter: 'blur(5px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-slide-up">
        <div className="px-5 py-4 border-b border-cream-medium/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid size={18} className="text-coffee-accent" />
            <h3 className="font-display font-bold text-coffee-dark">Chọn bàn</h3>
          </div>
          <button onClick={onClose} className="min-w-[36px] min-h-[36px] rounded-lg bg-cream-light flex items-center justify-center text-coffee-medium hover:bg-cream-medium transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 max-h-96 overflow-y-auto">
          {/* Takeaway option */}
          <button
            onClick={() => { setTakeaway(); onClose(); }}
            className={`w-full mb-3 flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
              activeTableId === null
                ? 'border-coffee-accent bg-coffee-accent/10 text-coffee-accent'
                : 'border-cream-dark text-coffee-medium hover:border-coffee-accent/40'
            }`}
          >
            <ShoppingCart size={18} />
            <div>
              <p className="font-semibold text-sm">Mang về / Takeaway</p>
              {tableHasCart(null) && <p className="text-xs opacity-70">Đang có món trong giỏ</p>}
            </div>
            {activeTableId === null && <span className="ml-auto text-xs font-bold bg-coffee-accent text-white px-2 py-0.5 rounded-full">Đang chọn</span>}
          </button>

          {/* Tables grouped by zone */}
          {['Tầng trệt', 'Lầu 1', 'Sân vườn'].map(zone => {
            const zoneTables = tables.filter(t => t.zone === zone);
            return (
              <div key={zone} className="mb-3">
                <p className="text-xs font-bold text-coffee-light uppercase tracking-widest mb-2 px-1">{zone}</p>
                <div className="grid grid-cols-3 gap-2">
                  {zoneTables.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handlePick(t.id)}
                      disabled={t.status === 'dirty'}
                      className={`relative p-3 rounded-xl border-2 text-left transition-all ${statusColor(t.status)} ${
                        activeTableId === t.id ? 'ring-2 ring-coffee-accent ring-offset-1' : ''
                      } ${t.status === 'dirty' ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-md'}`}
                    >
                      <p className="font-bold text-sm">{t.name}</p>
                      <p className="text-xs opacity-70">{statusLabel[t.status]}</p>
                      {tableHasCart(t.id) && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-coffee-accent animate-pulse" />
                      )}
                      {activeTableId === t.id && (
                        <span className="block text-xs font-bold mt-0.5" style={{ color: '#A76D42' }}>Đang chọn</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-cream-medium/40">
          <button onClick={() => { setView('tables'); onClose(); }}
            className="w-full min-h-[44px] btn-secondary flex items-center justify-center gap-2 text-sm">
            <LayoutGrid size={16} />
            Xem sơ đồ bàn đầy đủ
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main POS Page ----
export default function POSPage() {
  const {
    cart, subtotal, vatAmount, total, cartCount,
    addToCart, removeFromCart, updateQty, clearCart, clearCurrentCart,
    activeTableId, setSelectedTable, setTakeaway, tableHasCart, tableCarts
  } = useCart();
  const { tables, updateTableStatus } = useTable();
  const { showNotification, notification } = useUI();
  const { addOrder } = useOrderHistory();
  const { visibleMenu } = useMenu();
  const { currentUser } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [showThermal, setShowThermal] = useState(false);
  const [showSplitBill, setShowSplitBill] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Customer & Voucher states
  const [customerPhone, setCustomerPhone] = useState('');
  const [customer, setCustomer] = useState(null);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  
  const [voucherInput, setVoucherInput] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [discountAmount, setDiscountAmount] = useState(0);

  const filteredItems = useMemo(() => {
    // Use visibleMenu from MenuContext instead of static menuItems
    return visibleMenu.filter(item => {
      const matchCat = activeCategory === 'Tất cả' || item.category === activeCategory;
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [activeCategory, searchQuery, visibleMenu]);

  const handleAddItem = (item, sugar, ice, note, qty = 1) => {
    // Nếu đây là lần đầu thêm món vào bàn này => tự động chuyển trạng thái bàn sang "Có khách"
    const onFirstItem = activeTableId && activeTable?.status === 'available'
      ? () => updateTableStatus(activeTableId, 'occupied')
      : null;

    for (let i = 0; i < qty; i++) {
      addToCart(item, sugar, ice, note, i === 0 ? onFirstItem : null);
    }
  };

  // Get table name for display
  const activeTable = tables.find(t => t.id === activeTableId);
  const tableLabel = activeTableId ? (activeTable?.name ?? activeTableId) : 'Mang về';

  // Step 1: user clicks "Thanh toán" => show confirm modal
  // Step 2: user confirms => save order to history, show thermal bill
  // Step 3: user confirms thermal => clear cart, set table dirty

  // ---- Customer Handlers ----
  const handleSearchCustomer = async () => {
    if (!customerPhone) return;
    setIsSearchingCustomer(true);
    try {
      const data = await api.get(`/customers?phone=${customerPhone}`);
      if (data) {
        setCustomer(data);
        showNotification('Đã áp dụng khách hàng', 'success');
      } else {
        const create = window.confirm('Khách hàng chưa tồn tại. Bạn có muốn tạo mới không?');
        if (create) {
          const name = window.prompt('Nhập tên khách hàng mới:');
          if (name) {
            const newCus = await api.post('/customers', { phone: customerPhone, name });
            setCustomer(newCus);
            showNotification('Tạo khách hàng thành công', 'success');
          }
        }
      }
    } catch (err) {
      showNotification('Lỗi khi tìm khách hàng', 'error');
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  // ---- Voucher Handlers ----
  const handleApplyVoucher = async () => {
    if (!voucherInput) return;
    try {
      const data = await api.post('/vouchers/validate', {
        code: voucherInput.toUpperCase(),
        orderValue: subtotal
      });
      setAppliedVoucher(data.voucher);
      setDiscountAmount(data.discountAmount);
      showNotification('Áp dụng mã giảm giá thành công!', 'success');
    } catch (err) {
      showNotification(err.response?.data?.error || 'Mã giảm giá không hợp lệ', 'error');
      setAppliedVoucher(null);
      setDiscountAmount(0);
    }
  };

  const finalTotal = total - discountAmount > 0 ? total - discountAmount : 0;

  // ---- Checkout Handlers ----
  const handleConfirmPayment = async () => {
    // Build order object
    const tableName = activeTableId ? (activeTable?.name ?? activeTableId) : 'Mang về';
    const newOrder = await addOrder({
      tableId: activeTableId,
      tableName,
      cart,
      subtotal,
      vatAmount,
      total: finalTotal,
      paymentMethod,
      customerId: customer?.id,
      voucherCode: appliedVoucher?.code,
      discountAmount,
      employeeId: currentUser?.id
    });
    setPendingOrder(newOrder);
    setShowPayConfirm(false);
    setShowThermal(true);
  };

  const handleFinishCheckout = () => {
    // Set table to dirty if applicable
    if (activeTableId) {
      updateTableStatus(activeTableId, 'dirty');
    }
    
    if (pendingOrder?.isSplit) {
      // If it's a split bill, update the remaining cart by deducting split items
      pendingOrder.items.forEach(splitItem => {
        updateQty(splitItem.cartItemId, -splitItem.qty);
      });
    } else {
      clearCurrentCart(activeTableId);
    }
    
    setShowThermal(false);
    setPendingOrder(null);
    showNotification('Thanh toán thành công! 🎉', 'success');
  };

  const handleConfirmSplit = async (selectedItems, splitSubtotal, splitVatAmount, splitTotal) => {
    const splitFinalTotal = splitTotal - discountAmount > 0 ? splitTotal - discountAmount : 0;
    const tableName = activeTableId ? (activeTable?.name ?? activeTableId) : 'Mang về';
    const newOrder = await addOrder({
      tableId: activeTableId,
      tableName,
      cart: selectedItems,
      subtotal: splitSubtotal,
      vatAmount: splitVatAmount,
      total: splitFinalTotal,
      paymentMethod,
      customerId: customer?.id,
      voucherCode: appliedVoucher?.code,
      discountAmount,
      employeeId: currentUser?.id
    });
    newOrder.isSplit = true;
    setPendingOrder(newOrder);
    setShowSplitBill(false);
    setShowThermal(true);
  };


  return (
    <div className="flex h-full gap-0 overflow-hidden">
      {/* ======== LEFT: Menu Grid ======== */}
      <div className="flex-1 flex flex-col overflow-hidden bg-cream-warm">
        {/* Quick Table Tab Strip (KiotViet style) */}
        <div className="px-4 pt-3 pb-0 border-b border-cream-medium/60 bg-white/90 flex items-center gap-1.5 overflow-x-auto scrollbar-hide flex-shrink-0">
          {/* Takeaway tab */}
          <button
            onClick={() => { setTakeaway(); }}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-sm font-semibold border-b-2 transition-all ${
              activeTableId === null
                ? 'border-coffee-accent text-coffee-accent bg-coffee-accent/8'
                : 'border-transparent text-coffee-light hover:text-coffee-dark'
            }`}
          >
            <ShoppingCart size={14} />
            <span>Mang về</span>
            {tableHasCart(null) && <span className="w-1.5 h-1.5 rounded-full bg-coffee-accent" />}
          </button>

          {/* Occupied table tabs */}
          {tables.filter(t => t.status === 'occupied').map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTable(t.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-sm font-semibold border-b-2 transition-all ${
                activeTableId === t.id
                  ? 'border-coffee-accent text-coffee-accent bg-coffee-accent/8'
                  : 'border-transparent text-coffee-light hover:text-coffee-dark'
              }`}
            >
              <span>{t.name}</span>
              {tableHasCart(t.id) && <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />}
            </button>
          ))}

          {/* All tables button */}
          <button
            onClick={() => setShowTablePicker(true)}
            className="flex-shrink-0 ml-auto flex items-center gap-1 px-3 py-2 text-xs text-coffee-light hover:text-coffee-accent transition-colors border-b-2 border-transparent"
          >
            <LayoutGrid size={13} />
            Tất cả bàn
          </button>
        </div>

        {/* Top Bar: Search + Categories */}
        <div className="px-6 py-3 border-b border-cream-medium/60 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-coffee-light" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm món..."
                className="input-field pl-10 min-h-[44px]"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`min-h-[44px] flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    activeCategory === cat
                      ? 'text-white shadow-coffee'
                      : 'bg-cream-light text-coffee-medium hover:bg-cream-medium'
                  }`}
                  style={activeCategory === cat ? { background: 'linear-gradient(135deg, #A76D42, #C8956C)' } : {}}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Category Header */}
        <div className="px-6 py-3 flex items-center justify-between">
          <h2 className="font-display text-coffee-dark font-bold text-lg">{activeCategory}</h2>
          <p className="text-coffee-light text-sm">{filteredItems.length} món</p>
        </div>

        {/* Menu Grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <ProductGrid items={filteredItems} onAddToCart={addToCart} onSelectItem={setSelectedItem} />
        </div>
      </div>

      {/* ======== RIGHT: Cart Panel ======== */}
      <div className="w-80 xl:w-96 flex flex-col bg-white border-l border-cream-medium/50 shadow-coffee">
        {/* Cart Header */}
        <div className="px-5 py-3 border-b border-cream-medium/50">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-coffee-accent" />
              <h2 className="font-display font-bold text-coffee-dark">Giỏ hàng</h2>
            </div>
            {cart.length > 0 && (
              <button onClick={clearCart} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-red-400 hover:text-red-600 transition-colors p-1 rounded-lg hover:bg-red-50">
                <Trash2 size={20} />
              </button>
            )}
          </div>
          {/* Table selector */}
          <button
            onClick={() => setShowTablePicker(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-cream-dark hover:border-coffee-accent/50 transition-all group"
          >
            <Tag size={13} className="text-coffee-light group-hover:text-coffee-accent transition-colors" />
            <span className="text-sm text-coffee-medium group-hover:text-coffee-dark transition-colors flex-1 text-left">
              {activeTableId
                ? <><span className="font-semibold text-coffee-dark">{tableLabel}</span></>
                : 'Mang về / Chưa chọn bàn'
              }
            </span>
            <ArrowLeftRight size={14} className="text-coffee-light group-hover:text-coffee-accent transition-colors" />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-cream-light flex items-center justify-center mb-4">
                <ShoppingCart size={28} className="text-coffee-light" />
              </div>
              <p className="text-coffee-light font-medium">Giỏ hàng trống</p>
              <p className="text-coffee-light/60 text-sm mt-1">Chọn món từ thực đơn bên trái</p>
              <button
                onClick={() => setShowTablePicker(true)}
                className="mt-4 min-h-[44px] px-4 btn-secondary text-sm flex items-center gap-2"
              >
                <Tag size={15} />
                Chọn bàn
              </button>
            </div>
          ) : (
            <div>
              {cart.map(item => (
                <CartItem key={item.cartItemId} item={item} onRemove={removeFromCart} onUpdateQty={updateQty} />
              ))}
            </div>
          )}
        </div>

        {/* Bill Summary */}
        {cart.length > 0 && (
          <div className="px-5 py-4 border-t border-cream-medium/50 space-y-3">
            
            {/* Customer & Voucher Block */}
            <div className="space-y-2 mb-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="SĐT khách hàng..." value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} onKeyDown={e=>e.key==='Enter' && handleSearchCustomer()} className="input-field pl-8 min-h-[36px] text-xs w-full" disabled={customer != null} />
                </div>
                {!customer ? (
                  <button onClick={handleSearchCustomer} disabled={isSearchingCustomer} className="btn-secondary min-h-[36px] px-3 text-xs">Tìm</button>
                ) : (
                  <button onClick={() => { setCustomer(null); setCustomerPhone(''); }} className="btn-danger min-h-[36px] px-3 text-xs">Xóa</button>
                )}
              </div>
              {customer && (
                <div className="flex justify-between text-xs bg-cream-light p-2 rounded-lg">
                  <span className="font-bold text-coffee-dark">{customer.name} <span className="text-coffee-accent">({customer.tier})</span></span>
                  <span className="text-coffee-medium">{customer.points} điểm</span>
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <div className="relative flex-1">
                  <Gift size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Mã giảm giá..." value={voucherInput} onChange={e=>setVoucherInput(e.target.value)} className="input-field pl-8 min-h-[36px] text-xs w-full uppercase" disabled={appliedVoucher != null} />
                </div>
                {!appliedVoucher ? (
                  <button onClick={handleApplyVoucher} className="btn-secondary min-h-[36px] px-3 text-xs">Áp dụng</button>
                ) : (
                  <button onClick={() => { setAppliedVoucher(null); setVoucherInput(''); setDiscountAmount(0); }} className="btn-danger min-h-[36px] px-3 text-xs">Xóa</button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm text-coffee-medium">
                <span>Tạm tính ({cartCount} món)</span>
                <span>{subtotal.toLocaleString('vi-VN')}đ</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-coffee-accent font-medium">
                  <span>Giảm giá ({appliedVoucher?.code})</span>
                  <span>-{discountAmount.toLocaleString('vi-VN')}đ</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-coffee-medium">
                <span>VAT (8%)</span>
                <span>+{vatAmount.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="divider" />
              <div className="flex justify-between font-bold text-coffee-dark">
                <span className="text-base">Tổng cộng</span>
                <span className="text-lg text-coffee-accent">{finalTotal.toLocaleString('vi-VN')}đ</span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`min-h-[44px] flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                  paymentMethod === 'cash'
                    ? 'border-coffee-accent bg-coffee-accent/10 text-coffee-accent'
                    : 'border-cream-dark text-coffee-light hover:border-coffee-accent/40'
                }`}
              >
                <Banknote size={16} />
                Tiền mặt
              </button>
              <button
                onClick={() => setPaymentMethod('card')}
                className={`min-h-[44px] flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                  paymentMethod === 'card'
                    ? 'border-coffee-accent bg-coffee-accent/10 text-coffee-accent'
                    : 'border-cream-dark text-coffee-light hover:border-coffee-accent/40'
                }`}
              >
                <CreditCard size={16} />
                Thẻ / QR
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowSplitBill(true)}
                className="flex-1 min-h-[44px] btn-secondary flex items-center justify-center gap-1.5 text-sm"
              >
                Tách đơn
              </button>
              <button
                onClick={() => setShowPayConfirm(true)}
                className="flex-[2] min-h-[44px] btn-primary flex items-center justify-center gap-2 text-base"
              >
                <Receipt size={20} />
                Thanh toán
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== Modals ===== */}

      {/* Table Picker */}
      {showTablePicker && <TablePickerPanel onClose={() => setShowTablePicker(false)} />}

      {/* Item Detail Modal */}
      {selectedItem && (
        <ItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onConfirm={handleAddItem}
        />
      )}

      {/* Payment Confirm Modal */}
      {showPayConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(26,15,10,0.65)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white rounded-3xl shadow-coffee-lg w-full max-w-sm p-6 animate-slide-up">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #A76D42, #C8956C)' }}>
                <Receipt size={26} className="text-white" />
              </div>
              <h3 className="font-display font-bold text-xl text-coffee-dark">Xác nhận thanh toán</h3>
              <p className="text-coffee-light text-sm mt-1">
                {tableLabel} · {paymentMethod === 'cash' ? 'Tiền mặt' : 'Thẻ / QR Code'}
              </p>
            </div>
            <div className="bg-cream-light rounded-2xl p-4 mb-5 space-y-2">
              <div className="flex justify-between text-sm text-coffee-medium">
                <span>Số món</span>
                <span className="font-semibold">{cartCount} món</span>
              </div>
              <div className="flex justify-between text-sm text-coffee-medium">
                <span>Tạm tính</span>
                <span>{subtotal.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between text-sm text-coffee-medium">
                <span>VAT 8%</span>
                <span>+{vatAmount.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="border-t border-cream-dark pt-2 flex justify-between font-bold text-coffee-dark text-lg">
                <span>Tổng</span>
                <span className="text-coffee-accent">{total.toLocaleString('vi-VN')}đ</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowPayConfirm(false)} className="min-h-[44px] flex-1 btn-secondary">Hủy</button>
              <button onClick={handleConfirmPayment} className="min-h-[44px] flex-1 btn-primary">Xem hóa đơn</button>
            </div>
          </div>
        </div>
      )}

      {/* Thermal Bill Modal */}
      {showThermal && pendingOrder && (
        <ThermalBillModal
          order={pendingOrder}
          onConfirm={handleFinishCheckout}
          onClose={() => {
            // Cancel: order was already saved to history, just close thermal, keep cart
            setShowThermal(false);
            setPendingOrder(null);
          }}
        />
      )}

      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up pointer-events-none">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl shadow-coffee-lg text-white text-sm font-medium ${
            notification.type === 'success' ? 'bg-green-600' :
            notification.type === 'error' ? 'bg-red-600' : 'bg-coffee-dark'
          }`}>
            {notification.message}
          </div>
        </div>
      )}
      {/* Split Bill Modal */}
      {showSplitBill && (
        <SplitBillModal 
          cart={cart}
          onClose={() => setShowSplitBill(false)}
          onConfirmSplit={handleConfirmSplit}
        />
      )}
    </div>
  );
}
