// Axios client with JWT auth: attaches the access token to every
// request and transparently refreshes it on a 401, so components
// never have to think about token expiry.
import axios from "axios";

const API_URL = "http://localhost:8000/api";
const api = axios.create({ baseURL: API_URL });

export function getTokens() {
  return {
    access: localStorage.getItem("access"),
    refresh: localStorage.getItem("refresh"),
  };
}

export function setTokens({ access, refresh }) {
  if (access) localStorage.setItem("access", access);
  if (refresh) localStorage.setItem("refresh", refresh);
}

export function clearTokens() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
}
api.interceptors.request.use((config) => {
  const { access } = getTokens();
  if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});
let refreshPromise = null;
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isUnauthorized = error.response?.status === 401;
    if (isUnauthorized && !original._retry) {
      original._retry = true;
      const { refresh } = getTokens();
      if (!refresh) {
        clearTokens();
        window.location.href = "/login";
        return Promise.reject(error);
      }
      try {
        refreshPromise =
          refreshPromise || axios.post(`${API_URL}/auth/refresh/`, { refresh });
        const { data } = await refreshPromise;
        refreshPromise = null;
        setTokens({ access: data.access });
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch (refreshError) {
        refreshPromise = null;
        clearTokens();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
