import { ThreadPrimitive } from "@assistant-ui/react-native";
import { Composer } from "./composer";
import MessagesList from "./messages-list";

export function ChatScreen() {
  return (
    <ThreadPrimitive.Root style={{ flex: 1 }}>
      <MessagesList />
      <Composer />
    </ThreadPrimitive.Root>
  );
}
