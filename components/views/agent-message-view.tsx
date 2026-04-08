import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Text } from "~/components/ui/text";
import { Sparkles } from "~/lib/icons/Sparkles";
import type { Message } from "~/lib/models";
import PlanAttachmentView from "./plan-attachment-view";

type Props = {
  message: Message;
  isStreaming?: boolean;
};

const DOT_SIZE = 7;
const DOT_DURATION = 450;

const dotStyle = {
  width: DOT_SIZE,
  height: DOT_SIZE,
  borderRadius: DOT_SIZE / 2,
  backgroundColor: "rgba(160, 160, 170, 0.9)",
};

function ThinkingDots() {
  const op1 = useSharedValue(0.3);
  const op2 = useSharedValue(0.3);
  const op3 = useSharedValue(0.3);

  useEffect(() => {
    const seq = () =>
      withRepeat(
        withSequence(
          withTiming(1, { duration: DOT_DURATION }),
          withTiming(0.3, { duration: DOT_DURATION }),
        ),
        -1,
      );
    op1.value = seq();
    op2.value = withDelay(DOT_DURATION / 3, seq());
    op3.value = withDelay((DOT_DURATION * 2) / 3, seq());
  }, [op1, op2, op3]);

  const s1 = useAnimatedStyle(() => ({ opacity: op1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: op2.value }));
  const s3 = useAnimatedStyle(() => ({ opacity: op3.value }));

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 5,
        alignItems: "center",
        paddingVertical: 2,
      }}
    >
      <Animated.View style={[dotStyle, s1]} />
      <Animated.View style={[dotStyle, s2]} />
      <Animated.View style={[dotStyle, s3]} />
    </View>
  );
}

export default function AgentMessageView({ message, isStreaming }: Props) {
  const isUser = message.role === "user";
  const attachment = message.metadata?.attachment;
  const isThinking = !isUser && isStreaming && !message.content.trim();

  return (
    <View
      className={`w-full mb-4 px-4 ${isUser ? "items-end" : "items-start"}`}
    >
      {!isUser && (
        <View className="w-7 h-7 rounded-full bg-primary/20 items-center justify-center mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </View>
      )}
      <View
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-primary rounded-tr-sm"
            : "bg-card border border-white/10 rounded-tl-sm"
        }`}
      >
        {isThinking ? (
          <ThinkingDots />
        ) : (
          <Text
            className={`text-sm leading-relaxed ${
              isUser ? "text-primary-foreground" : "text-foreground"
            }`}
          >
            {message.content}
          </Text>
        )}
      </View>

      {!isUser && attachment?.type === "plan_preview" && (
        <PlanAttachmentView attachment={attachment} />
      )}
    </View>
  );
}
