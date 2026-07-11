import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Minus, Plus, RefreshCw, Search, Send, ShoppingBag, Store, UtensilsCrossed, XCircle } from 'lucide-react';
import { api } from '../api';

const STATUS_COPY = {
  pending: { title: 'Đã gửi tới nhân viên', detail: 'Yêu cầu đang chờ quán xác nhận.', icon: Clock3, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  accepted: { title: 'Quán đã nhận món', detail: 'Đơn đã được chuyển tới quầy pha chế.', icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  rejected: { title: 'Yêu cầu chưa được nhận', detail: 'Vui lòng trao đổi trực tiếp với nhân viên tại quán.', icon: XCircle, color: 'text-red-700 bg-red-50 border-red-200' },
  cancelled: { title: 'Yêu cầu đã hủy', detail: 'Vui lòng tạo yêu cầu mới nếu bạn vẫn muốn gọi món.', icon: XCircle, color: 'text-slate-700 bg-slate-50 border-slate-200' }
};

function currency(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('vi-VN')}đ`;
}

function newRequestId() {
  return window.crypto?.randomUUID?.() || `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function GuestOrderPage({ token }) {
  const [menuData, setMenuData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const [cart, setCart] = useState({});
  const [guestName, setGuestName] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tracking, setTracking] = useState(null);

  const trackingKey = `manager_coffee_guest_order:${token}`;

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/public/tables/${encodeURIComponent(token)}/menu`);
      setMenuData(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Không thể tải thực đơn. Vui lòng quét lại mã QR trên bàn.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadStatus = useCallback(async (guestOrderId) => {
    try {
      const status = await api.get(`/public/guest-orders/${guestOrderId}/status`, { params: { token } });
      setTracking(status);
      localStorage.setItem(trackingKey, JSON.stringify({ id: guestOrderId }));
      return status;
    } catch (err) {
      if (err.response?.status === 404) localStorage.removeItem(trackingKey);
      return null;
    }
  }, [token, trackingKey]);

  useEffect(() => {
    loadMenu();
    try {
      const saved = JSON.parse(localStorage.getItem(trackingKey));
      if (saved?.id) loadStatus(saved.id);
    } catch {
      localStorage.removeItem(trackingKey);
    }
  }, [loadMenu, loadStatus, trackingKey]);

  useEffect(() => {
    if (!tracking?.id || !['pending', 'accepted'].includes(tracking.status)) return undefined;
    const timer = setInterval(() => loadStatus(tracking.id), 5000);
    return () => clearInterval(timer);
  }, [loadStatus, tracking?.id, tracking?.status]);

  const categories = useMemo(() => {
    const values = [...new Set((menuData?.products || []).map((product) => product.category).filter(Boolean))];
    return ['Tất cả', ...values];
  }, [menuData]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');
    return (menuData?.products || []).filter((product) => {
      const matchesCategory = category === 'Tất cả' || product.category === category;
      const matchesSearch = !query || `${product.name} ${product.description || ''}`.toLocaleLowerCase('vi').includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [category, menuData, search]);

  const cartLines = useMemo(() => Object.values(cart).filter((line) => line.qty > 0), [cart]);
  const itemCount = cartLines.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = cartLines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const vatAmount = Math.round(subtotal * Number(menuData?.store?.vatRate || 0));
  const estimatedTotal = subtotal + vatAmount;

  const changeQty = (product, delta) => {
    setCart((current) => {
      const existing = current[product.id] || { ...product, productId: product.id, qty: 0, note: '' };
      const qty = Math.max(0, Math.min(20, existing.qty + delta));
      if (qty === 0) {
        const next = { ...current };
        delete next[product.id];
        return next;
      }
      return { ...current, [product.id]: { ...existing, qty } };
    });
  };

  const submitOrder = async () => {
    if (cartLines.length === 0 || submitting) return;
    setSubmitting(true);
    setError('');
    const clientRequestId = newRequestId();
    try {
      const created = await api.post(`/public/tables/${encodeURIComponent(token)}/orders`, {
        clientRequestId,
        guestName: guestName.trim() || null,
        note: orderNote.trim() || null,
        items: cartLines.map((line) => ({ productId: line.productId, qty: line.qty, note: line.note || null }))
      }, { headers: { 'Idempotency-Key': clientRequestId } });
      setTracking(created);
      localStorage.setItem(trackingKey, JSON.stringify({ id: created.id }));
      setCart({});
    } catch (err) {
      setError(err.response?.data?.error || 'Không thể gửi yêu cầu gọi món. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const startAnotherOrder = () => {
    localStorage.removeItem(trackingKey);
    setTracking(null);
    setError('');
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600"><RefreshCw className="animate-spin mr-2" size={20} /> Đang tải thực đơn...</div>;
  }

  if (!menuData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <XCircle className="mx-auto text-red-500 mb-3" size={36} />
          <h1 className="text-lg font-bold text-slate-900">Không mở được thực đơn</h1>
          <p className="text-sm text-slate-600 mt-2">{error}</p>
          <button onClick={loadMenu} className="btn-primary mt-5">Thử lại</button>
        </div>
      </div>
    );
  }

  if (tracking) {
    const copy = STATUS_COPY[tracking.status] || STATUS_COPY.pending;
    const StatusIcon = copy.icon;
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-4 py-4">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 text-white rounded-lg flex items-center justify-center"><Store size={20} /></div>
            <div><h1 className="font-bold text-slate-900">{menuData.store.name}</h1><p className="text-xs text-slate-500">{menuData.table.name} · {menuData.table.zone}</p></div>
          </div>
        </header>
        <main className="max-w-lg mx-auto p-4 pt-10">
          <section className={`border rounded-lg p-6 text-center ${copy.color}`}>
            <StatusIcon size={42} className="mx-auto mb-4" />
            <h2 className="text-xl font-bold">{copy.title}</h2>
            <p className="text-sm mt-2 opacity-80">{copy.detail}</p>
            {tracking.order?.orderNumber && <p className="mt-5 text-sm font-semibold">Mã đơn: {tracking.order.orderNumber}</p>}
            {tracking.order?.total !== undefined && <p className="text-2xl font-bold mt-1">{currency(tracking.order.total)}</p>}
            {tracking.order?.prepStatus === 'preparing' && <p className="mt-3 text-sm font-semibold">Quầy đang pha chế món của bạn</p>}
            {tracking.order?.prepStatus === 'completed' && <p className="mt-3 text-sm font-semibold">Món đã hoàn thành</p>}
          </section>
          <button onClick={() => loadStatus(tracking.id)} className="btn-secondary w-full mt-4 flex items-center justify-center gap-2"><RefreshCw size={16} /> Cập nhật trạng thái</button>
          {tracking.status !== 'pending' && <button onClick={startAnotherOrder} className="btn-primary w-full mt-3 flex items-center justify-center gap-2"><Plus size={16} /> Gọi thêm món</button>}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-600 text-white rounded-lg flex items-center justify-center flex-shrink-0"><UtensilsCrossed size={20} /></div>
          <div className="min-w-0"><h1 className="font-bold text-slate-900 truncate">{menuData.store.name}</h1><p className="text-xs text-slate-500">{menuData.table.name} · {menuData.table.zone}</p></div>
          <div className="ml-auto text-right"><p className="text-xs text-slate-500">Tạm tính</p><p className="font-bold text-primary-700">{currency(estimatedTotal)}</p></div>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm món..." className="input-field pl-9" /></div>
          <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide">
            {categories.map((name) => <button key={name} onClick={() => setCategory(name)} className={`min-h-[36px] whitespace-nowrap px-3 rounded-lg text-sm font-semibold border ${category === name ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200'}`}>{name}</button>)}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleProducts.map((product) => {
            const qty = cart[product.id]?.qty || 0;
            return (
              <article key={product.id} className="bg-white border border-slate-200 rounded-lg p-3 flex gap-3 shadow-sm">
                {product.image ? <img src={product.image} alt="" className="w-20 h-20 rounded-lg object-cover bg-slate-100 flex-shrink-0" /> : <div className="w-20 h-20 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400"><ShoppingBag size={24} /></div>}
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-slate-900 leading-snug">{product.name}</h2>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{product.description || product.category}</p>
                  <div className="flex items-end justify-between mt-2 gap-2">
                    <span className="font-bold text-primary-700">{currency(product.price)}</span>
                    {qty === 0 ? <button onClick={() => changeQty(product, 1)} title="Thêm món" className="w-9 h-9 rounded-lg bg-primary-600 text-white flex items-center justify-center"><Plus size={18} /></button> : <div className="flex items-center gap-2"><button onClick={() => changeQty(product, -1)} title="Giảm" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center"><Minus size={15} /></button><span className="w-5 text-center font-bold">{qty}</span><button onClick={() => changeQty(product, 1)} title="Tăng" className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center"><Plus size={15} /></button></div>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {itemCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 shadow-2xl">
          <div className="max-w-3xl mx-auto p-3">
            <details className="mb-3 group">
              <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-slate-700"><span>{itemCount} món · {currency(estimatedTotal)}</span><span className="text-primary-700">Thông tin đơn</span></summary>
              <div className="grid sm:grid-cols-2 gap-2 mt-3">
                <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={80} placeholder="Tên của bạn (không bắt buộc)" className="input-field" />
                <input value={orderNote} onChange={(event) => setOrderNote(event.target.value)} maxLength={500} placeholder="Ghi chú chung cho quán" className="input-field" />
              </div>
            </details>
            <button onClick={submitOrder} disabled={submitting} className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-60"><Send size={18} /> {submitting ? 'Đang gửi...' : 'Gửi yêu cầu gọi món'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
