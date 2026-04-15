import { useEffect } from "react";
import { View } from "react-native";
import Markdown from "react-native-markdown-display";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Sparkles } from "~/lib/icons/Sparkles";
import type { Message } from "~/lib/models";
import PlanAttachmentView from "./plan-attachment-view";

interface Props {
  isStreaming?: boolean;
  message: Message;
}

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
          withTiming(0.3, { duration: DOT_DURATION })
        ),
        -1
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

const baseMarkdownStyles = {
  body: { fontSize: 14, lineHeight: 21 },
  paragraph: { marginTop: 0, marginBottom: 6 },
  heading1: {
    fontSize: 18,
    fontWeight: "700" as const,
    marginTop: 8,
    marginBottom: 4,
  },
  heading2: {
    fontSize: 16,
    fontWeight: "700" as const,
    marginTop: 8,
    marginBottom: 4,
  },
  heading3: {
    fontSize: 14,
    fontWeight: "700" as const,
    marginTop: 6,
    marginBottom: 2,
  },
  bullet_list: { marginTop: 2, marginBottom: 6 },
  ordered_list: { marginTop: 2, marginBottom: 6 },
  list_item: { marginBottom: 2 },
  code_inline: {
    fontSize: 13,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  fence: {
    fontSize: 13,
    borderRadius: 6,
    padding: 10,
    marginVertical: 6,
  },
  strong: { fontWeight: "700" as const },
  em: { fontStyle: "italic" as const },
  blockquote: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginVertical: 4,
    opacity: 0.8,
  },
  hr: { marginVertical: 8 },
};

const assistantMarkdownStyles = {
  ...baseMarkdownStyles,
  body: { ...baseMarkdownStyles.body, color: "#f1f5f9" },
  heading1: { ...baseMarkdownStyles.heading1, color: "#f1f5f9" },
  heading2: { ...baseMarkdownStyles.heading2, color: "#f1f5f9" },
  heading3: { ...baseMarkdownStyles.heading3, color: "#f1f5f9" },
  code_inline: {
    ...baseMarkdownStyles.code_inline,
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "#C0FF38",
  },
  fence: {
    ...baseMarkdownStyles.fence,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#C0FF38",
  },
  blockquote: { ...baseMarkdownStyles.blockquote, borderLeftColor: "#C0FF38" },
  hr: { ...baseMarkdownStyles.hr, backgroundColor: "rgba(255,255,255,0.15)" },
};

const userMarkdownStyles = {
  ...baseMarkdownStyles,
  body: { ...baseMarkdownStyles.body, color: "#000" },
  heading1: { ...baseMarkdownStyles.heading1, color: "#000" },
  heading2: { ...baseMarkdownStyles.heading2, color: "#000" },
  heading3: { ...baseMarkdownStyles.heading3, color: "#000" },
  code_inline: {
    ...baseMarkdownStyles.code_inline,
    backgroundColor: "rgba(0,0,0,0.15)",
    color: "#000",
  },
  fence: {
    ...baseMarkdownStyles.fence,
    backgroundColor: "rgba(0,0,0,0.1)",
    color: "#000",
  },
  blockquote: {
    ...baseMarkdownStyles.blockquote,
    borderLeftColor: "rgba(0,0,0,0.4)",
  },
  hr: { ...baseMarkdownStyles.hr, backgroundColor: "rgba(0,0,0,0.2)" },
};

export default function AgentMessageView({ message, isStreaming }: Props) {
  const isUser = message.role === "user";
  const attachment = message.metadata?.attachment;
  const isThinking = !isUser && isStreaming && !message.content.trim();

  return (
    <View
      className={`mb-4 w-full px-4 ${isUser ? "items-end" : "items-start"}`}
    >
      {!isUser && (
        <View className="mb-1.5 h-7 w-7 items-center justify-center rounded-full bg-primary/20">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </View>
      )}
      <View
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "rounded-tr-sm bg-primary"
            : "rounded-tl-sm border border-white/10 bg-card"
        }`}
      >
        {isThinking ? (
          <ThinkingDots />
        ) : isUser ? (
          <Markdown style={userMarkdownStyles}>{message.content}</Markdown>
        ) : (
          <Markdown style={assistantMarkdownStyles}>{message.content}</Markdown>
        )}
      </View>

      {!isUser && attachment?.type === "plan_preview" && (
        <PlanAttachmentView attachment={attachment} />
      )}
    </View>
  );
}
