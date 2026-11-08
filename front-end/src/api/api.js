import axios from "axios";
import Constants from "expo-constants";
import { getSession } from "../storage/authStorage";

const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ||
  Constants.expoConfig?.extra?.apiUrl ||
  (__DEV__ && metroHost
    ? `http://${metroHost}:3000/api`
    : "https://ciento-once-v2-api.onrender.com/api");

const expiredListeners = new Set();
export const onSessionExpired = (listener) => {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});
api.interceptors.request.use(async (config) => {
  const s = await getSession();
  if (s?.token) config.headers.Authorization = `Bearer ${s.token}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !String(error.config?.url || "").startsWith("/auth/")
    ) {
      for (const listener of expiredListeners) listener();
    }
    return Promise.reject(error);
  },
);
export const message = (e) =>
  e.response?.data?.mensaje || e.message || "Ocurrió un error";
