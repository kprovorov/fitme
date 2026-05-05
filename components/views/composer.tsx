import { LiquidGlassView } from "@callstack/liquid-glass";
import type { ReactNode } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Reanimated, {
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HStack } from "~/components/ui/hstack";
import { Spinner } from "~/components/ui/spinner";
import { useComposer } from "~/components/views/composer-context";
import { ArrowRight } from "~/lib/icons/ArrowRight";

const MAX_INPUT_HEIGHT = 120;

export function Composer({ children }: { children: ReactNode }) {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const { setHeight } = useComposer();
  const { height: keyboardHeight, progress } = useReanimatedKeyboardAnimation();

  const animatedStyle = useAnimatedStyle(() => {
    // Base style is `bottom: bottomInset` so the initial render is already correct —
    // no jump before Reanimated fires. When the keyboard opens, translateY compensates
    // for that base offset: target is (keyboardHeight + 8) above screen bottom, so
    // we need to move (keyboardHeight + 8 - bottomInset) upward from the base.
    // keyboardHeight is negative when open, e.g. -336 for a 336px keyboard.
    const openOffset = bottomInset - 8; // cancels the base and adds 8px clearance
    const offset = interpolate(progress.value, [0, 1], [0, openOffset]);
    return {
      transform: [{ translateY: keyboardHeight.value + offset }],
    };
  });

  return (
    <Reanimated.View
      style={[
        { position: "absolute", bottom: bottomInset, left: 0, right: 0 },
        animatedStyle,
      ]}
    >
      <View
        className="p-4"
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      >
        <LiquidGlassView
          colorScheme="dark"
          style={{ borderRadius: 30, overflow: "hidden" }}
        >
          <HStack className="items-end gap-2 px-3 py-2">{children}</HStack>
        </LiquidGlassView>
      </View>
    </Reanimated.View>
  );
}

export function ComposerInput() {
  const { value, onChangeText, onSend, isPending, isStreaming } = useComposer();

  return (
    <TextInput
      className="flex-1 font-nunito-sans-bold text-foreground text-sm"
      editable={!(isPending || isStreaming)}
      multiline
      nativeID="chat-input"
      onChangeText={onChangeText}
      onSubmitEditing={() => onSend()}
      placeholder="Message..."
      returnKeyType="send"
      scrollEnabled
      style={{ maxHeight: MAX_INPUT_HEIGHT, paddingVertical: 11 }}
      value={value}
    />
  );
}

export function ComposerSendButton() {
  const { canSend, isPending, isStreaming, onSend } = useComposer();

  return (
    <Pressable
      className={`mb-1 h-9 w-9 items-center justify-center rounded-full ${
        canSend ? "bg-primary" : "bg-white/10"
      }`}
      disabled={!canSend}
      onPress={() => onSend()}
    >
      {isPending || isStreaming ? (
        <Spinner className="text-muted-foreground" size={16} />
      ) : (
        <ArrowRight
          className={`h-4 w-4 ${
            canSend ? "text-primary-foreground" : "text-white/40"
          }`}
        />
      )}
    </Pressable>
  );
}
