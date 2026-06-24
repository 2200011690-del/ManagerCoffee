import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { socket } from '../socket';

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchInventory = async () => {
    try {
      const data = await api.get('/inventory');
      setInventory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();

    const handleInventoryUpdated = (updatedInventory) => {
      setInventory(updatedInventory);
    };

    socket.on('inventoryUpdated', handleInventoryUpdated);
    return () => socket.off('inventoryUpdated', handleInventoryUpdated);
  }, []);

  const deductStock = useCallback((cartItems) => {
    // Inventory is deducted by the backend during checkout.
    // We do nothing locally here.
  }, []);

  const restock = useCallback(async (id, amount) => {
    try {
      await api.put(`/inventory/${id}/restock`, { amount: Number(amount) });
    } catch (err) {
      console.error(err);
    }
  }, []);

  const updateMinQty = useCallback((id, minQty) => {
    // Left for future if we want to update minQty in backend
  }, []);

  const resetInventory = useCallback(async () => {
    try {
      await api.post('/inventory/reset');
      fetchInventory();
    } catch (err) {
      console.error(err);
    }
  }, []);

  const lowStockItems = inventory.filter(i => i.qty <= i.minQty);

  const value = {
    inventory,
    lowStockItems,
    deductStock,
    restock,
    updateMinQty,
    resetInventory,
    loading
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}
