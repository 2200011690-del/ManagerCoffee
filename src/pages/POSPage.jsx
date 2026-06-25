import { useState, useMemo, useEffect } from 'react';
import {
  Search, ShoppingCart, Trash2, CreditCard, Banknote, Receipt, Tag,
  LayoutGrid, X, ArrowLeftRight, User, Gift, SplitSquareVertical, CheckCircle,
  Lock, Unlock, Clock, AlertTriangle, Pause, RotateCcw, Percent, Layers
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
import ReturnOrderModal from '../components/pos/ReturnOrderModal';
import HeldOrdersPanel from '../components/pos/HeldOrdersPanel';
import SplitPaymentModal from '../components/pos/SplitPaymentModal';

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
    activeTableId, setSelectedTable, setTakeaway, tableHasCart, tableCarts,
    applyItemDiscount
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

  // Phase 1 states
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showHeldOrders, setShowHeldOrders] = useState(false);
  const [showSplitPayment, setShowSplitPayment] = useState(false);
  const [orderDiscountValue, setOrderDiscountValue] = useState('');
  const [orderDiscountType, setOrderDiscountType] = useState('PERCENT');
  const [showOrderDiscount, setShowOrderDiscount] = useState(false);
  const [orderDiscountAmount, setOrderDiscountAmount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');

  // Cash Shift Handover states
  const [activeShift, setActiveShift] = useState(null);
  const [isLoadingShift, setIsLoadingShift] = useState(true);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState('0');
  const [actualCashInput, setActualCashInput] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');

  const loadActiveShift = async () => {
    if (!currentUser) return;
    if (currentUser.role === 'admin') {
      setIsLoadingShift(false);
      return;
    }
    try {
      const shift = await api.get(`/shifts/active/${currentUser.id}`);
      setActiveShift(shift);
      if (!shift) {
        setShowOpenShiftModal(true);
      }
    } catch (err) {
      console.error('Lỗi khi tải thông tin ca làm việc:', err);
    } finally {
      setIsLoadingShift(false);
    }
  };

  useEffect(() => {
    loadActiveShift();
  }, [currentUser]);

  const handleOpenShift = async (openingCash) => {
    try {
      const shift = await api.post('/shifts/open', {
        userId: currentUser.id,
        openingCash
      });
      setActiveShift(shift);
      setShowOpenShiftModal(false);
      showNotification('Mở ca bán hàng thành công!', 'success');
    } catch (err) {
      showNotification(err.response?.data?.error || 'Lỗi khi mở ca', 'error');
    }
  };

  const handleCloseShift = async (actualCash, notes) => {
    try {
      await api.post('/shifts/close', {
        shiftId: activeShift.id,
        actualCash,
        notes
      });
      setActiveShift(null);
      setShowCloseShiftModal(false);
      setActualCashInput('');
      setShiftNotes('');
      showNotification('Đóng ca và bàn giao két thành công!', 'success');
      setShowOpenShiftModal(true);
    } catch (err) {
      showNotification(err.response?.data?.error || 'Lỗi khi đóng ca', 'error');
    }
  };

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

  const totalDiscount = discountAmount + orderDiscountAmount;
  const finalTotal = total - totalDiscount > 0 ? total - totalDiscount : 0;

  // ---- Checkout Handlers ----
  const handleConfirmPayment = async (splitPayments = null) => {
    // Build order object
    const tableName = activeTableId ? (activeTable?.name ?? activeTableId) : 'Mang về';
    const newOrder = await addOrder({
      tableId: activeTableId,
      tableName,
      cart,
      subtotal,
      vatAmount,
      total: finalTotal,
      paymentMethod: splitPayments ? 'mixed' : paymentMethod,
      customerId: customer?.id,
      voucherCode: appliedVoucher?.code,
      discountAmount: totalDiscount,
      employeeId: currentUser?.id,
      // Phase 1 fields
      orderDiscount: orderDiscountAmount,
      orderDiscountType: orderDiscountAmount > 0 ? orderDiscountType : null,
      discountReason: discountReason || null,
      payments: splitPayments || null
    });
    setPendingOrder(newOrder);
    setShowPayConfirm(false);
    setShowSplitPayment(false);
    setShowThermal(true);
  };

  // Hold current order
  const handleHoldOrder = async () => {
    if (cart.length === 0) return;
    try {
      const tableName = activeTableId ? (activeTable?.name ?? activeTableId) : 'Mang về';
      await api.post('/held-orders', {
        tableId: activeTableId,
        tableName,
        note: '',
        employeeId: currentUser?.id,
        employeeName: currentUser?.name,
        customerId: customer?.id,
        items: cart
      });
      clearCurrentCart(activeTableId);
      showNotification('Đã lưu đơn tạm giữ!', 'success');
    } catch (err) {
      showNotification('Lỗi khi giữ đơn', 'error');
    }
  };

  // Recall held order
  const handleRecallHeldOrder = (held) => {
    // Load items back to cart
    held.items.forEach(item => {
      addToCart(
        { id: item.productId, name: item.name, price: item.price },
        item.sugar || '100% đường',
        item.ice || '100% đá',
        item.note || ''
      );
    });
    setShowHeldOrders(false);
    showNotification('Đã thu hồi đơn tạm giữ!', 'success');
  };

  // Apply order-level discount
  const handleApplyOrderDiscount = () => {
    const val = Number(orderDiscountValue);
    if (!val || val <= 0) {
      setOrderDiscountAmount(0);
      setShowOrderDiscount(false);
      return;
    }
    let amount = 0;
    if (orderDiscountType === 'PERCENT') {
      amount = Math.round(total * (val / 100));
    } else {
      amount = val;
    }
    if (amount > total) amount = total;
    setOrderDiscountAmount(amount);
    setShowOrderDiscount(false);
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
    loadActiveShift();
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
        {/* Shift Control bar */}
        {activeShift && (
          <div className="px-5 py-2.5 bg-[#F6ECE2] border-b border-cream-medium/40 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[11px] font-semibold text-coffee-medium">
                Ca đang mở: {new Date(activeShift.openedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <button
              onClick={() => {
                setActualCashInput('');
                setShiftNotes('');
                setShowCloseShiftModal(true);
              }}
              className="text-[11px] font-bold text-coffee-accent hover:text-coffee-dark hover:underline flex items-center gap-1"
            >
              <Clock size={11} />
              Đóng ca & Giao két
            </button>
          </div>
        )}

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
                <CartItem key={item.cartItemId} item={item} onRemove={removeFromCart} onUpdateQty={updateQty} onApplyDiscount={applyItemDiscount} />
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
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span>Voucher ({appliedVoucher?.code})</span>
                  <span>-{discountAmount.toLocaleString('vi-VN')}đ</span>
                </div>
              )}
              {orderDiscountAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span className="flex items-center gap-1">
                    <Percent size={12} />
                    Giảm giá đơn
                    <button onClick={() => { setOrderDiscountAmount(0); setOrderDiscountValue(''); setDiscountReason(''); }} className="text-red-400 text-[10px] hover:underline ml-1">Xóa</button>
                  </span>
                  <span>-{orderDiscountAmount.toLocaleString('vi-VN')}đ</span>
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

            {/* Action buttons row 1: Discount + Hold */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowOrderDiscount(true)}
                className="flex-1 min-h-[38px] flex items-center justify-center gap-1 rounded-xl text-xs font-semibold border-2 border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-all"
              >
                <Percent size={13} />
                Giảm giá đơn
              </button>
              <button
                onClick={handleHoldOrder}
                className="flex-1 min-h-[38px] flex items-center justify-center gap-1 rounded-xl text-xs font-semibold border-2 border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all"
              >
                <Pause size={13} />
                Giữ đơn
              </button>
              <button
                onClick={() => setShowHeldOrders(true)}
                className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl border-2 border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all"
                title="Xem đơn tạm giữ"
              >
                <Layers size={13} />
              </button>
            </div>

            {/* Action buttons row 2: Split Bill + Return + Checkout */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowSplitBill(true)}
                className="flex-1 min-h-[44px] btn-secondary flex items-center justify-center gap-1.5 text-xs"
              >
                Tách đơn
              </button>
              <button
                onClick={() => setShowReturnModal(true)}
                className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 text-xs font-semibold border-2 border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all"
              >
                <RotateCcw size={13} />
                Trả hàng
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSplitPayment(true)}
                className="flex-1 min-h-[44px] btn-secondary flex items-center justify-center gap-1.5 text-xs"
              >
                <Layers size={14} />
                TT kết hợp
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
              {totalDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span>Giảm giá</span>
                  <span>-{totalDiscount.toLocaleString('vi-VN')}đ</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-coffee-medium">
                <span>VAT 8%</span>
                <span>+{vatAmount.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="border-t border-cream-dark pt-2 flex justify-between font-bold text-coffee-dark text-lg">
                <span>Tổng</span>
                <span className="text-coffee-accent">{finalTotal.toLocaleString('vi-VN')}đ</span>
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

      {/* Split Bill Modal */}
      {showSplitBill && (
        <SplitBillModal 
          cart={cart}
          onClose={() => setShowSplitBill(false)}
          onConfirmSplit={handleConfirmSplit}
        />
      )}

      {/* Open Shift Modal */}
      {showOpenShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(26,15,10,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl shadow-coffee-lg w-full max-w-sm p-6 animate-slide-up border border-cream-medium/40">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-coffee-accent/15 text-coffee-accent">
                <Lock size={26} />
              </div>
              <h3 className="font-display font-bold text-xl text-coffee-dark">Bắt đầu ca bán hàng</h3>
              <p className="text-coffee-light text-xs mt-1">
                Vui lòng khai báo tiền mặt lẻ đầu ca để bắt đầu sử dụng POS
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-coffee-medium uppercase tracking-wider mb-1.5">
                  Tiền mặt đầu ca (VNĐ)
                </label>
                <input
                  type="number"
                  value={openingCashInput}
                  onChange={e => setOpeningCashInput(e.target.value)}
                  placeholder="Nhập số tiền..."
                  className="input-field w-full font-mono text-base font-bold text-coffee-dark bg-cream-light/30 border-cream-medium focus:border-coffee-accent focus:ring-coffee-accent/25"
                />
                <p className="text-[10px] text-coffee-light mt-1">
                  * Tiền mặt lẻ trong két dùng để thối khách hàng.
                </p>
              </div>

              <button
                onClick={() => handleOpenShift(Number(openingCashInput) || 0)}
                className="w-full min-h-[44px] btn-primary flex items-center justify-center gap-2 text-base font-bold"
              >
                <Unlock size={18} />
                Mở ca bán hàng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Shift & Handover Modal */}
      {showCloseShiftModal && activeShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(26,15,10,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl shadow-coffee-lg w-full max-w-md p-6 animate-slide-up border border-cream-medium/40 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-cream-medium/40 mb-4">
              <div className="flex items-center gap-2 text-coffee-dark font-display font-bold text-lg">
                <Clock size={20} className="text-coffee-accent animate-pulse-soft" />
                <h3>Chốt ca & Giao két</h3>
              </div>
              <button 
                onClick={() => setShowCloseShiftModal(false)}
                className="p-1 rounded-lg hover:bg-cream-light text-coffee-light hover:text-coffee-dark transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs bg-cream-light/60 p-3 rounded-2xl border border-cream-medium/20">
                <div>
                  <span className="text-coffee-light block">Thu ngân:</span>
                  <span className="font-bold text-coffee-dark">{currentUser?.name}</span>
                </div>
                <div>
                  <span className="text-coffee-light block">Giờ mở ca:</span>
                  <span className="font-bold text-coffee-dark">
                    {new Date(activeShift.openedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ({new Date(activeShift.openedAt).toLocaleDateString('vi-VN')})
                  </span>
                </div>
              </div>

              <div className="space-y-2 border-b border-cream-medium/30 pb-3">
                <div className="flex justify-between text-xs text-coffee-medium">
                  <span>Tiền mặt đầu ca:</span>
                  <span className="font-mono font-semibold">{activeShift.openingCash.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="flex justify-between text-xs text-coffee-medium">
                  <span>+ Doanh số tiền mặt tích lũy:</span>
                  <span className="font-mono font-semibold text-green-600">+{activeShift.cashSales.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="divider my-1" />
                <div className="flex justify-between text-sm font-bold text-coffee-dark">
                  <span>Tiền mặt dự kiến trong két:</span>
                  <span className="font-mono text-coffee-accent">{activeShift.expectedCash.toLocaleString('vi-VN')}đ</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-coffee-medium uppercase tracking-wider mb-1.5">
                    Tiền mặt thực tế đếm được (VNĐ)
                  </label>
                  <input
                    type="number"
                    value={actualCashInput}
                    onChange={e => setActualCashInput(e.target.value)}
                    placeholder="Nhập số tiền mặt trong két..."
                    className="input-field w-full font-mono text-base font-bold text-coffee-dark bg-cream-light/30 border-cream-medium focus:border-coffee-accent focus:ring-coffee-accent/25"
                  />
                </div>

                {actualCashInput !== '' && (
                  <div className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-semibold ${
                    Number(actualCashInput) - activeShift.expectedCash === 0
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : Number(actualCashInput) - activeShift.expectedCash > 0
                        ? 'bg-blue-50 border-blue-200 text-blue-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                  }`}>
                    <span>Chênh lệch két:</span>
                    <span className="font-mono font-bold text-sm">
                      {(Number(actualCashInput) - activeShift.expectedCash).toLocaleString('vi-VN', { signDisplay: 'always' })}đ
                    </span>
                  </div>
                )}

                {actualCashInput !== '' && Number(actualCashInput) - activeShift.expectedCash !== 0 && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                    <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Lệch két tiền mặt!</p>
                      <p className="text-[10px] leading-relaxed">
                        Số tiền thực tế lệch {(Number(actualCashInput) - activeShift.expectedCash) > 0 ? 'thừa' : 'thiếu'} so với phần mềm. Vui lòng nhập lý do giải trình.
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-coffee-medium uppercase tracking-wider mb-1.5">
                    Ghi chú / Giải trình {actualCashInput !== '' && Number(actualCashInput) - activeShift.expectedCash !== 0 && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    rows={2}
                    value={shiftNotes}
                    onChange={e => setShiftNotes(e.target.value)}
                    placeholder="Ghi chú thối nhầm tiền, chi lẻ hoặc các lý do chênh lệch..."
                    className="input-field w-full text-xs"
                    required={actualCashInput !== '' && Number(actualCashInput) - activeShift.expectedCash !== 0}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCloseShiftModal(false)}
                  className="min-h-[44px] flex-1 btn-secondary"
                >
                  Quay lại
                </button>
                <button
                  onClick={() => {
                    const isLethal = actualCashInput !== '' && Number(actualCashInput) - activeShift.expectedCash !== 0;
                    if (isLethal && !shiftNotes.trim()) {
                      alert('Vui lòng nhập ghi chú giải trình lý do lệch két tiền!');
                      return;
                    }
                    handleCloseShift(Number(actualCashInput) || 0, shiftNotes);
                  }}
                  className="min-h-[44px] flex-[2] btn-primary bg-coffee-accent font-bold"
                >
                  Xác nhận giao két
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Phase 1 Modals ===== */}

      {/* Order-level Discount Popup */}
      {showOrderDiscount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(26,15,10,0.55)', backdropFilter: 'blur(5px)' }}>
          <div className="bg-white rounded-3xl shadow-coffee-lg w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <Percent size={20} className="text-green-600" />
                </div>
                <h3 className="font-display font-bold text-coffee-dark">Giảm giá đơn hàng</h3>
              </div>
              <button onClick={() => setShowOrderDiscount(false)} className="min-w-[36px] min-h-[36px] rounded-lg bg-cream-light flex items-center justify-center text-coffee-medium hover:bg-cream-medium transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex gap-1.5">
                <button
                  onClick={() => setOrderDiscountType('PERCENT')}
                  className={`flex-1 min-h-[40px] rounded-xl text-sm font-semibold transition-all border-2 ${
                    orderDiscountType === 'PERCENT' ? 'bg-coffee-accent text-white border-coffee-accent' : 'bg-cream-light text-coffee-medium border-cream-dark'
                  }`}
                >
                  % Phần trăm
                </button>
                <button
                  onClick={() => setOrderDiscountType('FIXED')}
                  className={`flex-1 min-h-[40px] rounded-xl text-sm font-semibold transition-all border-2 ${
                    orderDiscountType === 'FIXED' ? 'bg-coffee-accent text-white border-coffee-accent' : 'bg-cream-light text-coffee-medium border-cream-dark'
                  }`}
                >
                  VNĐ Tiền
                </button>
              </div>
              <input
                type="number"
                value={orderDiscountValue}
                onChange={e => setOrderDiscountValue(e.target.value)}
                placeholder={orderDiscountType === 'PERCENT' ? 'Nhập % (vd: 10)' : 'Nhập số tiền giảm'}
                className="input-field w-full min-h-[44px] font-mono text-base"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleApplyOrderDiscount()}
              />
              <div>
                <label className="block text-xs font-bold text-coffee-medium uppercase tracking-wider mb-1.5">
                  Lý do giảm giá
                </label>
                <input
                  type="text"
                  value={discountReason}
                  onChange={e => setDiscountReason(e.target.value)}
                  placeholder="VD: Khách quen, chương trình khuyến mãi..."
                  className="input-field w-full text-sm min-h-[40px]"
                />
              </div>
              {orderDiscountValue && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-green-700">Giảm giá dự kiến:</p>
                  <p className="text-lg font-bold text-green-700 font-mono">
                    -{(orderDiscountType === 'PERCENT'
                      ? Math.round(total * (Number(orderDiscountValue) / 100))
                      : Number(orderDiscountValue)
                    ).toLocaleString('vi-VN')}đ
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowOrderDiscount(false)} className="flex-1 min-h-[44px] btn-secondary">Hủy</button>
                <button onClick={handleApplyOrderDiscount} className="flex-1 min-h-[44px] btn-primary">Áp dụng</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return Order Modal */}
      {showReturnModal && (
        <ReturnOrderModal
          onClose={() => setShowReturnModal(false)}
          onSuccess={() => {
            showNotification('Trả hàng thành công!', 'success');
            loadActiveShift();
          }}
        />
      )}

      {/* Held Orders Panel */}
      {showHeldOrders && (
        <HeldOrdersPanel
          onClose={() => setShowHeldOrders(false)}
          onRecall={handleRecallHeldOrder}
          currentUser={currentUser}
        />
      )}

      {/* Split Payment Modal */}
      {showSplitPayment && (
        <SplitPaymentModal
          total={finalTotal}
          onClose={() => setShowSplitPayment(false)}
          onConfirm={(payments) => handleConfirmPayment(payments)}
        />
      )}
    </div>
  );
}
