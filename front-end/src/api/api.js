import axios from "axios";
import Constants from "expo-constants";
import { getSession } from "../storage/authStorage";

const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
export const API_BASE_URL =
  __DEV__ && metroHost
    ? `http://${metroHost}:3000/api`
    : process.env.EXPO_PUBLIC_API_URL;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});
api.interceptors.request.use(async (config) => {
  const s = await getSession();
  if (s?.token) config.headers.Authorization = `Bearer ${s.token}`;
  return config;
});
export const message = (e) =>
  e.response?.data?.mensaje || e.message || "Ocurrió un error";
