import { NativeTabs } from "expo-router/native-tabs";
import { ThemeProvider } from "expo-router/react-navigation";
import { useTranslation } from "react-i18next";
import Authenticated from "~/components/authenticated";
import { useNavigationTheme } from "~/hooks/navigation-theme";
import { getTabSymbol, TAB_TITLE_KEYS } from "~/lib/tabs";

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
            <NativeTabs.Trigger.Icon sf={getTabSymbol("(home)")} />
            <NativeTabs.Trigger.Label>
              {t(TAB_TITLE_KEYS["(home)"])}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="history">
            <NativeTabs.Trigger.Icon sf={getTabSymbol("history")} />
            <NativeTabs.Trigger.Label>
              {t(TAB_TITLE_KEYS.history)}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="arnold">
            <NativeTabs.Trigger.Icon sf={getTabSymbol("arnold")} />
            <NativeTabs.Trigger.Label>
              {t(TAB_TITLE_KEYS.arnold)}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          <NativeTabs.Trigger name="library">
            <NativeTabs.Trigger.Icon sf={getTabSymbol("library")} />
            <NativeTabs.Trigger.Label>
              {t(TAB_TITLE_KEYS.library)}
            </NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        </NativeTabs>
      </ThemeProvider>
    </Authenticated>
  );
}
