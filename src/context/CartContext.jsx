import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useUI } from './UIContext';
import { api } from '../api';
import { socket } from '../socket';

const CartContext = createContext(null);

const ACTIVE_TABLE_KEY = 'manager_coffee_active_table';

function loadActiveTable() {
  try {
    const saved = localStorage.getItem(ACTIVE_TABLE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

export function CartProvider({ children }) {
  const { showNotification } = useUI();

  const [tableCarts, setTableCarts] = useState({});
  const [activeTableId, setActiveTableId] = useState(loadActiveTable);
  const [loading, setLoading] = useState(true);

  // Load carts from backend
  useEffect(() => {
    const fetchCarts = async () => {
      try {
        const data = await api.get('/carts');
        setTableCarts(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCarts();

    const handleCartSync = (carts) => {
      setTableCarts(carts);
    };

    socket.on('cartSync', handleCartSync);
    return () => socket.off('cartSync', handleCartSync);
  }, []);

  useEffect(() => {
    localStorage.setItem(ACTIVE_TABLE_KEY, JSON.stringify(activeTableId));
  }, [activeTableId]);

  const TAKEAWAY_KEY = '__takeaway__';
  const cartKey = activeTableId ?? TAKEAWAY_KEY;
  const cart = tableCarts[cartKey] ?? [];

  const VAT_RATE = 0.08;
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const vatAmount = Math.round(subtotal * VAT_RATE);
  const total = subtotal + vatAmount;
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const setSelectedTable = useCallback((tableId) => {
    setActiveTableId(tableId);
  }, []);

  const setTakeaway = useCallback(() => {
    setActiveTableId(null);
  }, []);

  const tableHasCart = useCallback((tableId) => {
    const key = tableId ?? TAKEAWAY_KEY;
    return tableCarts[key] && tableCarts[key].length > 0;
  }, [tableCarts]);

  // Sync a specific cart to backend
  const syncCartToBackend = async (key, newCart) => {
    // optimistic update
    setTableCarts(prev => ({ ...prev, [key]: newCart }));
    try {
      if (newCart.length === 0) {
        await api.delete(`/carts/${key}`);
      } else {
        await api.put(`/carts/${key}`, { cart: newCart });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addToCart = useCallback((product, sugar = '100% đường', ice = '100% đá', note = '', onFirstItem = null) => {
    const newCart = [...cart];
    const existingIndex = newCart.findIndex(
      i => i.id === product.id && i.sugar === sugar && i.ice === ice && i.note === note
    );

    const isFirstItem = newCart.length === 0;

    if (existingIndex > -1) {
      newCart[existingIndex] = { ...newCart[existingIndex], qty: newCart[existingIndex].qty + 1 };
    } else {
      newCart.push({
        ...product,
        cartItemId: `${product.id}-${Date.now()}-${Math.random()}`,
        qty: 1,
        sugar,
        ice,
        note
      });
    }
    syncCartToBackend(cartKey, newCart);
    showNotification(`Đã thêm ${product.name}`);

    // Nếu đây là món đầu tiên được thêm vào bàn, báo cho POSPage để đổi trạng thái bàn
    if (isFirstItem && onFirstItem) {
      onFirstItem();
    }
  }, [cart, cartKey, showNotification]);

  const removeFromCart = useCallback((cartItemId) => {
    const newCart = cart.filter(i => i.cartItemId !== cartItemId);
    syncCartToBackend(cartKey, newCart);
  }, [cart, cartKey]);

  const updateQty = useCallback((cartItemId, delta) => {
    let newCart = [...cart];
    const idx = newCart.findIndex(i => i.cartItemId === cartItemId);
    if (idx === -1) return;

    const currentQty = newCart[idx].qty;
    if (currentQty + delta <= 0) {
      newCart = newCart.filter(i => i.cartItemId !== cartItemId);
    } else {
      newCart[idx] = { ...newCart[idx], qty: currentQty + delta };
    }
    syncCartToBackend(cartKey, newCart);
  }, [cart, cartKey]);

  const clearCart = useCallback(() => {
    syncCartToBackend(cartKey, []);
  }, [cartKey]);

  const clearCurrentCart = useCallback((targetTableId) => {
    const targetKey = targetTableId ?? TAKEAWAY_KEY;
    syncCartToBackend(targetKey, []);
  }, []);

  const value = {
    cart, subtotal, vatAmount, total, cartCount,
    tableCarts, activeTableId, setSelectedTable, setTakeaway, tableHasCart,
    addToCart, removeFromCart, updateQty, clearCart, clearCurrentCart,
    loading
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
