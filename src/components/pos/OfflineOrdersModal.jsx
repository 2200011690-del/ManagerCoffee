import { AlertTriangle, Clock3, RefreshCw, Trash2, WifiOff, X } from 'lucide-react';
import { useOrderHistory } from '../../context/OrderHistoryContext';

export default function OfflineOrdersModal({ onClose }) {
  const {
    offlineQueue,
    conflictedOfflineOrders,
    retryOfflineOrder,
    discardOfflineOrder
  } = useOrderHistory();

  const handleDiscard = async (order) => {
    if (!window.confirm(`Loại bỏ đơn ${order.orderNumber} khỏi hàng đợi offline?`)) return;
    await discardOfflineOrder(order.tempId);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <WifiOff size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Đơn hàng offline</h2>
              <p className="text-xs text-gray-500">
                {offlineQueue.length} đơn chờ · {conflictedOfflineOrders.length} xung đột
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng danh sách đơn offline"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {offlineQueue.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-500">Không có đơn đang chờ đồng bộ</div>
          )}
          {offlineQueue.map((order) => {
            const conflict = order.syncStatus === 'conflict';
            return (
              <div key={order.tempId} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-bold text-gray-900">{order.orderNumber}</p>
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        conflict ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {conflict ? <AlertTriangle size={11} /> : <Clock3 size={11} />}
                        {conflict ? 'Cần xử lý' : 'Đang chờ'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {order.tableName || 'Mang về'} · {(order.cart || []).reduce((sum, item) => sum + Number(item.qty || 0), 0)} món
                    </p>
                    {order.syncError && <p className="mt-2 text-xs font-medium text-red-600">{order.syncError}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {conflict && (
                      <button
                        type="button"
                        onClick={() => retryOfflineOrder(order.tempId)}
                        title="Thử đồng bộ lại"
                        aria-label={`Thử lại đơn ${order.orderNumber}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        <RefreshCw size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDiscard(order)}
                      title="Loại khỏi hàng đợi"
                      aria-label={`Loại bỏ đơn ${order.orderNumber}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
