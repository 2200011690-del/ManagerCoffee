import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useUI } from './UIContext';
import { api } from '../api';
import { socket } from '../socket';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

const ACTIVE_TABLE_KEY = 'manager_coffee_active_table';

function activeTableKey(storeId) {
  return `${ACTIVE_TABLE_KEY}:${storeId}`;
}

function loadActiveTable(storeId) {
  if (!storeId) return null;
  try {
    const saved = localStorage.getItem(activeTableKey(storeId));
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

export function CartProvider({ children }) {
  const { showNotification } = useUI();
  const { currentUser } = useAuth();
  const storeId = currentUser?.storeId;

  const [tableCarts, setTableCarts] = useState({});
  const [activeTableId, setActiveTableId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [promotions, setPromotions] = useState([]);
  const [vatRate, setVatRate] = useState(0.08);

  const syncTimeoutRef = useRef({});

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(syncTimeoutRef.current).forEach(clearTimeout);
    };
  }, []);

  const fetchPromotions = async () => {
    try {
      const data = await api.get('/promotions');
      setPromotions(Array.isArray(data) ? data.filter(p => p.isActive) : []);
    } catch (err) {
      console.error('Failed to fetch promotions:', err);
    }
  };

  const fetchStoreSettings = async () => {
    try {
      const data = await api.get('/store/settings');
      const nextVatRate = Number(data?.vatRate);
      setVatRate(Number.isFinite(nextVatRate) && nextVatRate >= 0 ? nextVatRate : 0.08);
    } catch (err) {
      console.error('Failed to fetch store VAT settings:', err);
    }
  };

  useEffect(() => {
    setTableCarts({});
    setActiveTableId(loadActiveTable(storeId));
    setVatRate(0.08);
  }, [storeId]);

  // Load carts & promotions from backend
  useEffect(() => {
    if (!storeId) {
      setTableCarts({});
      setPromotions([]);
      setLoading(false);
      return;
    }

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
    fetchPromotions();
    fetchStoreSettings();

    const handleCartSync = (carts) => {
      setTableCarts(prev => {
        const merged = { ...prev };
        Object.keys(carts).forEach(key => {
          if (!syncTimeoutRef.current[key]) {
            merged[key] = carts[key];
          }
        });
        Object.keys(merged).forEach(key => {
          if (!carts[key] && !syncTimeoutRef.current[key]) {
            delete merged[key];
          }
        });
        return merged;
      });
    };

    socket.on('cartSync', handleCartSync);
    return () => socket.off('cartSync', handleCartSync);
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    localStorage.setItem(activeTableKey(storeId), JSON.stringify(activeTableId));
    localStorage.removeItem(ACTIVE_TABLE_KEY);
  }, [activeTableId, storeId]);

  const TAKEAWAY_KEY = '__takeaway__';
  const cartKey = activeTableId ?? TAKEAWAY_KEY;
  const cart = tableCarts[cartKey] ?? [];

  const getPromoDetails = () => {
    let appliedPromos = [];
    let autoItemDiscounts = {}; // cartItemId -> { amount, name }
    let comboDiscount = 0;
    let buyXGetYDiscount = 0;

    const now = new Date();
    const currentHourMin = now.toTimeString().slice(0, 5); // "HH:MM"

    // 1. Happy Hour
    const happyHourPromos = promotions.filter(p => {
      if (p.type !== 'HAPPY_HOUR') return false;
      const cond = typeof p.conditions === 'string' ? JSON.parse(p.conditions) : p.conditions;
      const inHour = currentHourMin >= cond.startHour && currentHourMin <= cond.endHour;
      let inDate = true;
      if (p.startDate && now < new Date(p.startDate)) inDate = false;
      if (p.endDate && now > new Date(p.endDate)) inDate = false;
      return inHour && inDate;
    });

    if (happyHourPromos.length > 0) {
      const promo = happyHourPromos[0];
      const cond = typeof promo.conditions === 'string' ? JSON.parse(promo.conditions) : promo.conditions;
      const rew = typeof promo.rewards === 'string' ? JSON.parse(promo.rewards) : promo.rewards;
      const discountPct = rew.discountPct || 0;

      cart.forEach(item => {
        if (!cond.productIds || cond.productIds.length === 0 || cond.productIds.includes(item.id)) {
          const itemDiscount = Math.round(item.price * item.qty * (discountPct / 100));
          autoItemDiscounts[item.cartItemId] = {
            amount: itemDiscount,
            name: promo.name
          };
        }
      });
    }

    // 2. Combo
    const comboPromos = promotions.filter(p => {
      if (p.type !== 'COMBO') return false;
      let inDate = true;
      if (p.startDate && now < new Date(p.startDate)) inDate = false;
      if (p.endDate && now > new Date(p.endDate)) inDate = false;
      return inDate;
    });

    let availableProductQtys = {};
    cart.forEach(item => {
      if (!availableProductQtys[item.id]) availableProductQtys[item.id] = 0;
      availableProductQtys[item.id] += item.qty;
    });

    comboPromos.forEach(promo => {
      const cond = typeof promo.conditions === 'string' ? JSON.parse(promo.conditions) : promo.conditions;
      const rew = typeof promo.rewards === 'string' ? JSON.parse(promo.rewards) : promo.rewards;
      const comboProducts = cond.comboProducts;
      const targetComboPrice = rew.comboPrice;

      if (!comboProducts || comboProducts.length < 2) return;

      let numCombos = Infinity;
      comboProducts.forEach(cp => {
        const available = availableProductQtys[cp.productId] || 0;
        const combosPossible = Math.floor(available / cp.qty);
        if (combosPossible < numCombos) {
          numCombos = combosPossible;
        }
      });

      if (numCombos > 0 && numCombos !== Infinity) {
        comboProducts.forEach(cp => {
          availableProductQtys[cp.productId] -= cp.qty * numCombos;
        });

        let normalTotalForCombo = 0;
        comboProducts.forEach(cp => {
          const prod = cart.find(item => item.id === cp.productId);
          if (prod) {
            normalTotalForCombo += prod.price * cp.qty * numCombos;
          }
        });

        const discount = normalTotalForCombo - (targetComboPrice * numCombos);
        if (discount > 0) {
          comboDiscount += discount;
          appliedPromos.push({
            name: promo.name,
            discount
          });
        }
      }
    });

    // 3. Buy X Get Y
    const bxgxPromos = promotions.filter(p => {
      if (p.type !== 'BUY_X_GET_Y') return false;
      let inDate = true;
      if (p.startDate && now < new Date(p.startDate)) inDate = false;
      if (p.endDate && now > new Date(p.endDate)) inDate = false;
      return inDate;
    });

    bxgxPromos.forEach(promo => {
      const cond = typeof promo.conditions === 'string' ? JSON.parse(promo.conditions) : promo.conditions;
      const rew = typeof promo.rewards === 'string' ? JSON.parse(promo.rewards) : promo.rewards;
      const buyProductId = cond.buyProductId;
      const minQty = cond.minQty;
      const getProductId = rew.getProductId;
      const freeQty = rew.freeQty;

      const availableBuy = availableProductQtys[buyProductId] || 0;
      const numTriggers = Math.floor(availableBuy / minQty);

      if (numTriggers > 0) {
        const giftItemsInCart = cart.filter(item => item.id === getProductId);
        let totalGiftQtyInCart = giftItemsInCart.reduce((sum, item) => sum + item.qty, 0);

        const maxFreeQty = freeQty * numTriggers;
        const discountableQty = Math.min(totalGiftQtyInCart, maxFreeQty);

        if (discountableQty > 0) {
          const itemPrice = giftItemsInCart[0].price;
          const discount = itemPrice * discountableQty;
          
          buyXGetYDiscount += discount;
          appliedPromos.push({
            name: promo.name,
            discount
          });
        }
      }
    });

    return {
      autoItemDiscounts,
      comboDiscount,
      buyXGetYDiscount,
      appliedPromos
    };
  };

  const promoDetails = getPromoDetails();

  const subtotalBeforeGlobalDiscounts = cart.reduce((sum, item) => {
    const itemTotal = item.price * item.qty;
    const manualDiscount = item.discount || 0;
    const autoDiscount = promoDetails.autoItemDiscounts[item.cartItemId]?.amount || 0;
    const finalDiscount = manualDiscount > 0 ? manualDiscount : autoDiscount;
    return sum + (itemTotal - finalDiscount);
  }, 0);

  const globalPromoDiscount = promoDetails.comboDiscount + promoDetails.buyXGetYDiscount;
  const subtotal = Math.max(0, subtotalBeforeGlobalDiscounts - globalPromoDiscount);
  const vatAmount = Math.round(subtotal * vatRate);
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

  // Sync a specific cart to backend (debounced)
  const syncCartToBackend = useCallback((key, newCart) => {
    if (syncTimeoutRef.current[key]) {
      clearTimeout(syncTimeoutRef.current[key]);
    }

    syncTimeoutRef.current[key] = setTimeout(async () => {
      try {
        if (newCart.length === 0) {
          await api.delete(`/carts/${key}`);
        } else {
          await api.put(`/carts/${key}`, { cart: newCart });
        }
      } catch (err) {
        console.error('Error syncing cart:', err);
      } finally {
        delete syncTimeoutRef.current[key];
      }
    }, 400); // 400ms debounce
  }, []);

  const addToCart = useCallback((product, sugar = '100% đường', ice = '100% đá', note = '', onFirstItem = null) => {
    const key = activeTableId ?? TAKEAWAY_KEY;
    let isFirstItem = false;

    setTableCarts(prev => {
      const currentCart = prev[key] ?? [];
      isFirstItem = currentCart.length === 0;
      const newCart = [...currentCart];
      const existingIndex = newCart.findIndex(
        i => i.id === product.id && i.sugar === sugar && i.ice === ice && i.note === note
      );

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
      syncCartToBackend(key, newCart);
      return { ...prev, [key]: newCart };
    });

    showNotification(`Đã thêm ${product.name}`);

    console.log('[DEBUG] CartContext: isFirstItem =', isFirstItem, 'hasCallback =', !!onFirstItem);
    if (isFirstItem && onFirstItem) {
      console.log('[DEBUG] CartContext: triggering onFirstItem callback');
      setTimeout(() => {
        onFirstItem();
      }, 0);
    }
  }, [activeTableId, syncCartToBackend, showNotification]);

  const removeFromCart = useCallback((cartItemId) => {
    const key = activeTableId ?? TAKEAWAY_KEY;
    setTableCarts(prev => {
      const currentCart = prev[key] ?? [];
      const newCart = currentCart.filter(i => i.cartItemId !== cartItemId);
      syncCartToBackend(key, newCart);
      return { ...prev, [key]: newCart };
    });
  }, [activeTableId, syncCartToBackend]);

  const updateQty = useCallback((cartItemId, delta) => {
    const key = activeTableId ?? TAKEAWAY_KEY;
    setTableCarts(prev => {
      const currentCart = prev[key] ?? [];
      let newCart = [...currentCart];
      const idx = newCart.findIndex(i => i.cartItemId === cartItemId);
      if (idx === -1) return prev;

      const currentQty = newCart[idx].qty;
      if (currentQty + delta <= 0) {
        newCart = newCart.filter(i => i.cartItemId !== cartItemId);
      } else {
        newCart[idx] = { ...newCart[idx], qty: currentQty + delta };
      }
      syncCartToBackend(key, newCart);
      return { ...prev, [key]: newCart };
    });
  }, [activeTableId, syncCartToBackend]);

  const clearCart = useCallback(() => {
    const key = activeTableId ?? TAKEAWAY_KEY;
    setTableCarts(prev => {
      syncCartToBackend(key, []);
      return { ...prev, [key]: [] };
    });
  }, [activeTableId, syncCartToBackend]);

  const clearCurrentCart = useCallback((targetTableId) => {
    const targetKey = targetTableId ?? TAKEAWAY_KEY;
    setTableCarts(prev => {
      syncCartToBackend(targetKey, []);
      return { ...prev, [targetKey]: [] };
    });
  }, [syncCartToBackend]);

  const applyItemDiscount = useCallback((cartItemId, discountAmount, discountType) => {
    const key = activeTableId ?? TAKEAWAY_KEY;
    setTableCarts(prev => {
      const currentCart = prev[key] ?? [];
      const newCart = currentCart.map(item => 
        item.cartItemId === cartItemId
          ? { ...item, discount: discountAmount, discountType }
          : item
      );
      syncCartToBackend(key, newCart);
      return { ...prev, [key]: newCart };
    });
  }, [activeTableId, syncCartToBackend]);

  const value = {
    cart, subtotal, vatAmount, total, vatRate, cartCount,
    tableCarts, activeTableId, setSelectedTable, setTakeaway, tableHasCart,
    addToCart, removeFromCart, updateQty, clearCart, clearCurrentCart,
    applyItemDiscount,
    loading,
    promotions,
    promoDetails,
    refreshPromotions: fetchPromotions
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
