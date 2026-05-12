import {
  MessageByIndexProvider,
  type ThreadMessage,
  useAuiEvent,
} from "@assistant-ui/react-native";
import { useAuiState } from "@assistant-ui/store";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import {
  type ComponentType,
  createContext,
  type FC,
  forwardRef,
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
} from "react";
import type { FlatList, FlatListProps } from "react-native";
import { KeyboardGestureArea } from "react-native-keyboard-controller";
import {
  type SharedValue,
  useAnimatedProps,
  useSharedValue,
} from "react-native-reanimated";
import { AssistantMessage, UserMessage } from "./message";

type MessageComponents =
  | {
      Message: ComponentType;
      EditComposer?: ComponentType | undefined;
      UserEditComposer?: ComponentType | undefined;
      AssistantEditComposer?: ComponentType | undefined;
      SystemEditComposer?: ComponentType | undefined;
      UserMessage?: ComponentType | undefined;
      AssistantMessage?: ComponentType | undefined;
      SystemMessage?: ComponentType | undefined;
    }
  | {
      Message?: ComponentType | undefined;
      EditComposer?: ComponentType | undefined;
      UserEditComposer?: ComponentType | undefined;
      AssistantEditComposer?: ComponentType | undefined;
      SystemEditComposer?: ComponentType | undefined;
      UserMessage: ComponentType;
      AssistantMessage: ComponentType;
      SystemMessage?: ComponentType | undefined;
    };

export type ThreadMessagesProps = Omit<
  FlatListProps<ThreadMessage>,
  "data" | "renderItem"
> & {
  components: MessageComponents;
};

interface MessageListContextValue {
  blankSize: SharedValue<number>;
  composerHeight: SharedValue<number>;
  keyboardHeight: SharedValue<number>;
}

const MessageListContext = createContext<MessageListContextValue | null>(null);

export const MessageListProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const blankSize = useSharedValue(0);
  const composerHeight = useSharedValue(0);
  const keyboardHeight = useSharedValue(0);

  return (
    <MessageListContext.Provider
      value={{
        blankSize,
        composerHeight,
        keyboardHeight,
      }}
    >
      {children}
    </MessageListContext.Provider>
  );
};

export const useMessageListContext = (): MessageListContextValue => {
  const ctx = useContext(MessageListContext);
  if (!ctx) {
    throw new Error(
      "useMessageListContext must be used inside MessageListProvider"
    );
  }
  return ctx;
};

const DEFAULT_SYSTEM_MESSAGE = () => null;

const getComponent = (
  components: MessageComponents,
  role: ThreadMessage["role"],
  isEditing: boolean
) => {
  switch (role) {
    case "user":
      if (isEditing) {
        return (
          components.UserEditComposer ??
          components.EditComposer ??
          components.UserMessage ??
          (components.Message as ComponentType)
        );
      }
      return components.UserMessage ?? (components.Message as ComponentType);
    case "assistant":
      if (isEditing) {
        return (
          components.AssistantEditComposer ??
          components.EditComposer ??
          components.AssistantMessage ??
          (components.Message as ComponentType)
        );
      }
      return (
        components.AssistantMessage ?? (components.Message as ComponentType)
      );
    case "system":
      if (isEditing) {
        return (
          components.SystemEditComposer ??
          components.EditComposer ??
          components.SystemMessage ??
          (components.Message as ComponentType)
        );
      }
      return (
        components.SystemMessage ??
        (components.Message as ComponentType) ??
        DEFAULT_SYSTEM_MESSAGE
      );
    default: {
      const _exhaustiveCheck: never = role;
      throw new Error(`Unknown message role: ${_exhaustiveCheck}`);
    }
  }
};

const ThreadMessageComponent: FC<{ components: MessageComponents }> = ({
  components,
}) => {
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);
  const Component = getComponent(components, role, isEditing);

  return <Component />;
};

const ThreadMessageByIndex = memo(
  ({ index, components }: { index: number; components: MessageComponents }) => {
    return (
      <MessageByIndexProvider index={index}>
        <ThreadMessageComponent components={components} />
      </MessageByIndexProvider>
    );
  },
  (prev, next) =>
    prev.index === next.index && prev.components === next.components
);

export const ThreadMessages = forwardRef<
  typeof AnimatedLegendList,
  ThreadMessagesProps
>(({ components, ...flatListProps }, ref) => {
  const messages = useAuiState((s) => s.thread.messages);

  const renderItem = useCallback(
    ({ index }: { item: ThreadMessage; index: number }) => {
      return <ThreadMessageByIndex components={components} index={index} />;
    },

    [components]
  );

  const keyExtractor = useCallback(
    (item: ThreadMessage) => item.id,

    []
  );

  return (
    <AnimatedLegendList
      data={messages as ThreadMessage[]}
      keyExtractor={keyExtractor}
      ref={ref}
      renderItem={renderItem}
      {...flatListProps}
    />
  );
});

export default function MessagesList() {
  const listRef = useRef<FlatList>(null);

  useAuiEvent("composer.send", () => {
    listRef.current?.scrollToEnd();
  });

  const { blankSize, composerHeight, keyboardHeight } = useMessageListContext();

  const animatedProps = useAnimatedProps(() => {
    return {
      contentInset: {
        bottom: blankSize.get() + composerHeight.get() + keyboardHeight.get(),
      },
    };
  });

  return (
    <KeyboardGestureArea
      interpolator="ios"
      style={{ flex: 1 }}
      textInputNativeID="chat-input"
    >
      <ThreadMessages
        animatedProps={animatedProps}
        components={{
          UserMessage,
          AssistantMessage,
        }}
        contentInset={{
          bottom: 500,
        }}
        ref={listRef}
        scrollIndicatorInsets={{
          bottom: 500,
        }}
      />
    </KeyboardGestureArea>
  );
}
