import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { AssistantRuntimeProvider } from "@assistant-ui/react-native";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { Stack } from "expo-router";
import { ChatScreen } from "@/components/agent/chat-screen";
import { supabase } from "~/lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

export function useAppRuntime() {
  return useChatRuntime({
    transport: new AssistantChatTransport({
      api: `${SUPABASE_URL}/functions/v1/ai-agent`,
      fetch: expoFetch as unknown as typeof globalThis.fetch,
      headers: async () => {
        const { data } = await supabase.auth.getSession();
        return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
}

export default function AgentScreen() {
  const runtime = useAppRuntime();

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: "Agent",
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <AssistantRuntimeProvider runtime={runtime}>
        <ChatScreen />
      </AssistantRuntimeProvider>
    </>
  );
}
