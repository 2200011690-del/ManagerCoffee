const DB_NAME = 'CoffeePOS_OfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'offline_orders';

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'tempId' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

export async function saveOfflineOrder(order) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const tempId = 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const timestamp = new Date().toISOString();
    const orderNumber = `HD-OFF-${Date.now()}`;
    const orderWithId = { 
      ...order, 
      tempId, 
      id: tempId, // fallback ID for client keys
      orderNumber,
      timestamp,
      date: new Date().toLocaleDateString('vi-VN'),
      time: new Date().toLocaleTimeString('vi-VN'),
      isOffline: true 
    };
    const request = store.put(orderWithId);

    request.onsuccess = () => resolve(orderWithId);
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineOrders() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteOfflineOrder(tempId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(tempId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
