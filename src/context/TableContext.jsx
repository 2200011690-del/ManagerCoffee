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
      setTables(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
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

  const value = { tables, updateTableStatus, loading };

  return <TableContext.Provider value={value}>{children}</TableContext.Provider>;
}

export function useTable() {
  const ctx = useContext(TableContext);
  if (!ctx) throw new Error('useTable must be used within TableProvider');
  return ctx;
}
