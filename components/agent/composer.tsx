import { ComposerPrimitive } from "@assistant-ui/react-native";
import { LiquidGlassView } from "@callstack/liquid-glass";
import { type LayoutChangeEvent, Text } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HStack } from "@/components/ui/hstack";
import { useMessageListContext } from "./messages-list";

export function Composer() {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const { composerHeight } = useMessageListContext();

  return (
    <KeyboardStickyView
      className="p-4"
      offset={{ closed: -bottomInset }}
      style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
    >
      <ComposerPrimitive.Root
        onLayout={(e: LayoutChangeEvent) => {
          composerHeight.set(e.nativeEvent.layout.height);
        }}
      >
        <LiquidGlassView
          colorScheme="dark"
          style={{ borderRadius: 30, overflow: "hidden" }}
        >
          <HStack className="items-center justify-center gap-2 p-2 pl-4">
            <ComposerPrimitive.Input
              multiline
              nativeID="chat-input"
              placeholder="Ask anything..."
              returnKeyType="send"
              scrollEnabled
              style={{ flex: 1, color: "white" }}
            />
            <ComposerPrimitive.Send className="h-8 w-8 items-center justify-center rounded-full bg-primary">
              <Text>↑</Text>
            </ComposerPrimitive.Send>
          </HStack>
        </LiquidGlassView>
      </ComposerPrimitive.Root>
    </KeyboardStickyView>
  );
}
