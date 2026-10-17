import { createMMKV } from "react-native-mmkv";

export const storage = createMMKV();

// The devtools sync (`react-query-external-sync`) deletes keys through
// `delete`, which MMKV 4 renamed `remove`. Each method is wrapped by hand: a
// Nitro instance keeps its methods on the prototype, so `{ ...storage }`
// would copy none of them.
export const devToolsStorage = {
  addOnValueChangedListener: (listener: (key: string) => void) =>
    storage.addOnValueChangedListener(listener),
  delete: (key: string) => {
    storage.remove(key);
  },
  getAllKeys: () => storage.getAllKeys(),
  getBoolean: (key: string) => storage.getBoolean(key),
  getNumber: (key: string) => storage.getNumber(key),
  getString: (key: string) => storage.getString(key),
  set: (key: string, value: string | number | boolean) =>
    storage.set(key, value),
};
