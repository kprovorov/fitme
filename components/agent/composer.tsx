import { ComposerPrimitive } from "@assistant-ui/react-native";
import { LiquidGlassView } from "@callstack/liquid-glass";
import { Text } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HStack } from "@/components/ui/hstack";

export function Composer() {
  const { bottom: bottomInset } = useSafeAreaInsets();

  return (
    <KeyboardStickyView className="p-4" offset={{ closed: -bottomInset }}>
      <ComposerPrimitive.Root>
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
