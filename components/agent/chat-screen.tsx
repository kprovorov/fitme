import { ThreadPrimitive } from "@assistant-ui/react-native";
import { Composer } from "./composer";
import MessagesList, { MessageListProvider } from "./messages-list";

export function ChatScreen() {
  return (
    <MessageListProvider>
      <ThreadPrimitive.Root style={{ flex: 1 }}>
        <MessagesList />
        <Composer />
      </ThreadPrimitive.Root>
    </MessageListProvider>
  );
}
