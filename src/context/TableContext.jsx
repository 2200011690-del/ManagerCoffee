import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { socket } from '../socket';
import { useAuth } from './AuthContext';

const TableContext = createContext(null);
const TABLES_CACHE_PREFIX = 'cached_tables_list';

function tablesCacheKey(storeId) {
  return `${TABLES_CACHE_PREFIX}:${storeId}`;
}

export function TableProvider({ children }) {
  const { currentUser } = useAuth();
  const storeId = currentUser?.storeId;
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTables = useCallback(async () => {
    if (!storeId) {
      setTables([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const cacheKey = tablesCacheKey(storeId);
    try {
      const data = await api.get('/tables');
      const list = Array.isArray(data) ? data : [];
      setTables(list);
      localStorage.setItem(cacheKey, JSON.stringify(list));
      localStorage.removeItem(TABLES_CACHE_PREFIX);
    } catch (err) {
      console.error('Failed to fetch tables, loading cached version:', err);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setTables(JSON.parse(cached));
      } else {
        setTables([]);
      }
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    setTables([]);
    fetchTables();

    const handleTableUpdated = (updatedTable) => {
      if (updatedTable?.storeId && updatedTable.storeId !== storeId) return;
      setTables((prev) => prev.some((table) => table.id === updatedTable.id)
        ? prev.map((table) => table.id === updatedTable.id ? updatedTable : table)
        : [...prev, updatedTable]);
    };
    const handleTableDeleted = ({ id, storeId: deletedStoreId }) => {
      if (deletedStoreId && deletedStoreId !== storeId) return;
      setTables((prev) => prev.filter((table) => table.id !== id));
    };

    socket.on('tableUpdated', handleTableUpdated);
    socket.on('tableDeleted', handleTableDeleted);
    return () => {
      socket.off('tableUpdated', handleTableUpdated);
      socket.off('tableDeleted', handleTableDeleted);
    };
  }, [fetchTables, storeId]);

  const updateTableStatus = useCallback(async (id, status) => {
    try {
      // optimistic update locally for instant feel
      setTables(prev => prev.map(t => 
        t.id === id 
          ? { ...t, status, occupiedSince: status === 'occupied' ? new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null } 
          : t
      ));
      await api.put(`/tables/${id}`, { status });
    } catch (err) {
      console.error(err);
      fetchTables(); // revert if fail
    }
  }, [fetchTables]);

  const createTable = useCallback(async (data) => {
    try {
      const newTable = await api.post('/tables', data);
      await fetchTables();
      return newTable;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [fetchTables]);

  const updateTable = useCallback(async (id, data) => {
    try {
      const updated = await api.put(`/tables/${id}`, data);
      await fetchTables();
      return updated;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [fetchTables]);

  const deleteTable = useCallback(async (id) => {
    try {
      await api.delete(`/tables/${id}`);
      await fetchTables();
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [fetchTables]);

  const rotateOrderToken = useCallback(async (id) => {
    const updated = await api.post(`/tables/${id}/rotate-order-token`, {});
    setTables((prev) => prev.map((table) => table.id === id ? updated : table));
    return updated;
  }, []);

  const value = { 
    tables, 
    updateTableStatus, 
    createTable, 
    updateTable, 
    deleteTable, 
    rotateOrderToken,
    fetchTables,
    loading 
  };

  return <TableContext.Provider value={value}>{children}</TableContext.Provider>;
}

export function useTable() {
  const ctx = useContext(TableContext);
  if (!ctx) throw new Error('useTable must be used within TableProvider');
  return ctx;
}
