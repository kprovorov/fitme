import { useSyncExternalStore } from "react";
import { Text } from "react-native";
import type { StreamingStore } from "./streaming-store";

export function StreamingMessage({ store }: { store: StreamingStore }) {
  const text = useSyncExternalStore(store.subscribe, store.get);
  return (
    <Text className="text-body text-foreground leading-[22px]">
      {text || "..."}
      <Text className="opacity-40">{"\u258C"}</Text>
    </Text>
  );
}
