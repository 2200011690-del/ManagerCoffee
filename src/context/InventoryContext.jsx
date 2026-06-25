import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { socket } from '../socket';

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const [inventory, setInventory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchInventory = useCallback(async () => {
    try {
      const data = await api.get('/inventory');
      setInventory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const data = await api.get('/suppliers');
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const data = await api.get('/inventory/transactions');
      setTransactions(Array.isArray(data) ? data : []);
      return data;
    } catch (err) {
      console.error(err);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchInventory();

    const handleInventoryUpdated = (updatedInventory) => {
      setInventory(updatedInventory);
    };

    socket.on('inventoryUpdated', handleInventoryUpdated);
    return () => socket.off('inventoryUpdated', handleInventoryUpdated);
  }, [fetchInventory]);

  const createIngredient = useCallback(async (data) => {
    try {
      const newItem = await api.post('/inventory', data);
      fetchInventory();
      return newItem;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [fetchInventory]);

  const updateIngredient = useCallback(async (id, data) => {
    try {
      const updatedItem = await api.put(`/inventory/${id}`, data);
      fetchInventory();
      return updatedItem;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [fetchInventory]);

  const deleteIngredient = useCallback(async (id) => {
    try {
      await api.delete(`/inventory/${id}`);
      fetchInventory();
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [fetchInventory]);

  const importStock = useCallback(async (data) => {
    try {
      const transaction = await api.post('/inventory/import', data);
      fetchInventory();
      fetchTransactions();
      return transaction;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [fetchInventory, fetchTransactions]);

  const adjustStock = useCallback(async (data) => {
    try {
      const transaction = await api.post('/inventory/adjust', data);
      fetchInventory();
      fetchTransactions();
      return transaction;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [fetchInventory, fetchTransactions]);

  const resetInventory = useCallback(async () => {
    try {
      await api.post('/inventory/reset');
      fetchInventory();
      fetchSuppliers();
      fetchTransactions();
    } catch (err) {
      console.error(err);
    }
  }, [fetchInventory, fetchSuppliers, fetchTransactions]);

  // Suppliers CRUD
  const createSupplier = useCallback(async (data) => {
    try {
      const newSupplier = await api.post('/suppliers', data);
      fetchSuppliers();
      return newSupplier;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [fetchSuppliers]);

  const updateSupplier = useCallback(async (id, data) => {
    try {
      const updated = await api.put(`/suppliers/${id}`, data);
      fetchSuppliers();
      return updated;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [fetchSuppliers]);

  const deleteSupplier = useCallback(async (id) => {
    try {
      await api.delete(`/suppliers/${id}`);
      fetchSuppliers();
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [fetchSuppliers]);

  // Recipe
  const fetchRecipe = useCallback(async (productId) => {
    try {
      return await api.get(`/products/${productId}/recipe`);
    } catch (err) {
      console.error(err);
      return [];
    }
  }, []);

  const saveRecipe = useCallback(async (productId, ingredients) => {
    try {
      return await api.put(`/products/${productId}/recipe`, { ingredients });
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, []);

  const lowStockItems = inventory.filter(i => i.qty <= i.minQty);

  const value = {
    inventory,
    suppliers,
    transactions,
    lowStockItems,
    fetchInventory,
    fetchSuppliers,
    fetchTransactions,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    importStock,
    adjustStock,
    resetInventory,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    fetchRecipe,
    saveRecipe,
    loading
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}
