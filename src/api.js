import axios from 'axios';

const API_URL = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  try {
    const saved = sessionStorage.getItem('manager_coffee_auth_session');
    if (saved) {
      const user = JSON.parse(saved);
      if (user && user.storeId) {
        config.headers['x-store-id'] = user.storeId;
      }
    }
  } catch (err) {}
  return config;
});

// Response interceptor to handle errors globally if needed
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);
