import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCSSVariable } from "uniwind";

import { SCROLL_EDGE_EFFECTS } from "~/lib/constants";

const GLASS = isLiquidGlassAvailable();
const IS_ANDROID = process.env.EXPO_OS === "android";

const StackLayout = () => {
  const { t } = useTranslation();
  // SAFETY: The imported design tokens define --color-foreground as a hex color string.
  const appForeground = useCSSVariable("--color-foreground") as string;
  // SAFETY: The imported design tokens define --color-background as a hex color string.
  const appBackground = useCSSVariable("--color-background") as string;

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: GLASS ? "minimal" : "default",
        headerShadowVisible: IS_ANDROID ? false : undefined,
        headerStyle: IS_ANDROID
          ? {
              backgroundColor: appBackground,
            }
          : undefined,
        headerTintColor: appForeground,
        headerTransparent: GLASS,
        scrollEdgeEffects: SCROLL_EDGE_EFFECTS,
      }}
    >
      <Stack.Screen
        dangerouslySingular
        name="index"
        options={{
          animation: "none",
          gestureEnabled: false,
          title: t("arnold.chat"),
        }}
      />

      <Stack.Screen
        name="attachments"
        options={{
          headerLargeTitleShadowVisible: false,
          headerTransparent: GLASS,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          // following https://m3.material.io/components/bottom-sheets/specs
          sheetCornerRadius: IS_ANDROID ? 28 : undefined,
          sheetGrabberVisible: true,
          title: t("arnold.attachments.title"),
        }}
      />

      {/*
        A sent photo, full-screen: it covers the tab bar as well, since it is
        the photo that is being looked at and nothing else. Its own Screen
        sets the transparent header and the title naming the photo.
      */}
      <Stack.Screen
        name="photo-viewer"
        options={{ presentation: "fullScreenModal" }}
      />

      <Stack.Screen
        name="model-picker"
        options={{
          headerLargeTitleShadowVisible: false,
          headerTransparent: GLASS,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetCornerRadius: IS_ANDROID ? 28 : undefined,
          sheetGrabberVisible: true,
          title: t("arnold.model"),
        }}
      />
    </Stack>
  );
};

export default StackLayout;
