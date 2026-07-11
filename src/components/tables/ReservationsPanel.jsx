import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarDays, CheckCircle2, Clock3, Phone, Plus, RefreshCw, UserRoundCheck, Users, X, XCircle } from 'lucide-react';
import { api } from '../../api';
import { socket } from '../../socket';
import { useUI } from '../../context/UIContext';

const STATUS_LABELS = { pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', seated: 'Đã nhận bàn', completed: 'Hoàn thành', cancelled: 'Đã hủy', no_show: 'Không đến' };
const STATUS_CLASSES = { pending: 'bg-amber-50 text-amber-700 border-amber-200', confirmed: 'bg-blue-50 text-blue-700 border-blue-200', seated: 'bg-emerald-50 text-emerald-700 border-emerald-200', completed: 'bg-slate-100 text-slate-700 border-slate-200', cancelled: 'bg-red-50 text-red-700 border-red-200', no_show: 'bg-orange-50 text-orange-700 border-orange-200' };

function dateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function dateTimeInputValue(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function currency(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('vi-VN')}đ`;
}

export default function ReservationsPanel({ tables }) {
  const { showNotification } = useUI();
  const [selectedDate, setSelectedDate] = useState(dateInputValue());
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const dayRange = useMemo(() => {
    const from = new Date(`${selectedDate}T00:00:00`);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [selectedDate]);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/reservations', { params: dayRange });
      setReservations(Array.isArray(data) ? data : []);
    } catch (err) {
      showNotification(err.response?.data?.error || 'Không thể tải lịch đặt bàn', 'error');
    } finally {
      setLoading(false);
    }
  }, [dayRange, showNotification]);

  useEffect(() => {
    loadReservations();
    const refresh = () => loadReservations();
    socket.on('reservationUpdated', refresh);
    return () => socket.off('reservationUpdated', refresh);
  }, [loadReservations]);

  const openCreate = () => {
    const start = new Date();
    start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15 + 30, 0, 0);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    setForm({ tableId: '', customerName: '', phone: '', guestCount: 2, startAt: dateTimeInputValue(start), endAt: dateTimeInputValue(end), depositAmount: 0, depositStatus: 'unpaid', note: '' });
    setShowForm(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/reservations', { ...form, guestCount: Number(form.guestCount), depositAmount: Number(form.depositAmount || 0), startAt: new Date(form.startAt).toISOString(), endAt: new Date(form.endAt).toISOString() });
      setShowForm(false);
      showNotification('Đã tạo lịch đặt bàn', 'success');
      loadReservations();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Không thể tạo lịch đặt bàn', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (reservation, status) => {
    try {
      await api.put(`/reservations/${reservation.id}`, { status });
      showNotification(`Đã cập nhật: ${STATUS_LABELS[status]}`, 'success');
      loadReservations();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Không thể cập nhật lịch đặt bàn', 'error');
    }
  };

  const activeCount = reservations.filter((item) => ['pending', 'confirmed', 'seated'].includes(item.status)).length;

  return (
    <div className="p-5 md:p-6 overflow-y-auto h-full">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div><h2 className="text-lg font-bold text-ink-dark">Lịch đặt bàn</h2><p className="text-sm text-ink-medium">{activeCount} lượt đang hoạt động trong ngày</p></div>
          <div className="flex gap-2"><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="input-field w-auto" /><button onClick={loadReservations} title="Tải lại" className="w-10 h-10 rounded-lg border border-surface-border bg-white flex items-center justify-center text-ink-medium"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button><button onClick={openCreate} className="btn-primary min-h-[40px] flex items-center gap-2"><Plus size={16} /> Đặt bàn</button></div>
        </div>

        <div className="space-y-3">
          {!loading && reservations.length === 0 && <div className="bg-white border border-dashed border-surface-border rounded-lg py-16 text-center text-ink-medium"><CalendarDays size={34} className="mx-auto mb-3 text-ink-light" /><p className="font-semibold">Chưa có lịch đặt bàn trong ngày này</p></div>}
          {reservations.map((reservation) => (
            <article key={reservation.id} className="bg-white border border-surface-border rounded-lg px-4 py-4 flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="w-28 flex-shrink-0"><p className="font-bold text-lg text-ink-dark">{new Date(reservation.startAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p><p className="text-xs text-ink-medium">đến {new Date(reservation.endAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p></div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-ink-dark">{reservation.customerName}</h3><span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${STATUS_CLASSES[reservation.status]}`}>{STATUS_LABELS[reservation.status]}</span></div><div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-ink-medium"><span className="flex items-center gap-1"><Phone size={12} /> {reservation.phone}</span><span className="flex items-center gap-1"><Users size={12} /> {reservation.guestCount} khách</span><span className="flex items-center gap-1"><Clock3 size={12} /> {reservation.table?.name} · {reservation.table?.zone}</span><span className="flex items-center gap-1"><Banknote size={12} /> Cọc {currency(reservation.depositAmount)} · {reservation.depositStatus === 'paid' ? 'đã thu' : reservation.depositStatus === 'refunded' ? 'đã hoàn' : 'chưa thu'}</span></div>{reservation.note && <p className="text-xs text-amber-700 mt-2">Ghi chú: {reservation.note}</p>}</div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {['pending', 'confirmed'].includes(reservation.status) && <button onClick={() => updateStatus(reservation, 'seated')} className="btn-primary min-h-[38px] px-3 flex items-center gap-1.5 text-sm"><UserRoundCheck size={15} /> Nhận bàn</button>}
                {reservation.status === 'seated' && <button onClick={() => updateStatus(reservation, 'completed')} className="btn-secondary min-h-[38px] px-3 flex items-center gap-1.5 text-sm"><CheckCircle2 size={15} /> Hoàn thành</button>}
                {['pending', 'confirmed'].includes(reservation.status) && <button onClick={() => updateStatus(reservation, 'no_show')} className="btn-secondary min-h-[38px] px-3 text-sm">Không đến</button>}
                {['pending', 'confirmed'].includes(reservation.status) && <button onClick={() => updateStatus(reservation, 'cancelled')} title="Hủy lịch" className="w-10 h-10 rounded-lg border border-red-200 bg-red-50 text-red-600 flex items-center justify-center"><XCircle size={16} /></button>}
              </div>
            </article>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[90] bg-slate-950/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}>
          <form onSubmit={save} className="modal-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-lg">
            <header className="px-5 py-4 border-b border-surface-border flex items-center"><div><h3 className="font-bold text-ink-dark">Tạo lịch đặt bàn</h3><p className="text-xs text-ink-medium">Hệ thống sẽ chặn các lịch trùng bàn và thời gian</p></div><button type="button" onClick={() => setShowForm(false)} title="Đóng" className="ml-auto w-9 h-9 rounded-lg hover:bg-surface-muted flex items-center justify-center"><X size={18} /></button></header>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="sm:col-span-2 text-sm font-semibold text-ink-dark">Tên khách<input required maxLength={100} value={form.customerName || ''} onChange={(event) => setForm({ ...form, customerName: event.target.value })} className="input-field mt-1.5" /></label>
              <label className="text-sm font-semibold text-ink-dark">Số điện thoại<input required value={form.phone || ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="input-field mt-1.5" /></label>
              <label className="text-sm font-semibold text-ink-dark">Số khách<input required type="number" min="1" value={form.guestCount || 1} onChange={(event) => setForm({ ...form, guestCount: event.target.value })} className="input-field mt-1.5" /></label>
              <label className="sm:col-span-2 text-sm font-semibold text-ink-dark">Bàn<select required value={form.tableId || ''} onChange={(event) => setForm({ ...form, tableId: event.target.value })} className="input-field mt-1.5"><option value="">Chọn bàn phù hợp</option>{tables.filter((table) => table.capacity >= Number(form.guestCount || 1)).map((table) => <option key={table.id} value={table.id}>{table.name} · {table.zone} · {table.capacity} chỗ</option>)}</select></label>
              <label className="text-sm font-semibold text-ink-dark">Bắt đầu<input required type="datetime-local" value={form.startAt || ''} onChange={(event) => setForm({ ...form, startAt: event.target.value })} className="input-field mt-1.5" /></label>
              <label className="text-sm font-semibold text-ink-dark">Kết thúc<input required type="datetime-local" value={form.endAt || ''} onChange={(event) => setForm({ ...form, endAt: event.target.value })} className="input-field mt-1.5" /></label>
              <label className="text-sm font-semibold text-ink-dark">Tiền cọc<input type="number" min="0" step="1000" value={form.depositAmount || 0} onChange={(event) => setForm({ ...form, depositAmount: event.target.value })} className="input-field mt-1.5" /></label>
              <label className="text-sm font-semibold text-ink-dark">Trạng thái cọc<select value={form.depositStatus || 'unpaid'} onChange={(event) => setForm({ ...form, depositStatus: event.target.value })} className="input-field mt-1.5"><option value="unpaid">Chưa thu</option><option value="paid">Đã thu</option></select></label>
              <label className="sm:col-span-2 text-sm font-semibold text-ink-dark">Ghi chú<textarea rows="2" maxLength={500} value={form.note || ''} onChange={(event) => setForm({ ...form, note: event.target.value })} className="input-field mt-1.5 resize-none" /></label>
            </div>
            <footer className="px-5 py-4 border-t border-surface-border flex gap-3"><button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Hủy</button><button disabled={saving} type="submit" className="btn-primary flex-1 disabled:opacity-60">{saving ? 'Đang lưu...' : 'Tạo lịch'}</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}
