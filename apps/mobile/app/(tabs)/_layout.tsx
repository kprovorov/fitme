import { NativeTabs } from "expo-router/native-tabs";
import { ThemeProvider } from "expo-router/react-navigation";
import { useTranslation } from "react-i18next";
import Authenticated from "~/components/authenticated";
import { useNavigationTheme } from "~/hooks/navigation-theme";
import { TAB_TITLE_KEYS } from "~/lib/tabs";

export default function TabLayout() {
  const navigationTheme = useNavigationTheme();
  const { t } = useTranslation();

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
              {t(TAB_TITLE_KEYS["(home)"])}
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
              {t(TAB_TITLE_KEYS.history)}
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
              {t(TAB_TITLE_KEYS.arnold)}
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
              {t(TAB_TITLE_KEYS.library)}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="profile">
            <NativeTabs.Trigger.Icon
              sf={{ default: "person", selected: "person.fill" }}
            />
            <NativeTabs.Trigger.Label>
              {t(TAB_TITLE_KEYS.profile)}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      </ThemeProvider>
    </Authenticated>
  );
}
