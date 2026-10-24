import { ThemeProvider } from "expo-router/react-navigation";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import Authenticated from "~/components/authenticated";
import { useNavigationTheme } from "~/hooks/navigation-theme";
import { TAB_TITLES } from "~/lib/tabs";

export default function TabLayout() {
  const navigationTheme = useNavigationTheme();

  return (
    <Authenticated>
      <ThemeProvider value={navigationTheme}>
        <NativeTabs
          minimizeBehavior="onScrollDown"
          tintColor={navigationTheme.colors.primary}
        >
          {/* A group, so its index is the app's "/" route. */}
          <NativeTabs.Trigger name="(home)">
            <NativeTabs.Trigger.Icon
              sf={{ default: "dumbbell", selected: "dumbbell.fill" }}
            />
            <NativeTabs.Trigger.Label>
              {TAB_TITLES["(home)"]}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="history">
            <NativeTabs.Trigger.Icon
              sf={{
                default: "list.clipboard",
                selected: "list.clipboard.fill",
              }}
            />
            <NativeTabs.Trigger.Label>
              {TAB_TITLES.history}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="arnold">
            <NativeTabs.Trigger.Icon
              sf={{
                default: "bubble.left.and.bubble.right",
                selected: "bubble.left.and.bubble.right.fill",
              }}
            />
            <NativeTabs.Trigger.Label>
              {TAB_TITLES.arnold}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="library">
            <NativeTabs.Trigger.Icon
              sf={{
                default: "books.vertical",
                selected: "books.vertical.fill",
              }}
            />
            <NativeTabs.Trigger.Label>
              {TAB_TITLES.library}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="profile">
            <NativeTabs.Trigger.Icon
              sf={{ default: "person", selected: "person.fill" }}
            />
            <NativeTabs.Trigger.Label>
              {TAB_TITLES.profile}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      </ThemeProvider>
    </Authenticated>
  );
}
