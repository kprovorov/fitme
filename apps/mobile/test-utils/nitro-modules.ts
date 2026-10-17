// Jest has no native Nitro modules. `react-native-mmkv` only imports this to
// reach the native factory, and swaps in its own in-memory MMKV under Jest
// (`createMMKV` checks `JEST_WORKER_ID`), so nothing here is ever called.
export const NitroModules = {
  createHybridObject: (name: string): never => {
    throw new Error(`Nitro module ${name} isn't available under Jest`);
  },
};
