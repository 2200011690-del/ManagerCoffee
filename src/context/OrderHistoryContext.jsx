import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { socket } from '../socket';

const OrderHistoryContext = createContext(null);

export function OrderHistoryProvider({ children }) {
  const [orderHistory, setOrderHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const data = await api.get('/orders');
      setOrderHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    const handleOrderCreated = (order) => {
      setOrderHistory(prev => [order, ...prev]);
    };

    socket.on('orderCreated', handleOrderCreated);
    return () => socket.off('orderCreated', handleOrderCreated);
  }, []);

  const addOrder = useCallback(async (orderData) => {
    try {
      const newOrder = await api.post('/orders/checkout', orderData);
      return newOrder;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, []);

  const clearHistory = useCallback(() => {
    // optional logic to clear history on backend if needed
  }, []);

  const value = { orderHistory, addOrder, clearHistory, loading };

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
