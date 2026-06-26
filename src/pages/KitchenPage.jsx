import { useState, useEffect, useRef } from 'react';
import { Coffee, Clock, CheckCircle2, Play, AlertCircle, Volume2, VolumeX, LogOut, RefreshCw, ArrowLeft } from 'lucide-react';
import { api } from '../api';
import { socket } from '../socket';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';

// Helper tạo tiếng chuông bíp bíp tổng hợp bằng AudioContext miễn phí
function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Nốt bíp 1
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    gain1.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.1);
    
    // Nốt bíp 2 (sau 0.1s)
    setTimeout(() => {
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gain2.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc2.start();
      osc2.stop(audioCtx.currentTime + 0.15);
    }, 120);

  } catch (err) {
    console.warn('AudioContext blocked or failed:', err);
  }
}

export default function KitchenPage() {
  const { logout, currentUser } = useAuth();
  const { setView } = useUI();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'preparing'
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [time, setTime] = useState(new Date());

  const fetchKitchenOrders = async () => {
    try {
      const data = await api.get('/kitchen/orders');
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Lỗi tải danh sách bếp:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKitchenOrders();
    
    const handleNewOrder = (order) => {
      // Khi có order mới (bất kể paid hay pending), bếp sẽ tải lại danh sách
      fetchKitchenOrders();
      if (soundEnabled) {
        playNotificationSound();
      }
    };

    const handleKitchenOrderUpdated = (order) => {
      // Cập nhật realtime khi thiết bị bếp khác bấm đổi trạng thái
      setOrders(prev => {
        const index = prev.findIndex(o => o.id === order.id);
        if (index === -1) {
          // Nếu chuyển từ completed sang pending/preparing (ví dụ admin reset)
          if (order.prepStatus !== 'completed') {
            return [...prev, order].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
          }
          return prev;
        }
        if (order.prepStatus === 'completed') {
          // Xóa khỏi danh sách bếp nếu đã làm xong
          return prev.filter(o => o.id !== order.id);
        }
        // Cập nhật trạng thái mới
        const copy = [...prev];
        copy[index] = order;
        return copy;
      });
    };

    socket.on('orderCreated', handleNewOrder);
    socket.on('kitchenOrderUpdated', handleKitchenOrderUpdated);
    
    // Đồng bộ lại mỗi 30s để cập nhật thời gian trôi qua chính xác
    const interval = setInterval(() => {
      setTime(new Date());
    }, 10000);

    return () => {
      socket.off('orderCreated', handleNewOrder);
      socket.off('kitchenOrderUpdated', handleKitchenOrderUpdated);
      clearInterval(interval);
    };
  }, [soundEnabled]);

  const updateStatus = async (orderId, newStatus) => {
    try {
      await api.put(`/kitchen/orders/${orderId}/status`, { prepStatus: newStatus });
      // State sẽ tự động cập nhật thông qua sự kiện socket kitchenOrderUpdated
    } catch (err) {
      alert('Không thể cập nhật trạng thái bếp: ' + (err.response?.data?.error || err.message));
    }
  };

  // Tính thời gian chờ dạng văn bản
  const getWaitingTime = (timestamp) => {
    const diffMs = time.getTime() - new Date(timestamp).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Vừa xong';
    return `${diffMins} phút trước`;
  };

  // Màu sắc cảnh báo thời gian chờ
  const getWaitingColor = (timestamp) => {
    const diffMs = time.getTime() - new Date(timestamp).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins >= 15) return 'text-red-500 font-bold animate-pulse'; // Chờ lâu >15 phút
    if (diffMins >= 8) return 'text-yellow-500 font-semibold'; // Chờ vừa >8 phút
    return 'text-slate-400';
  };

  const filteredOrders = orders.filter(o => {
    if (filter === 'pending') return o.prepStatus === 'pending';
    if (filter === 'preparing') return o.prepStatus === 'preparing';
    return true;
  });

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans">
      
      {/* KDS Navigation Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center text-white">
            <Coffee size={22} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight uppercase tracking-wider text-white">
              {currentUser?.store?.name || 'Manager Coffee'} - Quầy Bếp / Pha chế
            </h1>
            <p className="text-xs text-slate-400">Hệ thống hiển thị và quản lý đơn hàng bếp realtime</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-mono text-base font-bold text-white">
              {time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              {time.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}
            </p>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${
              soundEnabled
                ? 'bg-slate-800 border-slate-700 text-primary-400'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
            title={soundEnabled ? 'Tắt âm báo đơn mới' : 'Mở âm báo đơn mới'}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {currentUser && (currentUser.role === 'admin' || currentUser.role === 'staff') && (
            <button
              onClick={() => setView('pos')}
              className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-center transition-all"
              title="Quay lại bán hàng (POS)"
            >
              <ArrowLeft size={18} />
            </button>
          )}

          <button
            onClick={logout}
            className="w-10 h-10 rounded-xl bg-red-950/40 border border-red-900/40 text-red-400 hover:bg-red-900 hover:text-white flex items-center justify-center transition-all"
            title="Đăng xuất khỏi quầy bếp"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Filters Bar */}
      <section className="bg-slate-900/50 border-b border-slate-900 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex gap-2">
          {['all', 'pending', 'preparing'].map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                filter === tab
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/10'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {tab === 'all' && `Tất cả (${orders.length})`}
              {tab === 'pending' && `Chờ làm (${orders.filter(o => o.prepStatus === 'pending').length})`}
              {tab === 'preparing' && `Đang làm (${orders.filter(o => o.prepStatus === 'preparing').length})`}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">Hiển thị {filteredOrders.length} hóa đơn</p>
      </section>

      {/* Main Grid View */}
      <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
        {loading ? (
          <div className="h-full w-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
              <p className="text-slate-400 font-semibold text-sm">Đang tải danh sách đơn...</p>
            </div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-900 text-slate-600 flex items-center justify-center border border-slate-800">
              <Coffee size={28} />
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-400 text-base">Hiện không có đơn hàng nào!</p>
              <p className="text-xs text-slate-600 mt-1">Khi thu ngân lên đơn nước, thông tin sẽ hiển thị realtime tại đây.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
            {filteredOrders.map(order => (
              <div
                key={order.id}
                className={`bg-slate-900 border rounded-2xl overflow-hidden shadow-xl transition-all flex flex-col ${
                  order.prepStatus === 'preparing'
                    ? 'border-yellow-500/40 shadow-yellow-500/5'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Card Header */}
                <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-primary-400 bg-primary-950/50 border border-primary-900/60 px-2 py-0.5 rounded-md">
                      {order.orderNumber || order.id.substring(0, 8)}
                    </span>
                    <h3 className="font-bold text-white text-sm mt-1">{order.tableName}</h3>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      order.prepStatus === 'preparing'
                        ? 'bg-yellow-950/50 text-yellow-500 border border-yellow-900/60'
                        : 'bg-slate-950/50 text-slate-500 border border-slate-800'
                    }`}>
                      {order.prepStatus === 'preparing' ? 'Đang làm' : 'Đang chờ'}
                    </span>
                    <p className={`text-xs mt-1.5 flex items-center gap-1 justify-end ${getWaitingColor(order.timestamp)}`}>
                      <Clock size={12} />
                      {getWaitingTime(order.timestamp)}
                    </p>
                  </div>
                </div>

                {/* Items List */}
                <div className="p-4 flex-1 space-y-3">
                  {order.items.map((item, i) => (
                    <div key={i} className="pb-2 border-b border-slate-800/50 last:border-0 last:pb-0 text-sm">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-white leading-tight flex-1">{item.name}</span>
                        <span className="font-mono font-bold text-yellow-500 text-base ml-3 bg-yellow-500/10 px-2 rounded-md">
                          x{item.qty}
                        </span>
                      </div>
                      {/* Customizations / Note */}
                      {(item.sugar !== '100%' || item.ice !== 'Nhiều đá' || item.note) && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {item.sugar !== '100%' && (
                            <span className="text-[10px] font-semibold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                              Đường {item.sugar}
                            </span>
                          )}
                          {item.ice !== 'Nhiều đá' && (
                            <span className="text-[10px] font-semibold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                              Đá: {item.ice}
                            </span>
                          )}
                          {item.note && (
                            <span className="text-[10px] font-bold bg-red-950/50 text-red-400 border border-red-900/40 px-1.5 py-0.5 rounded w-full mt-0.5">
                              ⚠️ Chú ý: {item.note}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* Order level note */}
                  {order.discountReason && (
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400">
                      <strong>Ghi chú:</strong> {order.discountReason}
                    </div>
                  )}
                </div>

                {/* Action Footer */}
                <div className="p-3 bg-slate-900/40 border-t border-slate-800 flex gap-2">
                  {order.prepStatus === 'pending' ? (
                    <button
                      onClick={() => updateStatus(order.id, 'preparing')}
                      className="w-full min-h-[40px] bg-yellow-600 hover:bg-yellow-700 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all"
                    >
                      <Play size={14} className="fill-slate-950" />
                      BẮT ĐẦU PHA CHẾ
                    </button>
                  ) : (
                    <button
                      onClick={() => updateStatus(order.id, 'completed')}
                      className="w-full min-h-[40px] bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all"
                    >
                      <CheckCircle2 size={14} />
                      HOÀN THÀNH ĐỒ UỐNG
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
