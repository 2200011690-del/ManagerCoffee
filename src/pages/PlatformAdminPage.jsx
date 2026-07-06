import { useEffect, useState } from 'react';
import { Building2, RefreshCw, Search, Shield, Store, ToggleLeft, ToggleRight, Users, ShoppingBag, Activity } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const PLAN_OPTIONS = ['trial', 'starter', 'pro', 'enterprise'];
const STATUS_OPTIONS = ['trial', 'active', 'past_due', 'suspended', 'cancelled'];
const PLAN_LABELS = {
  trial: 'Dùng thử',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise'
};
const STATUS_LABELS = {
  trial: 'Dùng thử',
  active: 'Đang hoạt động',
  past_due: 'Quá hạn',
  suspended: 'Tạm khóa',
  cancelled: 'Đã hủy'
};

export default function PlatformAdminPage() {
  const { currentUser, logout } = useAuth();
  const [overview, setOverview] = useState(null);
  const [stores, setStores] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  const fetchData = async (nextQuery = query) => {
    setLoading(true);
    setError('');
    try {
      const [overviewData, storesData] = await Promise.all([
        api.get('/platform/overview'),
        api.get(`/platform/stores${nextQuery ? `?q=${encodeURIComponent(nextQuery)}` : ''}`)
      ]);
      setOverview(overviewData);
      setStores(Array.isArray(storesData) ? storesData : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Không thể tải dữ liệu quản trị nền tảng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData('');
  }, []);

  const updateStore = async (storeId, patch) => {
    setSavingId(storeId);
    setError('');
    try {
      const updated = await api.put(`/platform/stores/${storeId}`, patch);
      setStores(prev => prev.map(store => (store.id === storeId ? updated : store)));
      const overviewData = await api.get('/platform/overview');
      setOverview(overviewData);
    } catch (err) {
      setError(err.response?.data?.error || 'Không thể cập nhật cửa hàng');
    } finally {
      setSavingId(null);
    }
  };

  const onSearchSubmit = (event) => {
    event.preventDefault();
    fetchData(query);
  };

  const metricCards = [
    { label: 'Tổng cửa hàng', value: overview?.counts?.totalStores ?? 0, icon: Building2 },
    { label: 'Đang hoạt động', value: overview?.counts?.activeStores ?? 0, icon: Store },
    { label: 'Người dùng', value: overview?.counts?.totalUsers ?? 0, icon: Users },
    { label: 'Hóa đơn', value: overview?.counts?.totalOrders ?? 0, icon: ShoppingBag },
    { label: 'API lỗi 5xx', value: overview?.api?.errorResponses ?? 0, icon: Activity },
    { label: 'API chậm', value: overview?.api?.slowRequests ?? 0, icon: Activity }
  ];

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-slate-900">
      <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
            <Shield size={18} />
          </div>
          <div>
            <p className="font-bold text-sm">Quản trị nền tảng</p>
            <p className="text-xs text-slate-500">{currentUser?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchData(query)}
            disabled={loading}
            className="min-h-[38px] px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-bold flex items-center gap-2 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
          <button
            type="button"
            onClick={logout}
            className="min-h-[38px] px-3 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
            {error}
          </div>
        )}

        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {metricCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500 font-semibold">{card.label}</p>
                  <Icon size={16} className="text-slate-400" />
                </div>
                <p className="text-2xl font-bold mt-2">{card.value}</p>
              </div>
            );
          })}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div>
              <h1 className="font-bold text-base">Quản lý cửa hàng</h1>
              <p className="text-xs text-slate-500 mt-0.5">Khóa/mở cửa hàng, đổi gói và trạng thái thuê bao.</p>
            </div>
            <form onSubmit={onSearchSubmit} className="flex gap-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm cửa hàng..."
                  className="min-h-[38px] w-56 rounded-lg border border-slate-200 pl-9 pr-3 text-sm focus:outline-none focus:border-slate-400"
                />
              </div>
              <button className="min-h-[38px] px-3 rounded-lg bg-slate-900 text-white text-xs font-bold">
                Tìm
              </button>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-bold">Cửa hàng</th>
                  <th className="text-left px-4 py-3 font-bold">Gói</th>
                  <th className="text-left px-4 py-3 font-bold">Trạng thái</th>
                  <th className="text-left px-4 py-3 font-bold">Số liệu</th>
                  <th className="text-right px-4 py-3 font-bold">Bật/Tắt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stores.map((store) => (
                  <tr key={store.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 min-w-[220px]">
                      <p className="font-bold text-slate-900">{store.name}</p>
                      <p className="text-xs text-slate-500">{store.code} · {store.phone || 'Chưa có SĐT'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={store.plan || 'trial'}
                        disabled={savingId === store.id}
                        onChange={(event) => updateStore(store.id, { plan: event.target.value })}
                        className="min-h-[34px] rounded-lg border border-slate-200 px-2 text-xs font-semibold bg-white"
                      >
                        {PLAN_OPTIONS.map(plan => <option key={plan} value={plan}>{PLAN_LABELS[plan] || plan}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={store.subscriptionStatus || 'trial'}
                        disabled={savingId === store.id}
                        onChange={(event) => updateStore(store.id, { subscriptionStatus: event.target.value })}
                        className="min-h-[34px] rounded-lg border border-slate-200 px-2 text-xs font-semibold bg-white"
                      >
                        {STATUS_OPTIONS.map(status => <option key={status} value={status}>{STATUS_LABELS[status] || status}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 min-w-[170px]">
                      Người dùng: {store._count?.users ?? 0} · Món: {store._count?.products ?? 0}<br />
                      Hóa đơn: {store._count?.orders ?? 0} · Tích hợp: {store._count?.integrations ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={savingId === store.id}
                        onClick={() => updateStore(store.id, { isActive: !store.isActive })}
                        className={`inline-flex items-center gap-2 min-h-[34px] px-3 rounded-lg text-xs font-bold border disabled:opacity-50 ${
                          store.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {store.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        {store.isActive ? 'Đang bật' : 'Đã khóa'}
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && stores.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500 text-sm" colSpan={5}>
                      Không tìm thấy cửa hàng nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
