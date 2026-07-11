import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const socket = io(URL, {
  autoConnect: false,
});

let joinedStoreId = null;
let authToken = null;

socket.on('connect', () => {
  if (joinedStoreId) {
    socket.emit('joinStore', joinedStoreId);
  }
});

export const joinStore = (storeId, token) => {
  if (!storeId || !token) return;
  const connectionChanged = joinedStoreId !== storeId || authToken !== token;
  joinedStoreId = storeId;
  authToken = token;
  socket.auth = { token };

  if (connectionChanged && socket.connected) {
    socket.disconnect();
  }
  if (!socket.connected) {
    socket.connect();
  }
};

export const leaveStore = () => {
  if (socket.connected) {
    socket.emit('leaveStore');
    socket.disconnect();
  }
  joinedStoreId = null;
  authToken = null;
  socket.auth = {};
};
