import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft, Check, ClipboardCheck, PackageCheck, Plus,
  RefreshCw, ShoppingCart, Trash2, Truck, X
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import { useUI } from '../context/UIContext';

const formatMoney = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;
const formatDate = (value) => value ? new Date(value).toLocaleDateString('vi-VN') : '-';

const STATUS_META = {
  ordered: ['Chờ nhận', 'bg-amber-50 text-amber-700 border-amber-200'],
  received: ['Đã nhận', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  cancelled: ['Đã hủy', 'bg-slate-100 text-slate-600 border-slate-200'],
  draft: ['Bản nháp', 'bg-blue-50 text-blue-700 border-blue-200'],
  posted: ['Đã ghi sổ', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  pending: ['Chờ nhận', 'bg-amber-50 text-amber-700 border-amber-200'],
};

function StatusBadge({ status }) {
  const [label, className] = STATUS_META[status] || [status, 'bg-slate-100 text-slate-600 border-slate-200'];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Icon size={34} className="mb-3 text-slate-300" />
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5">
      <div className={`max-h-[94vh] w-full overflow-hidden bg-white shadow-2xl sm:rounded-lg ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}>
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={19} />
          </button>
        </div>
        <div className="max-h-[calc(94vh-76px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function LineItemsEditor({ items, setItems, inventory, mode }) {
  const qtyKey = mode === 'purchase' ? 'orderedQty' : 'qty';
  const update = (index, field, value) => setItems(items.map((item, itemIndex) => (
    itemIndex === index ? { ...item, [field]: value } : item
  )));
  const add = () => setItems([...items, { inventoryId: '', [qtyKey]: 1, ...(mode === 'purchase' ? { unitCost: '' } : {}) }]);

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className={`grid gap-3 border-b border-slate-100 pb-3 ${mode === 'purchase' ? 'sm:grid-cols-[1fr_120px_150px_40px]' : 'sm:grid-cols-[1fr_140px_40px]'}`}>
          <label className="text-xs font-semibold text-slate-600">
            Nguyên liệu
            <select className="input-field mt-1" value={item.inventoryId} onChange={(event) => update(index, 'inventoryId', event.target.value)} required>
              <option value="">Chọn nguyên liệu</option>
              {inventory.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id} disabled={items.some((row, rowIndex) => rowIndex !== index && row.inventoryId === ingredient.id)}>
                  {ingredient.name} ({ingredient.qty} {ingredient.unit})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Số lượng
            <input className="input-field mt-1" type="number" min="0.001" step="0.001" value={item[qtyKey]} onChange={(event) => update(index, qtyKey, event.target.value)} required />
          </label>
          {mode === 'purchase' && (
            <label className="text-xs font-semibold text-slate-600">
              Đơn giá
              <input className="input-field mt-1" type="number" min="0" step="1000" value={item.unitCost} onChange={(event) => update(index, 'unitCost', event.target.value)} required />
            </label>
          )}
          <button type="button" onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length === 1} title="Xóa dòng" className="mt-5 flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30">
            <Trash2 size={17} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="btn-secondary flex min-h-[42px] items-center gap-2 px-4 py-2 text-sm">
        <Plus size={16} /> Thêm nguyên liệu
      </button>
    </div>
  );
}

export default function SupplyChainPage() {
  const { currentUser } = useAuth();
  const { inventory, suppliers, fetchInventory, fetchSuppliers } = useInventory();
  const { showNotification } = useUI();
  const [tab, setTab] = useState('purchase');
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [stocktakes, setStocktakes] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [modal, setModal] = useState(null);
  const [poForm, setPoForm] = useState({ supplierId: '', expectedAt: '', note: '' });
  const [poItems, setPoItems] = useState([{ inventoryId: '', orderedQty: 1, unitCost: '' }]);
  const [counts, setCounts] = useState({});
  const [stocktakeNote, setStocktakeNote] = useState('');
  const [transferForm, setTransferForm] = useState({ destinationStoreId: '', note: '' });
  const [transferItems, setTransferItems] = useState([{ inventoryId: '', qty: 1 }]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ordersData, stocktakesData, transfersData, branchesData] = await Promise.all([
        api.get('/purchase-orders'), api.get('/stocktakes'), api.get('/inventory/transfers'), api.get('/branches'),
        fetchInventory(), fetchSuppliers(),
      ]);
      setPurchaseOrders(Array.isArray(ordersData) ? ordersData : []);
      setStocktakes(Array.isArray(stocktakesData) ? stocktakesData : []);
      setTransfers(Array.isArray(transfersData) ? transfersData : []);
      setBranches(Array.isArray(branchesData) ? branchesData : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Không thể tải dữ liệu cung ứng.');
    } finally {
      setLoading(false);
    }
  }, [fetchInventory, fetchSuppliers]);

  useEffect(() => { loadData(); }, [loadData]);

  const destinationBranches = useMemo(() => branches.filter((branch) => !branch.isCurrent && branch.isActive), [branches]);
  const poTotal = useMemo(() => poItems.reduce((sum, item) => sum + Number(item.orderedQty || 0) * Number(item.unitCost || 0), 0), [poItems]);

  const openStocktake = () => {
    setCounts(Object.fromEntries(inventory.map((item) => [item.id, item.qty])));
    setStocktakeNote('');
    setModal('stocktake');
  };

  const runAction = async (id, action, successMessage) => {
    setBusyId(`${id}:${action}`);
    try {
      await api.post(`${action.includes('transfer') ? '/inventory/transfers' : action.includes('stocktake') ? '/stocktakes' : '/purchase-orders'}/${id}/${action.split(':')[1]}`);
      showNotification(successMessage);
      await loadData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Thao tác không thành công.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const submitPurchase = async (event) => {
    event.preventDefault();
    setBusyId('create-purchase');
    try {
      await api.post('/purchase-orders', {
        ...poForm,
        supplierId: poForm.supplierId || null,
        expectedAt: poForm.expectedAt ? new Date(`${poForm.expectedAt}T12:00:00`).toISOString() : null,
        items: poItems.map((item) => ({ inventoryId: item.inventoryId, orderedQty: Number(item.orderedQty), unitCost: Number(item.unitCost) })),
      });
      setModal(null);
      setPoForm({ supplierId: '', expectedAt: '', note: '' });
      setPoItems([{ inventoryId: '', orderedQty: 1, unitCost: '' }]);
      showNotification('Đã tạo đơn mua hàng.');
      await loadData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Không thể tạo đơn mua hàng.', 'error');
    } finally { setBusyId(''); }
  };

  const submitStocktake = async (event) => {
    event.preventDefault();
    setBusyId('create-stocktake');
    try {
      await api.post('/stocktakes', {
        note: stocktakeNote,
        counts: inventory.map((item) => ({ inventoryId: item.id, countedQty: Number(counts[item.id]) })),
      });
      setModal(null);
      showNotification('Đã lưu phiếu kiểm kê nháp.');
      await loadData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Không thể tạo phiếu kiểm kê.', 'error');
    } finally { setBusyId(''); }
  };

  const submitTransfer = async (event) => {
    event.preventDefault();
    setBusyId('create-transfer');
    try {
      await api.post('/inventory/transfers', {
        ...transferForm,
        items: transferItems.map((item) => ({ inventoryId: item.inventoryId, qty: Number(item.qty) })),
      });
      setModal(null);
      setTransferForm({ destinationStoreId: '', note: '' });
      setTransferItems([{ inventoryId: '', qty: 1 }]);
      showNotification('Đã tạo phiếu điều chuyển.');
      await loadData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Không thể tạo phiếu điều chuyển.', 'error');
    } finally { setBusyId(''); }
  };

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Cung ứng và kho</h1>
            <p className="page-subtitle">Đơn mua hàng, kiểm kê và điều chuyển giữa các chi nhánh.</p>
          </div>
          <button type="button" onClick={loadData} disabled={loading} className="btn-secondary flex min-h-[44px] items-center justify-center gap-2 px-4">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Làm mới
          </button>
        </div>

        <div className="tab-strip w-full sm:w-fit">
          {[
            ['purchase', ShoppingCart, 'Đơn mua hàng'],
            ['stocktake', ClipboardCheck, 'Kiểm kê'],
            ['transfer', ArrowRightLeft, 'Điều chuyển'],
          ].map(([id, Icon, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`tab-button flex flex-1 items-center justify-center gap-2 sm:flex-none ${tab === id ? 'tab-button-active' : 'tab-button-inactive'}`}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {tab === 'purchase' && (
          <section className="panel-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-bold text-slate-900">Đơn mua hàng</h2><p className="text-sm text-slate-500">Theo dõi giá trị và trạng thái nhận hàng.</p></div>
              <button type="button" onClick={() => setModal('purchase')} disabled={inventory.length === 0} className="btn-primary flex min-h-[42px] items-center justify-center gap-2 px-4 py-2 text-sm"><Plus size={17} /> Lập đơn mua</button>
            </div>
            {loading ? <div className="p-12 text-center text-sm text-slate-500">Đang tải...</div> : purchaseOrders.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="Chưa có đơn mua hàng" description="Lập đơn để kiểm soát hàng đặt, nhà cung cấp, giá nhập và thời điểm nhận." />
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Mã phiếu</th><th className="px-4 py-3">Nhà cung cấp</th><th className="px-4 py-3">Ngày dự kiến</th><th className="px-4 py-3">Mặt hàng</th><th className="px-4 py-3 text-right">Tổng tiền</th><th className="px-4 py-3">Trạng thái</th><th className="px-5 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">
                {purchaseOrders.map((order) => <tr key={order.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-semibold text-slate-900">{order.number}</td><td className="px-4 py-4 text-slate-700">{order.supplier?.name || 'Không chỉ định'}</td><td className="px-4 py-4 text-slate-600">{formatDate(order.expectedAt)}</td><td className="px-4 py-4 text-slate-600">{order.items.length} nguyên liệu</td><td className="px-4 py-4 text-right font-semibold">{formatMoney(order.totalAmount)}</td><td className="px-4 py-4"><StatusBadge status={order.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2">{order.status === 'ordered' && <><button type="button" title="Xác nhận nhận hàng" disabled={busyId} onClick={() => runAction(order.id, 'purchase:receive', 'Đã nhận hàng và cập nhật tồn kho.')} className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"><PackageCheck size={15} /> Nhận hàng</button><button type="button" title="Hủy phiếu" disabled={busyId} onClick={() => runAction(order.id, 'purchase:cancel', 'Đã hủy đơn mua hàng.')} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"><X size={17} /></button></>}</div></td></tr>)}
              </tbody></table></div>
            )}
          </section>
        )}

        {tab === 'stocktake' && (
          <section className="panel-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Phiếu kiểm kê</h2><p className="text-sm text-slate-500">Chụp tồn hệ thống, đối chiếu số đếm và ghi sổ có kiểm tra xung đột.</p></div><button type="button" onClick={openStocktake} disabled={inventory.length === 0} className="btn-primary flex min-h-[42px] items-center justify-center gap-2 px-4 py-2 text-sm"><Plus size={17} /> Tạo phiếu kiểm kê</button></div>
            {loading ? <div className="p-12 text-center text-sm text-slate-500">Đang tải...</div> : stocktakes.length === 0 ? <EmptyState icon={ClipboardCheck} title="Chưa có phiếu kiểm kê" description="Tạo phiếu để đối chiếu tồn thực tế và lưu vết mọi chênh lệch." /> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Mã phiếu</th><th className="px-4 py-3">Ngày tạo</th><th className="px-4 py-3">Số dòng</th><th className="px-4 py-3 text-right">Tổng chênh lệch</th><th className="px-4 py-3">Trạng thái</th><th className="px-5 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">{stocktakes.map((stocktake) => <tr key={stocktake.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-semibold text-slate-900">{stocktake.number}</td><td className="px-4 py-4 text-slate-600">{formatDate(stocktake.createdAt)}</td><td className="px-4 py-4 text-slate-600">{stocktake.items.length}</td><td className="px-4 py-4 text-right font-semibold">{stocktake.items.reduce((sum, item) => sum + item.variance, 0).toLocaleString('vi-VN')}</td><td className="px-4 py-4"><StatusBadge status={stocktake.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2">{stocktake.status === 'draft' && <><button type="button" disabled={busyId} onClick={() => runAction(stocktake.id, 'stocktake:post', 'Đã ghi sổ kiểm kê.')} className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"><Check size={15} /> Ghi sổ</button><button type="button" title="Hủy phiếu" disabled={busyId} onClick={() => runAction(stocktake.id, 'stocktake:cancel', 'Đã hủy phiếu kiểm kê.')} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"><X size={17} /></button></>}</div></td></tr>)}</tbody></table></div>}
          </section>
        )}

        {tab === 'transfer' && (
          <section className="panel-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Điều chuyển chi nhánh</h2><p className="text-sm text-slate-500">Xuất ở kho nguồn và nhập kho đích trong cùng một giao dịch.</p></div><button type="button" onClick={() => setModal('transfer')} disabled={inventory.length === 0 || destinationBranches.length === 0} className="btn-primary flex min-h-[42px] items-center justify-center gap-2 px-4 py-2 text-sm"><Plus size={17} /> Tạo điều chuyển</button></div>
            {destinationBranches.length === 0 && <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">Cần có ít nhất hai chi nhánh đang hoạt động để tạo điều chuyển.</div>}
            {loading ? <div className="p-12 text-center text-sm text-slate-500">Đang tải...</div> : transfers.length === 0 ? <EmptyState icon={Truck} title="Chưa có phiếu điều chuyển" description="Phiếu điều chuyển giữ số lượng và giá vốn nhất quán giữa hai kho." /> : <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Mã phiếu</th><th className="px-4 py-3">Kho nguồn</th><th className="px-4 py-3"></th><th className="px-4 py-3">Kho nhận</th><th className="px-4 py-3">Số dòng</th><th className="px-4 py-3">Trạng thái</th><th className="px-5 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">{transfers.map((transfer) => <tr key={transfer.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-semibold text-slate-900">{transfer.number}</td><td className="px-4 py-4 text-slate-700">{transfer.sourceStore.name}</td><td className="px-4 py-4 text-slate-400"><ArrowRightLeft size={16} /></td><td className="px-4 py-4 text-slate-700">{transfer.destinationStore.name}</td><td className="px-4 py-4 text-slate-600">{transfer.items.length}</td><td className="px-4 py-4"><StatusBadge status={transfer.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2">{transfer.status === 'pending' && (transfer.sourceStoreId === currentUser.storeId || transfer.destinationStoreId === currentUser.storeId) && <button type="button" disabled={busyId} onClick={() => runAction(transfer.id, 'transfer:receive', 'Đã nhận điều chuyển và cập nhật hai kho.')} className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"><PackageCheck size={15} /> Nhận hàng</button>}{transfer.status === 'pending' && transfer.sourceStoreId === currentUser.storeId && <button type="button" title="Hủy phiếu" disabled={busyId} onClick={() => runAction(transfer.id, 'transfer:cancel', 'Đã hủy phiếu điều chuyển.')} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"><X size={17} /></button>}</div></td></tr>)}</tbody></table></div>}
          </section>
        )}
      </div>

      {modal === 'purchase' && <Modal title="Lập đơn mua hàng" subtitle="Tồn kho chỉ tăng sau khi xác nhận nhận hàng." onClose={() => setModal(null)} wide><form onSubmit={submitPurchase} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Nhà cung cấp<select className="input-field mt-1" value={poForm.supplierId} onChange={(event) => setPoForm({ ...poForm, supplierId: event.target.value })}><option value="">Không chỉ định</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Ngày dự kiến<input className="input-field mt-1" type="date" value={poForm.expectedAt} onChange={(event) => setPoForm({ ...poForm, expectedAt: event.target.value })} /></label></div><LineItemsEditor items={poItems} setItems={setPoItems} inventory={inventory} mode="purchase" /><label className="block text-xs font-semibold text-slate-600">Ghi chú<textarea className="input-field mt-1 min-h-[72px]" maxLength="500" value={poForm.note} onChange={(event) => setPoForm({ ...poForm, note: event.target.value })} /></label><div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs text-slate-500">Tổng giá trị dự kiến</p><p className="text-xl font-bold text-slate-900">{formatMoney(poTotal)}</p></div><button type="submit" disabled={busyId === 'create-purchase'} className="btn-primary min-h-[44px] disabled:opacity-60">{busyId === 'create-purchase' ? 'Đang tạo...' : 'Tạo đơn mua hàng'}</button></div></form></Modal>}

      {modal === 'stocktake' && <Modal title="Kiểm kê tồn kho" subtitle="Số hệ thống được chụp tại thời điểm tạo phiếu." onClose={() => setModal(null)} wide><form onSubmit={submitStocktake} className="space-y-5"><div className="overflow-hidden rounded-lg border border-slate-200"><div className="grid grid-cols-[1fr_100px_120px] bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500"><span>Nguyên liệu</span><span className="text-right">Hệ thống</span><span className="text-right">Thực đếm</span></div><div className="max-h-[48vh] divide-y divide-slate-100 overflow-y-auto">{inventory.map((item) => <div key={item.id} className="grid grid-cols-[1fr_100px_120px] items-center px-4 py-2.5 text-sm"><div><p className="font-medium text-slate-800">{item.name}</p><p className="text-xs text-slate-500">{item.unit}</p></div><span className="text-right text-slate-600">{item.qty}</span><input className="input-field ml-auto w-24 text-right" type="number" min="0" step="0.001" value={counts[item.id] ?? ''} onChange={(event) => setCounts({ ...counts, [item.id]: event.target.value })} required /></div>)}</div></div><label className="block text-xs font-semibold text-slate-600">Ghi chú<textarea className="input-field mt-1 min-h-[68px]" maxLength="500" value={stocktakeNote} onChange={(event) => setStocktakeNote(event.target.value)} /></label><div className="flex justify-end border-t border-slate-200 pt-4"><button type="submit" disabled={busyId === 'create-stocktake'} className="btn-primary min-h-[44px] disabled:opacity-60">{busyId === 'create-stocktake' ? 'Đang lưu...' : 'Lưu phiếu nháp'}</button></div></form></Modal>}

      {modal === 'transfer' && <Modal title="Tạo phiếu điều chuyển" subtitle="Kho chỉ thay đổi khi phiếu được xác nhận nhận hàng." onClose={() => setModal(null)} wide><form onSubmit={submitTransfer} className="space-y-5"><label className="block text-xs font-semibold text-slate-600">Chi nhánh nhận<select className="input-field mt-1" value={transferForm.destinationStoreId} onChange={(event) => setTransferForm({ ...transferForm, destinationStoreId: event.target.value })} required><option value="">Chọn chi nhánh</option>{destinationBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</select></label><LineItemsEditor items={transferItems} setItems={setTransferItems} inventory={inventory} mode="transfer" /><label className="block text-xs font-semibold text-slate-600">Ghi chú<textarea className="input-field mt-1 min-h-[72px]" maxLength="500" value={transferForm.note} onChange={(event) => setTransferForm({ ...transferForm, note: event.target.value })} /></label><div className="flex justify-end border-t border-slate-200 pt-4"><button type="submit" disabled={busyId === 'create-transfer'} className="btn-primary min-h-[44px] disabled:opacity-60">{busyId === 'create-transfer' ? 'Đang tạo...' : 'Tạo phiếu điều chuyển'}</button></div></form></Modal>}
    </div>
  );
}
