import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { socket } from '../socket';

const TableContext = createContext(null);

export function TableProvider({ children }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTables = async () => {
    try {
      const data = await api.get('/tables');
      const list = Array.isArray(data) ? data : [];
      setTables(list);
      localStorage.setItem('cached_tables_list', JSON.stringify(list));
    } catch (err) {
      console.error('Failed to fetch tables, loading cached version:', err);
      const cached = localStorage.getItem('cached_tables_list');
      if (cached) {
        setTables(JSON.parse(cached));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();

    const handleTableUpdated = (updatedTable) => {
      setTables(prev => prev.map(t => t.id === updatedTable.id ? updatedTable : t));
    };

    socket.on('tableUpdated', handleTableUpdated);
    return () => socket.off('tableUpdated', handleTableUpdated);
  }, []);

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
  }, []);

  const createTable = useCallback(async (data) => {
    try {
      const newTable = await api.post('/tables', data);
      await fetchTables();
      return newTable;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, []);

  const updateTable = useCallback(async (id, data) => {
    try {
      const updated = await api.put(`/tables/${id}`, data);
      await fetchTables();
      return updated;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, []);

  const deleteTable = useCallback(async (id) => {
    try {
      await api.delete(`/tables/${id}`);
      await fetchTables();
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, []);

  const value = { 
    tables, 
    updateTableStatus, 
    createTable, 
    updateTable, 
    deleteTable, 
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
