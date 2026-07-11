const DB_NAME = 'CoffeePOS_OfflineDB';
const DB_VERSION = 2;
const STORE_NAME = 'offline_orders';

export function createClientRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);
}

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      let store;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'tempId' });
      } else {
        store = event.target.transaction.objectStore(STORE_NAME);
      }
      if (!store.indexNames.contains('storeId')) store.createIndex('storeId', 'storeId', { unique: false });
      if (!store.indexNames.contains('syncStatus')) store.createIndex('syncStatus', 'syncStatus', { unique: false });
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

export async function saveOfflineOrder(order, storeId = order.storeId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const clientRequestId = order.clientRequestId || createClientRequestId();
    const tempId = order.tempId || 'offline_' + clientRequestId;
    const timestamp = new Date().toISOString();
    const orderNumber = `HD-OFF-${Date.now()}`;
    const orderWithId = { 
      ...order, 
      storeId,
      clientRequestId,
      tempId, 
      id: tempId, // fallback ID for client keys
      orderNumber,
      timestamp,
      date: new Date().toLocaleDateString('vi-VN'),
      time: new Date().toLocaleTimeString('vi-VN'),
      syncAttempts: order.syncAttempts || 0,
      syncStatus: order.syncStatus || 'pending',
      syncError: order.syncError || null,
      isOffline: true 
    };
    const request = store.put(orderWithId);

    request.onsuccess = () => resolve(orderWithId);
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineOrders(storeId = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const orders = request.result || [];
      const filtered = storeId ? orders.filter(order => order.storeId === storeId) : orders;
      resolve(filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updateOfflineOrder(tempId, patch) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(tempId);
    getRequest.onsuccess = () => {
      if (!getRequest.result) {
        reject(new Error('Không tìm thấy đơn offline'));
        return;
      }
      const updated = { ...getRequest.result, ...patch, updatedAt: new Date().toISOString() };
      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
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
