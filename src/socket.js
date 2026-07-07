import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const socket = io(URL, {
  autoConnect: true,
});

let joinedStoreId = null;

socket.on('connect', () => {
  if (joinedStoreId) {
    socket.emit('joinStore', joinedStoreId);
  }
});

export const joinStore = (storeId) => {
  if (!storeId || joinedStoreId === storeId) return;
  if (joinedStoreId) {
    socket.emit('leaveStore', joinedStoreId);
  }
  joinedStoreId = storeId;
  socket.emit('joinStore', storeId);
};

export const leaveStore = () => {
  if (!joinedStoreId) return;
  socket.emit('leaveStore', joinedStoreId);
  joinedStoreId = null;
};
