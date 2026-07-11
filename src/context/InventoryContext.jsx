import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { socket } from '../socket';
import { useAuth } from './AuthContext';

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const { currentUser } = useAuth();
  const storeId = currentUser?.storeId;
  const activeStoreIdRef = useRef(storeId);
  activeStoreIdRef.current = storeId;
  const [inventory, setInventory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchInventory = useCallback(async () => {
    if (!storeId) {
      setInventory([]);
      setLoading(false);
      return [];
    }
    const requestedStoreId = storeId;
    try {
      const data = await api.get('/inventory');
      const list = Array.isArray(data) ? data : [];
      if (activeStoreIdRef.current === requestedStoreId) setInventory(list);
      return list;
    } catch (err) {
      console.error(err);
      if (activeStoreIdRef.current === requestedStoreId) setInventory([]);
      return [];
    } finally {
      if (activeStoreIdRef.current === requestedStoreId) setLoading(false);
    }
  }, [storeId]);

  const fetchSuppliers = useCallback(async () => {
    if (!storeId) {
      setSuppliers([]);
      return [];
    }
    const requestedStoreId = storeId;
    try {
      const data = await api.get('/suppliers');
      const list = Array.isArray(data) ? data : [];
      if (activeStoreIdRef.current === requestedStoreId) setSuppliers(list);
      return list;
    } catch (err) {
      console.error(err);
      if (activeStoreIdRef.current === requestedStoreId) setSuppliers([]);
      return [];
    }
  }, [storeId]);

  const fetchTransactions = useCallback(async () => {
    if (!storeId) {
      setTransactions([]);
      return [];
    }
    const requestedStoreId = storeId;
    try {
      const data = await api.get('/inventory/transactions');
      const list = Array.isArray(data) ? data : [];
      if (activeStoreIdRef.current === requestedStoreId) setTransactions(list);
      return list;
    } catch (err) {
      console.error(err);
      if (activeStoreIdRef.current === requestedStoreId) setTransactions([]);
      return [];
    }
  }, [storeId]);

  useEffect(() => {
    setInventory([]);
    setSuppliers([]);
    setTransactions([]);
    setLoading(Boolean(storeId));
    fetchInventory();

    const handleInventoryUpdated = (updatedInventory) => {
      const list = Array.isArray(updatedInventory) ? updatedInventory : [];
      if (list.some((item) => item.storeId && item.storeId !== storeId)) return;
      setInventory(list);
    };

    socket.on('inventoryUpdated', handleInventoryUpdated);
    return () => socket.off('inventoryUpdated', handleInventoryUpdated);
  }, [fetchInventory, storeId]);

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
