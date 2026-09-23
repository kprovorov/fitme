import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import Authenticated from "~/components/authenticated";
import { useColorScheme } from "~/lib/useColorScheme";

const darkTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: "#1F1D20", primary: "#C0FF38" },
};

const lightTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: "#C0FF38" },
};

export default function TabLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <Authenticated>
      <ThemeProvider value={colorScheme === "dark" ? darkTheme : lightTheme}>
        <NativeTabs minimizeBehavior="onScrollDown" tintColor="#C0FF38">
          <NativeTabs.Trigger name="home">
            <NativeTabs.Trigger.Icon
              sf={{ default: "dumbbell", selected: "dumbbell.fill" }}
            />
            <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="history">
            <NativeTabs.Trigger.Icon
              sf={{
                default: "list.clipboard",
                selected: "list.clipboard.fill",
              }}
            />
            <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="coach">
            <NativeTabs.Trigger.Icon
              sf={{
                default: "bubble.left.and.bubble.right",
                selected: "bubble.left.and.bubble.right.fill",
              }}
            />
            <NativeTabs.Trigger.Label>Coach</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="library">
            <NativeTabs.Trigger.Icon
              sf={{
                default: "books.vertical",
                selected: "books.vertical.fill",
              }}
            />
            <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="profile">
            <NativeTabs.Trigger.Icon
              sf={{ default: "person", selected: "person.fill" }}
            />
            <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      </ThemeProvider>
    </Authenticated>
  );
}
