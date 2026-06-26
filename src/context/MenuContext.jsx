import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { socket } from '../socket';

const MenuContext = createContext(null);

export function MenuProvider({ children }) {
  const [menuList, setMenuList] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMenu = async () => {
    try {
      const data = await api.get('/products');
      const list = Array.isArray(data) ? data : [];
      setMenuList(list);
      localStorage.setItem('cached_menu_list', JSON.stringify(list));
    } catch (err) {
      console.error('Failed to fetch menu, loading cached version:', err);
      const cached = localStorage.getItem('cached_menu_list');
      if (cached) {
        setMenuList(JSON.parse(cached));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();

    const handleProductUpdated = ({ action, product, id }) => {
      if (action === 'create') setMenuList(prev => [...prev, product]);
      if (action === 'update') setMenuList(prev => prev.map(p => p.id === product.id ? product : p));
      if (action === 'delete') setMenuList(prev => prev.filter(p => p.id !== id));
    };

    socket.on('productUpdated', handleProductUpdated);
    return () => socket.off('productUpdated', handleProductUpdated);
  }, []);

  const visibleMenu = menuList.filter(i => !i.hidden);

  const addItem = useCallback(async (item) => {
    try {
      const res = await api.post('/products', {
        name: item.name,
        price: Number(item.price),
        category: item.category,
        description: item.description || '',
        image: item.image || 'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=400&q=80',
        popular: false,
        prepTime: '5 phút',
        hidden: false,
      });
      return res;
    } catch (err) {
      console.error(err);
    }
  }, []);

  const updateItem = useCallback(async (id, patch) => {
    try {
      await api.put(`/products/${id}`, patch);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const removeItem = useCallback(async (id) => {
    try {
      await api.delete(`/products/${id}`);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const toggleHidden = useCallback(async (id) => {
    const item = menuList.find(i => i.id === id);
    if (!item) return;
    try {
      await api.put(`/products/${id}`, { hidden: !item.hidden });
    } catch (err) {
      console.error(err);
    }
  }, [menuList]);

  const value = {
    menuList,
    visibleMenu,
    addItem,
    updateItem,
    removeItem,
    toggleHidden,
    loading
  };

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error('useMenu must be used within MenuProvider');
  return ctx;
}
