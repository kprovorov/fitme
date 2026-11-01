import { jest } from "@jest/globals";
import type { NativeAuthConfig } from "~/components/auth/provider-config";

jest.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 0 }));

jest.mock("react-native-keyboard-controller", () =>
  jest.requireActual("react-native-keyboard-controller/jest")
);
jest.mock("react-native-safe-area-context", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  };
});
jest.mock("expo-apple-authentication", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    AppleAuthenticationButton: ({
      accessibilityLabel,
      onPress,
      testID,
      ...props
    }: {
      accessibilityLabel: string;
      onPress: () => void;
      testID: string;
    }) => (
      <Pressable
        {...props}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onPress}
        testID={testID}
      >
        <Text>{accessibilityLabel}</Text>
      </Pressable>
    ),
    AppleAuthenticationButtonStyle: { WHITE: 2 },
    AppleAuthenticationButtonType: { CONTINUE: 2 },
    isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  };
});
jest.mock("~/components/tw", () => ({
  Image:
    jest.requireActual<typeof import("react-native")>("react-native").Image,
}));

let mockProviderConfig: NativeAuthConfig = {
  appleEnabled: false,
  googleEnabled: false,
  googleIosClientId: "",
  googleIosUrlScheme: "",
  googleWebClientId: "",
};
export function setAuthProviderConfig(config: NativeAuthConfig) {
  mockProviderConfig = config;
}
jest.mock("~/components/auth/provider-config", () => ({
  nativeAuthConfig: () => mockProviderConfig,
}));
