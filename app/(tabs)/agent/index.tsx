import { AssistantRuntimeProvider } from "@assistant-ui/react-native";
import { ChatScreen, useAppRuntime } from "@/components/agent/chat-runtime";

export default function AgentScreen() {
  const runtime = useAppRuntime();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatScreen />
    </AssistantRuntimeProvider>
  );
}
