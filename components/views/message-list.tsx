import { KeyboardAvoidingLegendList } from "@legendapp/list/keyboard-test";
import { Pressable, View } from "react-native";
import { KeyboardGestureArea } from "react-native-keyboard-controller";
import { Text } from "~/components/ui/text";
import { H3, Muted } from "~/components/ui/typography";
import AgentMessageView from "~/components/views/agent-message-view";
import { useComposer } from "~/components/views/composer-context";
import { Sparkles } from "~/lib/icons/Sparkles";
import type { MessageAttachment } from "~/lib/models";

export interface LocalMessage {
  content: string;
  created_at: string;
  id: string;
  isNew?: boolean;
  isStreaming?: boolean;
  metadata?: { attachment?: MessageAttachment };
  role: "user" | "assistant";
}

const SUGGESTIONS = [
  "Create a workout plan for me",
  "How am I progressing this week?",
  "What exercises target my core?",
];

function EmptyState({
  onSuggestion,
}: {
  onSuggestion: (text: string) => void;
}) {
  return (
    <View style={{ transform: [{ scaleY: -1 }] }}>
      <View className="items-center gap-6 px-6 py-12">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/20">
          <Sparkles className="h-8 w-8 text-primary" />
        </View>
        <View className="items-center gap-2">
          <H3 className="text-center">How can I help?</H3>
          <Muted className="text-center">
            Ask me about workouts, nutrition, or your fitness goals.
          </Muted>
        </View>
        <View className="w-full gap-3">
          {SUGGESTIONS.map((s) => (
            <Pressable
              className="rounded-2xl border border-white/10 bg-card px-4 py-3"
              key={s}
              onPress={() => onSuggestion(s)}
            >
              <Text className="text-foreground text-sm">{s}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

interface MessageListProps {
  conversationId?: string;
  messages: LocalMessage[];
  onSuggestion: (text: string) => void;
}

export function MessageList({
  conversationId,
  messages,
  onSuggestion,
}: MessageListProps) {
  const { height: composerHeight } = useComposer();

  return (
    <KeyboardGestureArea
      interpolator="ios"
      style={{ flex: 1 }}
      textInputNativeID="chat-input"
    >
      <KeyboardAvoidingLegendList
        alignItemsAtEnd
        contentInset={{ bottom: composerHeight }}
        contentInsetAdjustmentBehavior="automatic"
        data={messages}
        initialScrollAtEnd
        keyboardDismissMode="interactive"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<EmptyState onSuggestion={onSuggestion} />}
        maintainScrollAtEnd
        renderItem={({ item }: { item: LocalMessage }) => (
          <AgentMessageView
            isNew={item.isNew}
            isStreaming={item.isStreaming}
            message={{
              id: item.id,
              conversation_id: conversationId ?? "",
              role: item.role,
              content: item.content,
              created_at: item.created_at,
              metadata: item.metadata,
            }}
          />
        )}
        scrollIndicatorInsets={{ bottom: composerHeight }}
      />
    </KeyboardGestureArea>
  );
}
