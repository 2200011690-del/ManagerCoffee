import { useCallback, useEffect, useState } from 'react';
import { Banknote, BellRing, Check, Clock3, CreditCard, RefreshCw, ShoppingBag, UserRound, X } from 'lucide-react';
import { api } from '../../api';
import { socket } from '../../socket';
import { useUI } from '../../context/UIContext';

function currency(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('vi-VN')}đ`;
}

export default function GuestOrderInbox() {
  const { showNotification } = useUI();
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/guest-orders', { params: { status: 'all' } });
      const list = Array.isArray(data) ? data : [];
      setOrders(list.filter((item) => item.status === 'pending' || (item.status === 'accepted' && item.order?.status === 'pending')));
    } catch (err) {
      console.error('Không thể tải yêu cầu gọi món:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const refresh = () => loadOrders();
    socket.on('guestOrderCreated', refresh);
    socket.on('guestOrderUpdated', refresh);
    const interval = setInterval(loadOrders, 30000);
    return () => {
      socket.off('guestOrderCreated', refresh);
      socket.off('guestOrderUpdated', refresh);
      clearInterval(interval);
    };
  }, [loadOrders]);

  const accept = async (id) => {
    setProcessingId(id);
    try {
      const order = await api.post(`/guest-orders/${id}/accept`, {});
      setOrders((current) => current.filter((item) => item.id !== id));
      showNotification(`Đã chuyển ${order.orderNumber} tới quầy pha chế`, 'success');
    } catch (err) {
      showNotification(err.response?.data?.error || 'Không thể nhận yêu cầu gọi món', 'error');
      loadOrders();
    } finally {
      setProcessingId(null);
    }
  };

  const reject = async (id) => {
    const reason = window.prompt('Lý do từ chối (không bắt buộc):', '') ?? null;
    if (reason === null) return;
    setProcessingId(id);
    try {
      await api.post(`/guest-orders/${id}/reject`, { reason });
      setOrders((current) => current.filter((item) => item.id !== id));
      showNotification('Đã từ chối yêu cầu gọi món', 'success');
    } catch (err) {
      showNotification(err.response?.data?.error || 'Không thể từ chối yêu cầu', 'error');
      loadOrders();
    } finally {
      setProcessingId(null);
    }
  };

  const pay = async (guestOrder, paymentMethod) => {
    setProcessingId(guestOrder.id);
    try {
      const amount = guestOrder.order.total;
      const paidOrder = await api.put(`/orders/${guestOrder.order.id}/pay`, {
        paymentMethod,
        payments: [{ method: paymentMethod, amount, reference: `QR-${guestOrder.id}` }]
      });
      setOrders((current) => current.filter((item) => item.id !== guestOrder.id));
      showNotification(`Đã thanh toán ${paidOrder.orderNumber}`, 'success');
    } catch (err) {
      showNotification(err.response?.data?.error || 'Không thể thanh toán đơn QR', 'error');
      loadOrders();
    } finally {
      setProcessingId(null);
    }
  };

  const pendingCount = orders.filter((order) => order.status === 'pending').length;

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); loadOrders(); }} className="relative min-h-[38px] px-3 rounded-lg border border-surface-border bg-white text-ink-medium hover:bg-surface-muted text-sm font-semibold flex items-center gap-2">
        <BellRing size={16} />
        <span className="hidden sm:inline">Khách gọi món</span>
        {orders.length > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] flex items-center justify-center">{orders.length}</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] bg-slate-950/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="modal-surface w-full sm:max-w-2xl max-h-[88vh] overflow-hidden flex flex-col rounded-b-none sm:rounded-lg">
            <header className="px-5 py-4 border-b border-surface-border flex items-center gap-3">
              <BellRing size={18} className="text-primary-600" />
              <div><h2 className="font-bold text-ink-dark">Đơn QR tại bàn</h2><p className="text-xs text-ink-medium">{pendingCount} yêu cầu chờ nhận · {orders.length - pendingCount} đơn chờ thanh toán</p></div>
              <button onClick={loadOrders} title="Tải lại" className="ml-auto w-9 h-9 rounded-lg hover:bg-surface-muted flex items-center justify-center text-ink-medium"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
              <button onClick={() => setOpen(false)} title="Đóng" className="w-9 h-9 rounded-lg hover:bg-surface-muted flex items-center justify-center text-ink-medium"><X size={18} /></button>
            </header>
            <div className="overflow-y-auto p-4 space-y-3 bg-surface-bg">
              {!loading && orders.length === 0 && <div className="py-14 text-center text-ink-medium"><ShoppingBag size={32} className="mx-auto mb-3 text-ink-light" /><p className="font-semibold">Không có yêu cầu đang chờ</p></div>}
              {orders.map((order) => {
                const total = order.order?.total ?? order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
                return (
                  <article key={order.id} className="bg-white border border-surface-border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-surface-border flex items-start justify-between gap-3">
                      <div><h3 className="font-bold text-ink-dark">{order.table?.name} <span className="font-normal text-ink-medium">· {order.table?.zone}</span></h3><p className="text-xs text-ink-medium mt-1 flex items-center gap-1"><Clock3 size={12} /> {new Date(order.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}{order.guestName && <><UserRound size={12} className="ml-2" /> {order.guestName}</>}</p></div>
                      <div className="text-right"><span className="font-bold text-primary-700">{currency(total)}</span><p className={`text-[11px] font-semibold mt-1 ${order.status === 'pending' ? 'text-amber-700' : 'text-blue-700'}`}>{order.status === 'pending' ? 'Chờ nhận món' : `${order.order?.orderNumber} · Chờ thanh toán`}</p></div>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {order.items.map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span className="text-ink-dark"><strong>{item.qty}x</strong> {item.name}{item.note && <small className="block text-amber-700 ml-5">{item.note}</small>}</span><span className="text-ink-medium whitespace-nowrap">{currency(item.price * item.qty)}</span></div>)}
                      {order.note && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2">Ghi chú: {order.note}</p>}
                    </div>
                    <footer className="px-4 py-3 bg-surface-muted border-t border-surface-border flex gap-2">
                      {order.status === 'pending' ? <>
                        <button disabled={processingId === order.id} onClick={() => reject(order.id)} className="btn-danger flex-1 min-h-[40px] flex items-center justify-center gap-2 disabled:opacity-50"><X size={15} /> Từ chối</button>
                        <button disabled={processingId === order.id} onClick={() => accept(order.id)} className="btn-primary flex-[2] min-h-[40px] flex items-center justify-center gap-2 disabled:opacity-50"><Check size={16} /> Nhận và chuyển bếp</button>
                      </> : <>
                        <button disabled={processingId === order.id} onClick={() => pay(order, 'cash')} className="btn-primary flex-1 min-h-[40px] flex items-center justify-center gap-2 disabled:opacity-50"><Banknote size={16} /> Tiền mặt</button>
                        <button disabled={processingId === order.id} onClick={() => pay(order, 'transfer')} className="btn-secondary flex-1 min-h-[40px] flex items-center justify-center gap-2 disabled:opacity-50"><CreditCard size={16} /> Chuyển khoản</button>
                      </>}
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
