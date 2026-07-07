import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { socket } from '../socket';
import { saveOfflineOrder, getOfflineOrders, deleteOfflineOrder, createClientRequestId } from '../utils/db';
import { useAuth } from './AuthContext';

const OrderHistoryContext = createContext(null);
const ORDERS_CACHE_PREFIX = 'cached_orders_list';

function ordersCacheKey(storeId) {
  return `${ORDERS_CACHE_PREFIX}:${storeId}`;
}

function withClientRequestId(orderData) {
  return {
    ...orderData,
    clientRequestId: orderData.clientRequestId || createClientRequestId()
  };
}

export function OrderHistoryProvider({ children }) {
  const { currentUser } = useAuth();
  const storeId = currentUser?.storeId;
  const [orderHistory, setOrderHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!storeId) {
      setOrderHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let onlineOrders = [];
    const cacheKey = ordersCacheKey(storeId);
    try {
      const data = await api.get('/orders');
      onlineOrders = Array.isArray(data) ? data : [];
      localStorage.setItem(cacheKey, JSON.stringify(onlineOrders));
      localStorage.removeItem(ORDERS_CACHE_PREFIX);
    } catch (err) {
      console.error('Lỗi tải hóa đơn từ server, dùng cache:', err);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        onlineOrders = JSON.parse(cached);
      }
    }

    try {
      const offlineOrders = await getOfflineOrders(storeId);
      const onlineRequestIds = new Set(onlineOrders.map(order => order.clientRequestId).filter(Boolean));
      const pendingOfflineOrders = offlineOrders.filter(order => !onlineRequestIds.has(order.clientRequestId));
      const merged = [...pendingOfflineOrders, ...onlineOrders];
      setOrderHistory(merged);
    } catch (dbErr) {
      console.error('Không thể nạp đơn offline:', dbErr);
      setOrderHistory(onlineOrders);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const addOrder = useCallback(async (orderData) => {
    const orderPayload = withClientRequestId({ ...orderData, storeId });

    // Nếu thiết bị mất mạng vật lý
    if (!navigator.onLine) {
      try {
        const offlineOrder = await saveOfflineOrder(orderPayload, storeId);
        setOrderHistory(prev => [offlineOrder, ...prev]);
        return offlineOrder;
      } catch (dbErr) {
        console.error('Lỗi lưu đơn offline:', dbErr);
        throw new Error('Mất mạng và không thể lưu đơn ngoại tuyến vào thiết bị.');
      }
    }

    // Nếu có mạng, thử gửi lên server
    try {
      const newOrder = await api.post('/orders/checkout', orderPayload, {
        headers: { 'Idempotency-Key': orderPayload.clientRequestId }
      });
      return newOrder;
    } catch (err) {
      console.error('Lỗi thanh toán online, thử lưu offline:', err);
      const isNetworkError = !err.response || err.code === 'ERR_NETWORK' || err.message === 'Network Error';
      if (isNetworkError) {
        try {
          const offlineOrder = await saveOfflineOrder(orderPayload, storeId);
          setOrderHistory(prev => [offlineOrder, ...prev]);
          return offlineOrder;
        } catch (dbErr) {
          console.error('Lỗi lưu đơn offline sau lỗi mạng:', dbErr);
        }
      }
      throw err;
    }
  }, [storeId]);

  // Luồng chạy ngầm đồng bộ hóa đơn offline lên server
  const syncOfflineOrders = useCallback(async () => {
    if (!navigator.onLine || !storeId) return;

    try {
      const offlineOrders = await getOfflineOrders(storeId);
      if (offlineOrders.length === 0) return;

      console.log(`Phát hiện ${offlineOrders.length} đơn hàng ngoại tuyến cần đồng bộ...`);

      for (const order of offlineOrders) {
        try {
          // Loại bỏ thông tin ID tạm offline để server sinh ID thật
          const {
            tempId,
            isOffline: _isOffline,
            id: _id,
            timestamp: _timestamp,
            date: _date,
            time: _time,
            orderNumber: _orderNumber,
            storeId: _storeId,
            ...serverData
          } = order;
          const newOrder = await api.post('/orders/checkout', serverData, {
            headers: { 'Idempotency-Key': serverData.clientRequestId }
          });

          // Xóa khỏi IndexedDB cục bộ
          await deleteOfflineOrder(tempId);

          // Cập nhật lại danh sách lịch sử trong RAM
          setOrderHistory(prev => prev.map(o => o.tempId === tempId ? newOrder : o));

          // Báo cho bếp qua socket
          socket.emit('orderCreated', newOrder);

          console.log(`Đã đồng bộ đơn hàng offline ${tempId} thành công lên server.`);
        } catch (syncErr) {
          console.error(`Không thể đồng bộ đơn ${order.tempId}:`, syncErr);
          // Dừng vòng lặp đồng bộ nếu có lỗi mạng tiếp theo
          break;
        }
      }
    } catch (err) {
      console.error('Lỗi trong tiến trình chạy ngầm đồng bộ đơn:', err);
    }
  }, [storeId]);

  useEffect(() => {
    setOrderHistory([]);
    fetchOrders();

    const handleOrderCreated = (order) => {
      if (order?.storeId && order.storeId !== storeId) return;
      // Tránh trùng lặp đơn vừa được đồng bộ
      setOrderHistory(prev => {
        if (prev.some(o => o.id === order.id || o.orderNumber === order.orderNumber || (order.clientRequestId && o.clientRequestId === order.clientRequestId))) {
          return prev;
        }
        return [order, ...prev];
      });
    };

    socket.on('orderCreated', handleOrderCreated);

    // Đồng bộ ngay khi khởi động app
    syncOfflineOrders();

    // Đăng ký sự kiện mạng online
    window.addEventListener('online', syncOfflineOrders);

    // Chu kỳ quét định kỳ 30s
    const interval = setInterval(syncOfflineOrders, 30000);

    return () => {
      socket.off('orderCreated', handleOrderCreated);
      window.removeEventListener('online', syncOfflineOrders);
      clearInterval(interval);
    };
  }, [fetchOrders, syncOfflineOrders, storeId]);

  const clearHistory = useCallback(() => {
    // logic tùy chọn
  }, []);

  const value = { orderHistory, fetchOrders, addOrder, clearHistory, loading };

  return (
    <OrderHistoryContext.Provider value={value}>
      {children}
    </OrderHistoryContext.Provider>
  );
}

export function useOrderHistory() {
  const ctx = useContext(OrderHistoryContext);
  if (!ctx) throw new Error('useOrderHistory must be used within OrderHistoryProvider');
  return ctx;
}
