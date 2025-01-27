import axios from "axios";
import * as SecureStore from "expo-secure-store";

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
});

export const getToken = async () => {
  let token = await SecureStore.getItemAsync("token");
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  }
  return token;
};

export const setToken = async (token: string) => {
  await SecureStore.setItemAsync("token", token);
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
};

export const deleteToken = async () => {
  await SecureStore.deleteItemAsync("token");
  delete api.defaults.headers.common["Authorization"];
};

export type ServerError<T> = {
  message: string;
  errors?: Record<keyof T, string[]>;
};
